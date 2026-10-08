// Block Blitz game server: serves the game files and runs multiplayer rooms over WebSockets.
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { MAPS, generateMap, mapHash } from './public/js/shared/maps.js';
import { WEAPONS, maxHitDamage } from './public/js/shared/weapons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 50; // 20 updates per second
const MINUTE_MS = Number(process.env.MINUTE_MS) || 60000; // only changed for quick testing
const RESPAWN_DELAY = 3000;
const PICKUP_RESPAWN = 18000;
const END_SCREEN_MS = 10000;
const ALLOWED_TIMES = [3, 5, 8, 10, 15];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to avoid confusion

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

const rooms = new Map();
let nextPlayerId = 1;

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

function cleanName(n) {
  const s = String(n || '').replace(/[^\w \-.!?]/g, '').trim().slice(0, 16);
  return s || 'Player';
}

function cleanColor(c) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : '#3b82f6';
}

function pickMap(room) {
  if (room.settings.map === 'random') {
    let i;
    do i = Math.floor(Math.random() * MAPS.length);
    while (MAPS.length > 1 && i === room.mapIndex);
    return i;
  }
  return room.settings.map;
}

function startMatch(room) {
  room.mapIndex = pickMap(room);
  const map = generateMap(room.mapIndex);
  room.pickups = map.pickups.map((p) => ({ ...p, active: true, respawnAt: 0 }));
  room.state = 'playing';
  room.endsAt = Date.now() + room.settings.time * MINUTE_MS;
  for (const p of room.players.values()) {
    p.kills = 0; p.deaths = 0; p.hp = 100; p.dead = false; p.prot = Date.now() + 2000;
  }
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, hp: p.hp, dead: p.dead, pos: p.pos };
}

function matchInfo(room) {
  return {
    code: room.code,
    settings: room.settings,
    mapIndex: room.mapIndex,
    mapHash: mapHash(room.mapIndex),
    state: room.state,
    timeLeft: Math.max(0, (room.state === 'playing' ? room.endsAt : room.nextMatchAt) - Date.now()),
    players: [...room.players.values()].map(publicPlayer),
    pickups: room.pickups.map((p) => ({ id: p.id, type: p.type, x: p.x, y: p.y, z: p.z, active: p.active })),
    hostId: room.hostId,
  };
}

function joinRoom(ws, room, msg) {
  const p = {
    id: nextPlayerId++, ws, room,
    name: cleanName(msg.name), color: cleanColor(msg.color),
    pos: [0, -100, 0], yaw: 0, pitch: 0, w: 'pistol', flags: 0,
    hp: 100, dead: true, deathAt: 0, kills: 0, deaths: 0, lastDmg: 0, prot: 0,
  };
  room.players.set(p.id, p);
  ws.player = p;
  send(ws, { t: 'joined', you: p.id, ...matchInfo(room) });
  broadcast(room, { t: 'pj', p: publicPlayer(p) }, p.id);
  console.log(`[${room.code}] ${p.name} joined (${room.players.size}/${room.settings.maxPlayers})`);
}

function leave(ws) {
  const p = ws.player;
  if (!p) return;
  const room = p.room;
  room.players.delete(p.id);
  ws.player = null;
  broadcast(room, { t: 'pl', id: p.id });
  console.log(`[${room.code}] ${p.name} left`);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    console.log(`[${room.code}] room closed`);
  } else if (room.hostId === p.id) {
    room.hostId = room.players.keys().next().value;
    broadcast(room, { t: 'host', id: room.hostId });
  }
}

function applyDamage(room, attacker, target, dmg, weapon, head) {
  if (target.dead || room.state !== 'playing') return;
  if (Date.now() < target.prot && target !== attacker) return;
  target.hp = Math.max(0, target.hp - dmg);
  target.lastDmg = Date.now();
  broadcast(room, { t: 'dmg', id: target.id, hp: Math.round(target.hp), by: attacker.id, w: weapon });
  if (target.hp <= 0) {
    target.dead = true;
    target.deathAt = Date.now();
    target.deaths++;
    if (attacker !== target) attacker.kills++;
    broadcast(room, { t: 'kill', k: attacker.id, v: target.id, w: weapon, head: !!head });
  }
}

function handle(ws, msg) {
  const p = ws.player;
  switch (msg.t) {
    case 'create': {
      if (p) leave(ws);
      const s = msg.settings || {};
      const time = ALLOWED_TIMES.includes(Number(s.time)) ? Number(s.time) : 5;
      const maxPlayers = Math.min(16, Math.max(2, Math.floor(Number(s.maxPlayers)) || 8));
      let map = s.map === 'random' ? 'random' : Number(s.map);
      if (map !== 'random' && !(map >= 0 && map < MAPS.length)) map = 'random';
      const room = {
        code: makeCode(), settings: { time, maxPlayers, map }, players: new Map(),
        mapIndex: -1, pickups: [], state: 'playing', endsAt: 0, nextMatchAt: 0, hostId: 0,
      };
      startMatch(room);
      rooms.set(room.code, room);
      console.log(`[${room.code}] room created: ${MAPS[room.mapIndex].name}, ${time} min, ${maxPlayers} players`);
      joinRoom(ws, room, msg);
      room.hostId = ws.player.id;
      send(ws, { t: 'host', id: room.hostId });
      break;
    }
    case 'join': {
      if (p) leave(ws);
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: `No room with code "${code}" was found.` });
      if (room.players.size >= room.settings.maxPlayers) return send(ws, { t: 'error', msg: 'That room is full.' });
      joinRoom(ws, room, msg);
      break;
    }
    case 'leave':
      leave(ws);
      break;
    case 'ping':
      send(ws, { t: 'pong', c: msg.c });
      break;
  }
  if (!p || !ws.player) return;
  const room = p.room;
  switch (msg.t) {
    case 's': { // state update
      if (p.dead || !Array.isArray(msg.p)) return;
      const [x, y, z] = msg.p.map(Number);
      if (![x, y, z].every(Number.isFinite)) return;
      p.pos = [x, y, z];
      p.yaw = Number(msg.y) || 0;
      p.pitch = Number(msg.x) || 0;
      if (WEAPONS[msg.w]) p.w = msg.w;
      p.flags = Number(msg.f) | 0;
      break;
    }
    case 'shot': {
      if (p.dead || !WEAPONS[msg.w]) return;
      const out = { t: 'shot', id: p.id, w: msg.w };
      if (Array.isArray(msg.e)) out.e = msg.e.slice(0, 12);
      if (Array.isArray(msg.o)) out.o = msg.o.slice(0, 3);
      if (Array.isArray(msg.d)) out.d = msg.d.slice(0, 3);
      broadcast(room, out, p.id);
      break;
    }
    case 'boom':
      if (Array.isArray(msg.p)) broadcast(room, { t: 'boom', id: p.id, p: msg.p.slice(0, 3) }, p.id);
      break;
    case 'hit': {
      const target = room.players.get(Number(msg.target));
      const dmg = Number(msg.dmg);
      if (!target || !Number.isFinite(dmg) || dmg <= 0) return;
      if (msg.w !== 'lava' && p.dead) return;
      if (msg.w === 'lava' && target !== p) return;
      const dist = Math.hypot(p.pos[0] - target.pos[0], p.pos[1] - target.pos[1], p.pos[2] - target.pos[2]);
      if (dmg > maxHitDamage(msg.w, !!msg.head, dist)) return;
      applyDamage(room, p, target, dmg, msg.w, msg.head);
      break;
    }
    case 'respawn': {
      if (!p.dead || Date.now() - p.deathAt < RESPAWN_DELAY - 300 || room.state !== 'playing') return;
      if (!Array.isArray(msg.p)) return;
      p.dead = false;
      p.hp = 100;
      p.prot = Date.now() + 1500;
      p.pos = msg.p.slice(0, 3).map(Number);
      broadcast(room, { t: 'spawn', id: p.id, p: p.pos });
      break;
    }
    case 'pickup': {
      const pk = room.pickups[Number(msg.id)];
      if (!pk || !pk.active || p.dead) return;
      const dx = p.pos[0] - pk.x, dz = p.pos[2] - pk.z, dy = p.pos[1] - pk.y;
      if (dx * dx + dz * dz > 9 || Math.abs(dy) > 3) return;
      pk.active = false;
      pk.respawnAt = Date.now() + PICKUP_RESPAWN;
      broadcast(room, { t: 'took', id: pk.id, by: p.id, type: pk.type });
      break;
    }
    case 'chat': {
      const text = String(msg.text || '').slice(0, 120).trim();
      if (text) broadcast(room, { t: 'chat', id: p.id, text });
      break;
    }
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg && typeof msg.t === 'string') {
      try { handle(ws, msg); } catch (e) { console.error('Error handling message', e); }
    }
  });
  ws.on('close', () => leave(ws));
});

// Game loop: snapshots, health regen, pickup respawns, match timer.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  for (const room of rooms.values()) {
    if (room.state === 'playing') {
      for (const p of room.players.values()) {
        if (!p.dead && p.hp < 100 && now - p.lastDmg > 5000) p.hp = Math.min(100, p.hp + 12 * dt);
      }
      for (const pk of room.pickups) {
        if (!pk.active && now >= pk.respawnAt) {
          pk.active = true;
          broadcast(room, { t: 'pk', id: pk.id });
        }
      }
      if (now >= room.endsAt) {
        room.state = 'ended';
        room.nextMatchAt = now + END_SCREEN_MS;
        const board = [...room.players.values()].map(publicPlayer).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
        broadcast(room, { t: 'end', board, next: END_SCREEN_MS });
      }
    } else if (room.state === 'ended' && now >= room.nextMatchAt) {
      startMatch(room);
      for (const p of room.players.values()) { p.dead = true; p.deathAt = 0; }
      broadcast(room, { t: 'match', ...matchInfo(room) });
    }
    const ps = [];
    for (const p of room.players.values()) {
      ps.push([p.id, +p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.w, Math.ceil(p.hp), p.dead ? 1 : 0, p.flags, p.kills, p.deaths]);
    }
    broadcast(room, { t: 'snap', ps });
  }
}, TICK_MS);

// Drop dead connections
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

// Start listening. If the port is busy (another program uses it), try the next ones.
let port = PORT;
wss.on('error', () => {}); // listen errors are handled below
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < PORT + 20) {
    console.log(`   Port ${port} is already in use, trying ${port + 1}...`);
    port++;
    setTimeout(() => server.listen(port), 100);
  } else {
    console.error('\n   Could not start the server:', err.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  const url = `http://localhost:${port}`;
  console.log('\n  ===============================================');
  console.log('   BLOCK BLITZ server is running!');
  console.log('  ===============================================');
  console.log(`   On this computer:  ${url}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log(`   Same Wi-Fi/LAN:    http://${ni.address}:${port}`);
    }
  }
  console.log('\n   Share the LAN address with friends on your network.');
  console.log('   KEEP THIS WINDOW OPEN while playing. Press Ctrl+C to stop the server.\n');
  if (process.env.OPEN_BROWSER) {
    const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.listen(port);
