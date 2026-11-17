// The game "server" for one room. It runs inside the browser of the player who created
// the room. Every player (including the host) talks to it through a connection object
// with a send(msg) method.
import { MAPS, generateMap, mapHash } from './shared/maps.js';
import { WEAPONS, maxHitDamage, MAX_HP, HEAL_AMOUNT } from './shared/weapons.js';
import { MODES } from './shared/modes.js';
import { rayBox, playerBoxes } from './shared/voxel.js';
import { navFor } from './shared/nav.js';
import { BotManager, BOT_SKILLS, MAX_BOTS } from './bots.js';
import { BUILD, VERSION_MISMATCH } from './version.js';

const TICK_MS = 50; // 20 updates per second
const RESPAWN_DELAY = 3000;
const PICKUP_RESPAWN = 18000;
const HEALTH_RESPAWN = 22000;
const END_SCREEN_MS = 10000;
const ALLOWED_TIMES = [3, 5, 8, 10, 15];
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to avoid confusion

export function makeCode() {
  const r = new Uint32Array(5);
  crypto.getRandomValues(r);
  return [...r].map((v) => CODE_CHARS[v % CODE_CHARS.length]).join('');
}

function cleanName(n) {
  const s = String(n || '').replace(/[^\w \-.!?]/g, '').trim().slice(0, 16);
  return s || 'Player';
}

function cleanColor(c) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : '#3b82f6';
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, hp: p.hp, dead: p.dead, pos: p.pos, bot: !!p.bot, team: p.team };
}

// A timer that keeps ticking even when the browser tab is in the background
// (normal timers get slowed down to once per second there).
function steadyInterval(fn, ms) {
  try {
    const src = `setInterval(() => postMessage(0), ${ms});`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = fn;
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

export class RoomHost {
  constructor(code, s = {}) {
    const time = ALLOWED_TIMES.includes(Number(s.time)) ? Number(s.time) : 5;
    const maxPlayers = Math.min(16, Math.max(2, Math.floor(Number(s.maxPlayers)) || 8));
    let map = s.map === 'random' ? 'random' : Number(s.map);
    if (map !== 'random' && !(map >= 0 && map < MAPS.length)) map = 'random';
    const bots = Math.min(MAX_BOTS, Math.max(0, Math.floor(Number(s.bots)) || 0));
    const botSkill = s.botSkill in BOT_SKILLS ? s.botSkill : 'normal';
    this.code = code;
    const mode = s.mode in MODES ? s.mode : 'ffa';
    this.settings = { time, maxPlayers, map, bots, botSkill, mode };
    this.teamScore = [0, 0];
    this.players = new Map();
    this.nextId = 1;
    this.mapIndex = -1;
    this.hostId = 0;
    this.bots = new BotManager(this);
    this.startMatch();
    this.bots.sync();
    this.last = Date.now();
    this.stopTimer = steadyInterval(() => this.tick(), TICK_MS);
  }

  destroy() {
    this.stopTimer();
    this.players.clear();
  }

  send(conn, msg) {
    try { conn.send(msg); } catch { /* connection already gone */ }
  }

  broadcast(msg, exceptId) {
    for (const p of this.players.values()) if (p.id !== exceptId) this.send(p.conn, msg);
  }

  pickMap() {
    if (this.settings.map === 'random') {
      let i;
      do i = Math.floor(Math.random() * MAPS.length);
      while (MAPS.length > 1 && i === this.mapIndex);
      return i;
    }
    return this.settings.map;
  }

  get nav() { return navFor(this.map); }

  get teams() { return this.settings.mode === 'tdm'; }

  // In free-for-all everyone else is an enemy; in team games only the other team is.
  isEnemy(a, b) { return a !== b && (!this.teams || a.team !== b.team); }

  // The team that needs a player most (-1 when the mode has no teams).
  smallerTeam() {
    if (!this.teams) return -1;
    const n = [0, 0];
    for (const p of this.players.values()) if (p.team >= 0) n[p.team]++;
    if (n[0] !== n[1]) return n[0] < n[1] ? 0 : 1;
    if (this.teamScore[0] !== this.teamScore[1]) return this.teamScore[0] < this.teamScore[1] ? 0 : 1;
    return Math.random() < 0.5 ? 0 : 1;
  }

  // New match: deal everyone into two even teams, people first so they are split fairly.
  dealTeams() {
    const list = [...this.players.values()].sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0) || Math.random() - 0.5);
    const first = Math.random() < 0.5 ? 0 : 1;
    list.forEach((p, i) => { p.team = this.teams ? (i + first) % 2 : -1; });
  }

  // A spawn point away from the player's enemies.
  chooseSpawn(p) {
    const spawns = this.map.spawns;
    let best = spawns[0], bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      let minD = 60;
      for (const q of this.players.values()) {
        if (q.dead || !this.isEnemy(p, q)) continue;
        minD = Math.min(minD, Math.hypot(q.pos[0] - s[0], q.pos[1] - s[1], q.pos[2] - s[2]));
      }
      const score = minD + Math.random() * 8;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  // What a shot from origin along dir hits first: a wall or a player (used for bots' shots).
  trace(origin, dir, range, shooter) {
    const wh = this.map.world.raycast(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], range);
    let best = wh ? wh.t : range, hitP = null, head = false;
    for (const q of this.players.values()) {
      if (q === shooter || q.dead) continue;
      const bx = playerBoxes(q.pos[0], q.pos[1], q.pos[2]);
      const th = rayBox(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], bx.head.min, bx.head.max);
      if (th >= 0 && th < best) { best = th; hitP = q; head = true; }
      const tb = rayBox(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], bx.body.min, bx.body.max);
      if (tb >= 0 && tb < best) { best = tb; hitP = q; head = false; }
    }
    return { t: best, player: hitP, head, point: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best] };
  }

  // Returns false when the player has no use for it (a health pack at full health).
  takePickup(pk, p) {
    const health = pk.type === 'health';
    if (health) {
      if (p.hp >= MAX_HP) return false;
      p.hp = Math.min(MAX_HP, p.hp + HEAL_AMOUNT);
    }
    pk.active = false;
    pk.respawnAt = Date.now() + (health ? HEALTH_RESPAWN : PICKUP_RESPAWN);
    this.broadcast({ t: 'took', id: pk.id, by: p.id, type: pk.type });
    return true;
  }

  startMatch() {
    this.mapIndex = this.pickMap();
    const map = this.map = generateMap(this.mapIndex);
    this.pickups = map.pickups.map((p) => ({ ...p, active: true, respawnAt: 0 }));
    this.state = 'playing';
    this.endsAt = Date.now() + this.settings.time * 60000;
    this.teamScore = [0, 0];
    this.dealTeams();
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.hp = 100; p.dead = true; p.deathAt = 0; p.prot = 0;
    }
    this.bots.onMatchStart();
  }

  matchInfo() {
    return {
      code: this.code,
      settings: this.settings,
      mapIndex: this.mapIndex,
      mapHash: mapHash(this.mapIndex),
      teamScore: this.teamScore,
      state: this.state,
      timeLeft: Math.max(0, (this.state === 'playing' ? this.endsAt : this.nextMatchAt) - Date.now()),
      players: [...this.players.values()].map(publicPlayer),
      pickups: this.pickups.map((p) => ({ id: p.id, type: p.type, x: p.x, y: p.y, z: p.z, active: p.active })),
      hostId: this.hostId,
    };
  }

  join(conn, msg) {
    if (msg.v !== BUILD) {
      this.send(conn, { t: 'error', msg: VERSION_MISMATCH });
      return false;
    }
    const humans = [...this.players.values()].filter((q) => !q.bot).length;
    if (humans >= this.settings.maxPlayers) {
      this.send(conn, { t: 'error', msg: 'That room is full.' });
      return false;
    }
    if (this.players.size >= this.settings.maxPlayers) this.bots.remove(); // a bot makes room for a person
    const p = this.makePlayer(conn, cleanName(msg.name), cleanColor(msg.color));
    conn.player = p;
    if (!this.hostId) this.hostId = p.id;
    this.players.set(p.id, p);
    this.send(conn, { t: 'joined', you: p.id, v: BUILD, ...this.matchInfo() });
    this.broadcast({ t: 'pj', p: publicPlayer(p) }, p.id);
    return true;
  }

  makePlayer(conn, name, color) {
    return {
      id: this.nextId++, conn, name, color, team: this.smallerTeam(),
      pos: [0, -100, 0], yaw: 0, pitch: 0, w: 'pistol', flags: 0,
      hp: 100, dead: true, deathAt: 0, kills: 0, deaths: 0, lastDmg: 0, prot: 0,
    };
  }

  addPlayer(p) {
    this.players.set(p.id, p);
    this.broadcast({ t: 'pj', p: publicPlayer(p) }, p.id);
  }

  leave(conn) {
    const p = conn.player;
    if (!p) return;
    this.players.delete(p.id);
    conn.player = null;
    this.broadcast({ t: 'pl', id: p.id });
    this.bots.sync();
  }

  applyDamage(attacker, target, dmg, weapon, head) {
    if (target.dead || this.state !== 'playing') return;
    if (target !== attacker && !this.isEnemy(attacker, target)) return; // no friendly fire
    if (Date.now() < target.prot && target !== attacker) return;
    target.hp = Math.max(0, target.hp - dmg);
    target.lastDmg = Date.now();
    this.bots.onDamaged(target, attacker);
    this.broadcast({ t: 'dmg', id: target.id, hp: Math.round(target.hp), by: attacker.id, w: weapon });
    if (target.hp <= 0) {
      target.dead = true;
      target.deathAt = Date.now();
      target.deaths++;
      if (attacker !== target) {
        attacker.kills++;
        if (attacker.team >= 0) this.teamScore[attacker.team]++;
      }
      this.broadcast({ t: 'kill', k: attacker.id, v: target.id, w: weapon, head: !!head });
    }
  }

  handle(conn, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'join') {
      if (!conn.player) this.join(conn, msg);
      return;
    }
    if (msg.t === 'leave') return this.leave(conn);
    const p = conn.player;
    if (!p) return;
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
        this.broadcast(out, p.id);
        break;
      }
      case 'boom':
        if (Array.isArray(msg.p)) this.broadcast({ t: 'boom', id: p.id, p: msg.p.slice(0, 3), n: msg.n }, p.id);
        break;
      case 'nade':
        if (p.dead || !Array.isArray(msg.o) || !Array.isArray(msg.v)) return;
        this.broadcast({ t: 'nade', id: p.id, o: msg.o.slice(0, 3), v: msg.v.slice(0, 3), n: msg.n }, p.id);
        break;
      case 'hit': {
        const target = this.players.get(Number(msg.target));
        const dmg = Number(msg.dmg);
        if (!target || !Number.isFinite(dmg) || dmg <= 0) return;
        // a rocket or grenade already in the air still counts just after its owner died
        const explosive = msg.w === 'grenade' || msg.w === 'rocket';
        if (msg.w !== 'lava' && p.dead && !(explosive && Date.now() - p.deathAt < 4000)) return;
        if (msg.w === 'lava' && target !== p) return;
        const dist = Math.hypot(p.pos[0] - target.pos[0], p.pos[1] - target.pos[1], p.pos[2] - target.pos[2]);
        if (dmg > maxHitDamage(msg.w, !!msg.head, dist)) return;
        this.applyDamage(p, target, dmg, msg.w, msg.head);
        break;
      }
      case 'respawn': {
        if (!p.dead || Date.now() - p.deathAt < RESPAWN_DELAY - 300 || this.state !== 'playing') return;
        if (!Array.isArray(msg.p)) return;
        p.dead = false;
        p.hp = 100;
        p.prot = Date.now() + 1500;
        p.pos = msg.p.slice(0, 3).map(Number);
        this.broadcast({ t: 'spawn', id: p.id, p: p.pos });
        break;
      }
      case 'pickup': {
        const pk = this.pickups[Number(msg.id)];
        if (!pk || !pk.active || p.dead) return;
        const dx = p.pos[0] - pk.x, dz = p.pos[2] - pk.z, dy = p.pos[1] - pk.y;
        if (dx * dx + dz * dz > 9 || Math.abs(dy) > 3) return;
        this.takePickup(pk, p);
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 120).trim();
        if (text) this.broadcast({ t: 'chat', id: p.id, text });
        break;
      }
    }
  }

  // Snapshots, health regen, pickup respawns, match timer.
  tick() {
    const now = Date.now();
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    this.bots.update(dt, now);
    if (this.state === 'playing') {
      for (const p of this.players.values()) {
        if (!p.dead && p.hp < 100 && now - p.lastDmg > 5000) p.hp = Math.min(100, p.hp + 12 * dt);
      }
      for (const pk of this.pickups) {
        if (!pk.active && now >= pk.respawnAt) {
          pk.active = true;
          this.broadcast({ t: 'pk', id: pk.id });
        }
      }
      if (now >= this.endsAt) {
        this.state = 'ended';
        this.nextMatchAt = now + END_SCREEN_MS;
        const board = [...this.players.values()].map(publicPlayer).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
        this.broadcast({ t: 'end', board, next: END_SCREEN_MS, teamScore: this.teamScore });
      }
    } else if (this.state === 'ended' && now >= this.nextMatchAt) {
      this.startMatch();
      this.broadcast({ t: 'match', ...this.matchInfo() });
    }
    const ps = [];
    for (const p of this.players.values()) {
      ps.push([p.id, +p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.w, Math.ceil(p.hp), p.dead ? 1 : 0, p.flags, p.kills, p.deaths]);
    }
    this.broadcast({ t: 'snap', ps, ts: this.teamScore });
  }
}
