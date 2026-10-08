// The in-match game: world, local player, other players, weapons, effects and HUD.
import * as THREE from 'three';
import { generateMap, mapHash, MAPS, B } from './shared/maps.js';
import { WEAPONS } from './shared/weapons.js';
import { rayBox, playerBoxes } from './shared/voxel.js';
import { buildWorldMeshes } from './worldmesh.js';
import { buildCharacter, buildGun, setCharacterWeapon, poseCharacter, makeNameTag } from './models.js';
import { LocalPlayer, PLAYER } from './player.js';
import { settings, onSettingsChange } from './settings.js';
import { playGun, sfx, setVolume } from './audio.js';
import { blockColor } from './textures.js';

const $ = (id) => document.getElementById(id);
const RESPAWN_MS = 3000;
const SEND_MS = 50;

let renderer = null;
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas: $('gameCanvas'), antialias: true, powerPreference: 'high-performance' });
    renderer.autoClear = false;
  }
  return renderer;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function skyTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const particleMats = new Map();
function particleMat(color) {
  if (!particleMats.has(color)) particleMats.set(color, new THREE.MeshBasicMaterial({ color }));
  return particleMats.get(color);
}

export class Game {
  constructor({ net, data, me, onExit }) {
    this.net = net;
    this.me = me;
    this.onExit = onExit;
    this.myId = data.you;
    this.code = data.code;
    this.roomSettings = data.settings;
    this.hostId = data.hostId;
    this.players = new Map();
    this.pickups = new Map();
    this.keys = new Set();
    this.mouseDown = false;
    this.zoomHeld = false;
    this.locked = false;
    this.menuOpen = false;
    this.chatOpen = false;
    this.running = true;

    this.renderer = getRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    // Viewmodel (your gun) is drawn in its own scene so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.2));
    const vmSun = new THREE.DirectionalLight(0xffffff, 1.2);
    vmSun.position.set(1, 2, 1);
    this.vmScene.add(vmSun);
    this.vm = { group: new THREE.Group(), gun: null, id: null, kick: 0, bob: 0, swap: 0, flash: null, zoom: 0 };
    this.vmScene.add(this.vm.group);

    this.tracers = [];
    this.particles = [];
    this.rockets = [];
    this.explosions = [];
    this.clouds = [];
    this.recoil = 0;
    this.bloom = 0;
    this.shake = 0;
    this.lastSend = 0;
    this.lastLava = 0;
    this.pendingPickups = new Map();
    this.lastRespawnReq = 0;
    this.hud = {};
    this.chatLines = [];
    this.fpsAcc = { t: 0, n: 0 };

    this.bindInput();
    this.unsub = net.on((m) => this.onMessage(m));
    this.unsubSettings = onSettingsChange(() => this.applySettings());
    this.applySettings();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();

    this.startMatch(data);
    $('roomCode').textContent = 'CODE: ' + this.code;
    $('clickToPlay').classList.remove('hidden');
    this.lock();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ setup
  startMatch(data) {
    $('loading').classList.remove('hidden');
    $('endScreen').classList.add('hidden');
    this.state = data.state;
    this.timerEnd = performance.now() + data.timeLeft;
    this.loadMap(data.mapIndex);
    if (data.mapHash && mapHash(data.mapIndex) !== data.mapHash) {
      console.warn('Map mismatch with server', data.mapHash, mapHash(data.mapIndex));
      this.notice('Warning: your map differs from the server. Try refreshing the page.');
    }

    for (const p of this.players.values()) this.scene.remove(p.model);
    this.players.clear();
    for (const p of data.players) if (p.id !== this.myId) this.addPlayer(p);
    const mine = data.players.find((p) => p.id === this.myId);
    this.myStats = { kills: mine?.kills || 0, deaths: mine?.deaths || 0 };

    for (const pk of this.pickups.values()) this.scene.remove(pk.mesh);
    this.pickups.clear();
    for (const pk of data.pickups) this.addPickup(pk);

    this.alive = false;
    this.hp = 100;
    this.deathAt = -1e9;
    this.killedBy = null;
    this.slots = [null, { id: 'pistol', mag: WEAPONS.pistol.mag, reserve: Infinity }];
    this.slot = 1;
    this.reloading = false;
    this.nextFire = 0;
    $('deathScreen').classList.add('hidden');
    $('mapName').textContent = MAPS[data.mapIndex].name;
    setTimeout(() => $('loading').classList.add('hidden'), 150);
    if (this.state === 'ended') this.showEnd(data.players.slice().sort((a, b) => b.kills - a.kills), data.timeLeft);
  }

  loadMap(index) {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse((o) => o.geometry && o.geometry.dispose());
    }
    for (const c of this.clouds) this.scene.remove(c);
    this.clouds = [];
    this.map = generateMap(index);
    this.world = this.map.world;
    this.worldGroup = buildWorldMeshes(this.world);
    this.scene.add(this.worldGroup);
    const def = this.map.def;
    this.scene.background = skyTexture(def.sky[0], def.sky[1]);
    this.scene.fog = new THREE.Fog(def.fog, 45, 150);
    this.player = new LocalPlayer(this.world);
    // blocky clouds
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(cubeGeo, cloudMat);
      c.scale.set(8 + Math.random() * 14, 2, 6 + Math.random() * 10);
      c.position.set(Math.random() * 160 - 44, 48 + Math.random() * 10, Math.random() * 160 - 44);
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  addPlayer(info) {
    if (this.players.has(info.id)) return;
    const model = buildCharacter(info.color, 'pistol');
    const tag = makeNameTag(info.name, info.color);
    tag.position.y = 2.3;
    model.add(tag);
    this.scene.add(model);
    const pos = new THREE.Vector3(...(info.pos || [0, -100, 0]));
    model.position.copy(pos);
    model.visible = !info.dead;
    this.players.set(info.id, {
      id: info.id, name: info.name, color: info.color, kills: info.kills || 0, deaths: info.deaths || 0,
      hp: info.hp ?? 100, dead: !!info.dead, model, pos, target: pos.clone(), yaw: 0, tyaw: 0, pitch: 0, tpitch: 0,
      w: 'pistol', speed: 0,
    });
  }

  addPickup(pk) {
    const g = new THREE.Group();
    const gun = buildGun(pk.type);
    gun.scale.setScalar(1.7);
    gun.rotation.y = Math.PI / 2;
    const spin = new THREE.Group();
    spin.add(gun);
    spin.position.y = 0.7;
    g.add(spin);
    const col = { rocket: 0xff5533, sniper: 0xb36bff, lmg: 0xb36bff, shotgun: 0x4fc3f7, revolver: 0x4fc3f7 }[pk.type] || 0x7cff7c;
    const base = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
    base.scale.set(0.9, 0.06, 0.9);
    base.position.y = 0.03;
    const beam = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false }));
    beam.scale.set(0.5, 2.4, 0.5);
    beam.position.y = 1.2;
    g.add(base, beam);
    g.position.set(pk.x, pk.y, pk.z);
    g.visible = pk.active;
    this.scene.add(g);
    this.pickups.set(pk.id, { ...pk, mesh: g, spin });
  }

  applySettings() {
    setVolume(settings.vol);
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio) * settings.qual);
    this.resize();
    document.getElementById('crosshair').style.setProperty('--c', settings.xhairColor);
    $('fps').classList.toggle('hidden', !settings.showFps);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const canvas = $('gameCanvas');
    this.h = {
      keydown: (e) => {
        if (this.chatOpen) {
          if (e.code === 'Enter') this.sendChat();
          else if (e.code === 'Escape') this.closeChat();
          return;
        }
        if (e.code === 'Tab') { e.preventDefault(); $('scoreboard').classList.remove('hidden'); this.renderScoreboard(); }
        if (!this.locked) return;
        if (['Space', 'Tab', 'KeyT'].includes(e.code)) e.preventDefault();
        this.keys.add(e.code);
        if (e.code === 'KeyR') this.startReload();
        if (e.code === 'Digit1') this.switchSlot(0);
        if (e.code === 'Digit2') this.switchSlot(1);
        if (e.code === 'KeyQ') this.switchSlot(this.slot === 0 ? 1 : 0);
        if (e.code === 'KeyT' || e.code === 'Enter') this.openChat();
      },
      keyup: (e) => {
        this.keys.delete(e.code);
        if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
      },
      mousedown: (e) => {
        if (!this.locked) return;
        if (e.button === 0) { this.mouseDown = true; this.firedSinceDown = false; }
        if (e.button === 2) this.zoomHeld = true;
      },
      mouseup: (e) => {
        if (e.button === 0) this.mouseDown = false;
        if (e.button === 2) this.zoomHeld = false;
      },
      mousemove: (e) => {
        if (!this.locked || !this.alive) return;
        const zoomMul = this.zoomed ? settings.zoomSens * (this.camera.fov / settings.fov) : 1;
        const k = 0.0022 * settings.sens * zoomMul;
        this.player.yaw -= e.movementX * k;
        this.player.pitch -= e.movementY * k * (settings.invertY ? -1 : 1);
        this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch));
      },
      wheel: (e) => {
        if (!this.locked) return;
        this.switchSlot(this.slot === 0 ? 1 : 0);
      },
      contextmenu: (e) => e.preventDefault(),
      click: () => {
        if (!this.locked && !this.menuOpen && !this.chatOpen) this.lock();
      },
      lockchange: () => {
        this.locked = document.pointerLockElement === canvas;
        $('clickToPlay').classList.toggle('hidden', this.locked || this.menuOpen || this.chatOpen);
        if (!this.locked) {
          this.keys.clear();
          this.mouseDown = false;
          this.zoomHeld = false;
          if (!this.chatOpen && this.running) this.openMenu();
        }
      },
      blur: () => { this.keys.clear(); this.mouseDown = false; },
    };
    addEventListener('keydown', this.h.keydown);
    addEventListener('keyup', this.h.keyup);
    addEventListener('mousedown', this.h.mousedown);
    addEventListener('mouseup', this.h.mouseup);
    addEventListener('mousemove', this.h.mousemove);
    addEventListener('wheel', this.h.wheel, { passive: true });
    addEventListener('contextmenu', this.h.contextmenu);
    addEventListener('blur', this.h.blur);
    canvas.addEventListener('click', this.h.click);
    document.addEventListener('pointerlockchange', this.h.lockchange);
  }

  unbindInput() {
    removeEventListener('keydown', this.h.keydown);
    removeEventListener('keyup', this.h.keyup);
    removeEventListener('mousedown', this.h.mousedown);
    removeEventListener('mouseup', this.h.mouseup);
    removeEventListener('mousemove', this.h.mousemove);
    removeEventListener('wheel', this.h.wheel);
    removeEventListener('contextmenu', this.h.contextmenu);
    removeEventListener('blur', this.h.blur);
    $('gameCanvas').removeEventListener('click', this.h.click);
    document.removeEventListener('pointerlockchange', this.h.lockchange);
  }

  lock() {
    const canvas = $('gameCanvas');
    try {
      const r = canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => {
        // some browsers don't support unadjustedMovement
        const r2 = canvas.requestPointerLock();
        if (r2 && r2.catch) r2.catch(() => $('clickToPlay').classList.remove('hidden'));
      });
    } catch {
      canvas.requestPointerLock();
    }
  }

  openMenu() {
    this.menuOpen = true;
    $('settingsTitle').textContent = 'Paused';
    $('roomInfo').classList.remove('hidden');
    $('roomInfo').innerHTML = `Room code: <b>${esc(this.code)}</b><br>Map: ${esc(MAPS[this.map.index].name)} · ${this.roomSettings.time} min · up to ${this.roomSettings.maxPlayers} players`;
    $('resumeBtn').classList.remove('hidden');
    $('leaveBtn').classList.remove('hidden');
    $('closeSettingsBtn').classList.add('hidden');
    $('settingsModal').classList.remove('hidden');
    $('clickToPlay').classList.add('hidden');
  }

  resume() {
    this.menuOpen = false;
    $('settingsModal').classList.add('hidden');
    this.lock();
  }

  openChat() {
    this.chatOpen = true;
    $('chatInput').classList.remove('hidden');
    $('chatInput').value = '';
    document.exitPointerLock();
    setTimeout(() => $('chatInput').focus(), 0);
  }

  closeChat() {
    this.chatOpen = false;
    $('chatInput').classList.add('hidden');
    $('chatInput').blur();
    this.lock();
  }

  sendChat() {
    const text = $('chatInput').value.trim();
    if (text) {
      this.net.send({ t: 'chat', text });
      this.addChat(this.me.name, this.me.color, text);
    }
    this.closeChat();
  }

  addChat(name, color, text) {
    const el = document.createElement('div');
    el.innerHTML = `<b style="color:${esc(color)}">${esc(name)}:</b> ${esc(text)}`;
    $('chatLog').appendChild(el);
    while ($('chatLog').children.length > 6) $('chatLog').firstChild.remove();
    setTimeout(() => el.remove(), 10000);
  }

  // ------------------------------------------------------------------ network
  onMessage(m) {
    switch (m.t) {
      case 'snap': this.onSnap(m.ps); break;
      case 'pj':
        this.addPlayer(m.p);
        this.feed(`<b style="color:${esc(m.p.color)}">${esc(m.p.name)}</b> joined`);
        break;
      case 'pl': {
        const p = this.players.get(m.id);
        if (p) {
          this.scene.remove(p.model);
          this.players.delete(m.id);
          this.feed(`<b style="color:${esc(p.color)}">${esc(p.name)}</b> left`);
        }
        break;
      }
      case 'host': this.hostId = m.id; break;
      case 'shot': this.onRemoteShot(m); break;
      case 'boom': {
        const idx = this.rockets.findIndex((r) => r.owner === m.id);
        if (idx >= 0) { this.scene.remove(this.rockets[idx].mesh); this.rockets.splice(idx, 1); }
        this.explode(new THREE.Vector3(...m.p), false);
        break;
      }
      case 'dmg': this.onDamage(m); break;
      case 'kill': this.onKill(m); break;
      case 'spawn': {
        if (m.id === this.myId) {
          if (!this.alive) {
            this.alive = true;
            this.hp = 100;
            this.player.pos.set(...m.p);
            this.player.vel.set(0, 0, 0);
            // face the middle of the map
            const c = this.world.sx / 2;
            this.player.yaw = Math.atan2(-(c - m.p[0]), -(c - m.p[2]));
            this.player.pitch = 0;
            this.player.dashCd = 0;
            $('deathScreen').classList.add('hidden');
          }
        } else {
          const p = this.players.get(m.id);
          if (p) { p.dead = false; p.pos.set(...m.p); p.target.set(...m.p); p.model.visible = true; p.hp = 100; }
        }
        break;
      }
      case 'took': {
        const pk = this.pickups.get(m.id);
        if (pk) { pk.mesh.visible = false; pk.active = false; }
        this.pendingPickups.delete(m.id);
        if (m.by === this.myId) this.equip(m.type);
        break;
      }
      case 'pk': {
        const pk = this.pickups.get(m.id);
        if (pk) { pk.mesh.visible = true; pk.active = true; }
        break;
      }
      case 'chat': {
        const p = this.players.get(m.id);
        if (p) this.addChat(p.name, p.color, m.text);
        break;
      }
      case 'end':
        this.state = 'ended';
        this.showEnd(m.board, m.next);
        break;
      case 'match':
        this.startMatch(m);
        break;
      case 'disconnected':
        this.exit('Lost connection to the server.');
        break;
    }
  }

  onSnap(ps) {
    for (const [id, x, y, z, yaw, pitch, w, hp, dead, flags, kills, deaths] of ps) {
      if (id === this.myId) {
        this.hp = hp;
        this.myStats.kills = kills;
        this.myStats.deaths = deaths;
        continue;
      }
      const p = this.players.get(id);
      if (!p) continue;
      p.kills = kills; p.deaths = deaths; p.hp = hp;
      if (dead) { p.dead = true; p.model.visible = false; continue; }
      p.target.set(x, y, z);
      if (p.dead || p.pos.distanceToSquared(p.target) > 36) p.pos.copy(p.target);
      p.dead = false;
      p.model.visible = true;
      p.tyaw = yaw; p.tpitch = pitch; p.flags = flags;
      if (p.w !== w) { p.w = w; setCharacterWeapon(p.model, w); }
    }
  }

  onRemoteShot(m) {
    const p = this.players.get(m.id);
    if (!p) return;
    const w = WEAPONS[m.w];
    const origin = tmpV.copy(p.pos).add(new THREE.Vector3(-Math.sin(p.yaw) * 0.6 + Math.cos(p.yaw) * 0.35, 1.3, -Math.cos(p.yaw) * 0.6 - Math.sin(p.yaw) * 0.35)).clone();
    const dist = origin.distanceTo(this.camera.position);
    if (w) playGun(w.sound, Math.max(1, dist));
    if (m.w === 'rocket' && m.o && m.d) {
      this.spawnRocket(new THREE.Vector3(...m.o), new THREE.Vector3(...m.d), m.id, false);
      return;
    }
    for (const e of m.e || []) this.addTracer(origin, new THREE.Vector3(...e));
  }

  onDamage(m) {
    if (m.id === this.myId) {
      const lost = this.hp - m.hp;
      this.hp = m.hp;
      if (lost > 0) {
        sfx.hurt();
        this.flashDamage(Math.min(1, lost / 40));
        const a = this.players.get(m.by);
        if (a && m.by !== this.myId) {
          const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z;
          const ang = Math.atan2(-dx, -dz) - this.player.yaw;
          const arrow = $('dmgArrow');
          arrow.style.transform = `rotate(${-ang}rad)`;
          arrow.style.transition = 'none';
          arrow.style.opacity = '1';
          requestAnimationFrame(() => { arrow.style.transition = 'opacity 1s'; arrow.style.opacity = '0'; });
        }
      }
    } else {
      const p = this.players.get(m.id);
      if (p) p.hp = m.hp;
    }
  }

  onKill(m) {
    const name = (id) => (id === this.myId ? this.me.name : this.players.get(id)?.name || '?');
    const color = (id) => (id === this.myId ? this.me.color : this.players.get(id)?.color || '#fff');
    const wname = m.w === 'lava' ? 'Lava' : WEAPONS[m.w]?.name || m.w;
    const mine = m.k === this.myId || m.v === this.myId;
    if (m.k === m.v) this.feed(`<b style="color:${esc(color(m.v))}">${esc(name(m.v))}</b><span class="wpn">[${esc(wname)}]</span>himself`, mine);
    else this.feed(`<b style="color:${esc(color(m.k))}">${esc(name(m.k))}</b><span class="wpn">[${esc(wname)}${m.head ? ' ✦' : ''}]</span><b style="color:${esc(color(m.v))}">${esc(name(m.v))}</b>`, mine);

    if (m.v === this.myId) {
      this.alive = false;
      this.deathAt = performance.now();
      this.killedBy = m.k !== this.myId ? m.k : null;
      this.hp = 0;
      this.slots = [null, { id: 'pistol', mag: WEAPONS.pistol.mag, reserve: Infinity }];
      this.slot = 1;
      this.reloading = false;
      sfx.death();
      this.burst(this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Color(this.me.color).getHex(), 24);
      $('deathScreen').classList.remove('hidden');
      $('killedBy').innerHTML = m.k === this.myId ? (m.w === 'lava' ? 'You fell in lava!' : 'You blew yourself up!') :
        `Eliminated by <b style="color:${esc(color(m.k))}">${esc(name(m.k))}</b> with ${esc(wname)}`;
    } else {
      const p = this.players.get(m.v);
      if (p) {
        p.dead = true;
        p.model.visible = false;
        this.burst(p.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Color(p.color).getHex(), 24);
      }
      if (m.k === this.myId) {
        sfx.kill();
        this.notice(`You eliminated ${name(m.v)}${m.head ? ' (headshot!)' : ''}`);
      }
    }
  }

  // ------------------------------------------------------------------ weapons
  get weapon() { return this.slots[this.slot]; }
  get zoomed() { return this.zoomHeld && this.alive && !this.reloading; }

  equip(type) {
    const w = WEAPONS[type];
    this.slots[0] = { id: type, mag: w.mag, reserve: w.reserve };
    this.reloading = false;
    this.slot = 0;
    this.vm.swap = 1;
    this.nextFire = performance.now() + 250;
    sfx.pickup();
    this.notice(`Picked up ${w.name}`);
  }

  switchSlot(i) {
    if (i === this.slot || !this.slots[i]) return;
    this.slot = i;
    this.reloading = false;
    this.vm.swap = 1;
    this.nextFire = Math.max(this.nextFire, performance.now() + 300);
  }

  startReload() {
    const cur = this.weapon;
    if (!cur || this.reloading || !this.alive) return;
    const w = WEAPONS[cur.id];
    if (cur.mag >= w.mag || cur.reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = performance.now() + w.reload * 1000;
    this.reloadStart = performance.now();
    sfx.reload();
  }

  updateWeapon(now, dt) {
    const cur = this.weapon;
    const w = WEAPONS[cur.id];
    if (this.reloading && now >= this.reloadEnd) {
      const need = w.mag - cur.mag;
      const take = Math.min(need, cur.reserve);
      cur.mag += take;
      if (cur.reserve !== Infinity) cur.reserve -= take;
      this.reloading = false;
    }
    this.bloom = Math.max(0, this.bloom - dt * w.spread * 4);
    const wantFire = this.mouseDown && this.locked && (w.auto || !this.firedSinceDown);
    if (wantFire && now >= this.nextFire && !this.reloading && this.state === 'playing') {
      if (cur.mag <= 0) {
        sfx.empty();
        this.nextFire = now + 250;
        this.firedSinceDown = true;
        this.startReload();
      } else {
        this.fire(now, cur, w);
        this.firedSinceDown = true;
        if (cur.mag === 0) this.startReload();
      }
    }
  }

  fire(now, cur, w) {
    cur.mag--;
    this.nextFire = now + w.rate * 1000;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const right = tmpV2.set(1, 0, 0).applyQuaternion(this.camera.quaternion).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    let spread = w.spread * (this.zoomed ? w.zoomSpread : 1);
    const hs = Math.hypot(this.player.vel.x, this.player.vel.z);
    if (hs > 1) spread *= 1.5;
    if (!this.player.onGround) spread *= 1.8;
    spread += this.bloom;
    if (w.auto) this.bloom = Math.min(this.bloom + w.spread * 0.18, w.spread * 1.2);

    const muzzle = origin.clone().addScaledVector(fwd, 0.7).addScaledVector(right, this.zoomed ? 0.05 : 0.22).addScaledVector(up, this.zoomed ? -0.08 : -0.18);
    playGun(w.sound, 0);
    this.recoil += w.recoil * (this.zoomed ? 0.6 : 1);
    this.player.yaw += (Math.random() - 0.5) * w.recoil * 0.3;
    this.vm.kick = 1;
    if (this.vm.flash) { this.vm.flash.visible = true; this.flashUntil = now + 45; }

    if (w.projectile) {
      const dir = fwd.clone();
      this.spawnRocket(muzzle.clone(), dir, this.myId, true);
      this.net.send({ t: 'shot', w: cur.id, o: muzzle.toArray().map((v) => +v.toFixed(2)), d: dir.toArray().map((v) => +v.toFixed(3)) });
      return;
    }

    const ends = [];
    const hits = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const res = this.trace(origin, dir, w.range);
      ends.push(res.point.toArray().map((v) => +v.toFixed(2)));
      this.addTracer(muzzle, res.point);
      if (res.player) {
        let dmg = w.dmg * (res.head ? w.head : 1);
        if (w.falloff) {
          const [near, far] = w.falloff;
          dmg *= THREE.MathUtils.clamp(1 - (res.t - near) / (far - near), 0.3, 1);
        }
        const h = hits.get(res.player.id) || { dmg: 0, head: false, p: res.player };
        h.dmg += dmg;
        h.head = h.head || res.head;
        hits.set(res.player.id, h);
        this.burst(res.point, 0xd02020, 4, 0.08);
      } else if (res.block) {
        this.burst(res.point, blockColor(res.block), 5, 0.07);
      }
    }
    for (const [id, h] of hits) {
      this.net.send({ t: 'hit', target: id, dmg: Math.round(h.dmg * 10) / 10, head: h.head, w: cur.id });
      this.hitmarker(h.head);
    }
    this.net.send({ t: 'shot', w: cur.id, e: ends });
  }

  trace(origin, dir, range) {
    const wh = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    let best = wh ? wh.t : range;
    let hitP = null, head = false;
    for (const p of this.players.values()) {
      if (p.dead || !p.model.visible) continue;
      const bx = playerBoxes(p.pos.x, p.pos.y, p.pos.z);
      const th = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bx.head.min, bx.head.max);
      if (th >= 0 && th < best) { best = th; hitP = p; head = true; }
      const tb = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bx.body.min, bx.body.max);
      if (tb >= 0 && tb < best) { best = tb; hitP = p; head = false; }
    }
    const point = origin.clone().addScaledVector(dir, best);
    return { t: best, point, player: hitP, head, block: !hitP && wh ? this.world.get(wh.x, wh.y, wh.z) || B.STONE : null };
  }

  spawnRocket(pos, dir, owner, mine) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(cubeGeo, particleMat(0x46663a));
    body.scale.set(0.14, 0.14, 0.5);
    const tip = new THREE.Mesh(cubeGeo, particleMat(0xd04020));
    tip.scale.set(0.1, 0.1, 0.12);
    tip.position.z = -0.3;
    mesh.add(body, tip);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().sub(dir));
    this.scene.add(mesh);
    this.rockets.push({ pos: pos.clone(), dir: dir.clone().normalize(), owner, mine, mesh, life: 6, smoke: 0 });
  }

  updateRockets(dt) {
    const speed = WEAPONS.rocket.projectile;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const step = speed * dt;
      let hitT = null;
      const wh = this.world.raycast(r.pos.x, r.pos.y, r.pos.z, r.dir.x, r.dir.y, r.dir.z, step);
      if (wh) hitT = wh.t;
      if (r.mine) {
        for (const p of this.players.values()) {
          if (p.dead) continue;
          const bx = playerBoxes(p.pos.x, p.pos.y, p.pos.z);
          const t = rayBox(r.pos.x, r.pos.y, r.pos.z, r.dir.x, r.dir.y, r.dir.z, [bx.body.min[0] - 0.1, bx.body.min[1], bx.body.min[2] - 0.1], [bx.head.max[0] + 0.1, bx.head.max[1], bx.head.max[2] + 0.1]);
          if (t >= 0 && t <= step && (hitT === null || t < hitT)) hitT = t;
        }
      }
      if (hitT !== null || r.life <= 0) {
        const p = r.pos.clone().addScaledVector(r.dir, Math.max(0, (hitT ?? 0) - 0.05));
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        if (r.mine) {
          this.explode(p, true);
          this.net.send({ t: 'boom', p: p.toArray().map((v) => +v.toFixed(2)) });
        }
        // other players' rockets only explode when their 'boom' message arrives
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      r.mesh.position.copy(r.pos);
      r.smoke -= dt;
      if (r.smoke <= 0) { r.smoke = 0.025; this.burst(r.pos.clone(), 0xbbbbbb, 1, 0.12, 0.6, 0.5); }
    }
  }

  explode(pos, mine) {
    sfx.explosion(pos.distanceTo(this.camera.position));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 }));
    ball.position.copy(pos);
    this.scene.add(ball);
    this.explosions.push({ mesh: ball, t: 0 });
    this.burst(pos, 0xff7a20, 18, 0.18, 8);
    this.burst(pos, 0x555555, 12, 0.22, 5);
    const d = pos.distanceTo(this.camera.position);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 20));
    if (!mine) return;
    const w = WEAPONS.rocket;
    const targets = [...this.players.values()].filter((p) => !p.dead).map((p) => ({ id: p.id, c: p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)) }));
    if (this.alive) targets.push({ id: this.myId, c: this.player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), self: true });
    for (const t of targets) {
      const dist = t.c.distanceTo(pos);
      if (dist > w.splash) continue;
      const dir = t.c.clone().sub(pos);
      const len = dir.length();
      if (len > 0.3) {
        dir.normalize();
        const blocked = this.world.raycast(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, len);
        if (blocked && blocked.t < len - 0.5) continue;
      }
      let dmg = Math.max(12, w.dmg * (1 - dist / w.splash));
      if (t.self) {
        dmg *= 0.35;
        const push = len > 0.01 ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0);
        this.player.vel.addScaledVector(push, 16 * (1 - dist / w.splash)).y += 5;
        this.player.onGround = false;
      } else {
        this.hitmarker(false);
      }
      this.net.send({ t: 'hit', target: t.id, dmg: Math.round(dmg), head: false, w: 'rocket' });
    }
  }

  // ------------------------------------------------------------------ effects
  addTracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const m = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
    m.scale.set(0.03, 0.03, len);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.07 });
  }

  burst(pos, color, n, size = 0.1, speed = 3, life = 0.6) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 400) break;
      const m = new THREE.Mesh(cubeGeo, particleMat(color));
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      m.position.copy(pos);
      this.scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.particles.push({ mesh: m, vel: v, life: life * (0.6 + Math.random() * 0.6) });
    }
  }

  updateEffects(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 5;
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      e.mesh.scale.setScalar(0.5 + e.t * 14);
      e.mesh.material.opacity = Math.max(0, 0.9 - e.t * 3.5);
      if (e.t > 0.3) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); this.explosions.splice(i, 1); }
    }
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 120) c.position.x = -50;
    }
  }

  hitmarker(head) {
    const el = $('hitmarker');
    el.classList.toggle('head', head);
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; });
    head ? sfx.headshot() : sfx.hit();
  }

  flashDamage(amount) {
    const el = $('damageVignette');
    el.style.transition = 'none';
    el.style.opacity = String(0.4 + amount * 0.6);
    requestAnimationFrame(() => { el.style.transition = 'opacity .6s'; el.style.opacity = '0'; });
  }

  notice(text) {
    const el = $('notice');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this.noticeT);
    this.noticeT = setTimeout(() => (el.style.opacity = '0'), 1800);
  }

  feed(html, mine) {
    const el = document.createElement('div');
    el.className = 'kf' + (mine ? ' me' : '');
    el.innerHTML = html;
    $('killfeed').prepend(el);
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  // ------------------------------------------------------------------ viewmodel
  updateViewmodel(dt, now) {
    const cur = this.weapon;
    const vm = this.vm;
    if (vm.id !== cur.id) {
      if (vm.gun) vm.group.remove(vm.gun);
      vm.gun = buildGun(cur.id);
      // a blocky arm holding the gun
      const sleeve = new THREE.Mesh(cubeGeo, new THREE.MeshLambertMaterial({ color: this.me.color }));
      sleeve.scale.set(0.11, 0.11, 0.42);
      sleeve.position.set(0.03, -0.14, 0.26);
      sleeve.rotation.x = 0.35;
      const hand = new THREE.Mesh(cubeGeo, new THREE.MeshLambertMaterial({ color: 0xf1c39a }));
      hand.scale.set(0.1, 0.1, 0.1);
      hand.position.set(0, -0.08, 0.04);
      vm.gun.add(sleeve, hand);
      const flash = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }));
      flash.scale.set(0.06, 0.06, 0.1);
      flash.position.set(0, 0.04, vm.gun.userData.muzzleZ - 0.04);
      flash.rotation.z = Math.PI / 4;
      flash.visible = false;
      vm.gun.add(flash);
      vm.flash = flash;
      vm.group.add(vm.gun);
      vm.id = cur.id;
    }
    if (vm.flash && now > (this.flashUntil || 0)) vm.flash.visible = false;
    const w = WEAPONS[cur.id];
    vm.zoom += ((this.zoomed ? 1 : 0) - vm.zoom) * Math.min(1, dt * 14);
    vm.kick = Math.max(0, vm.kick - dt * 9);
    vm.swap = Math.max(0, vm.swap - dt * 3.5);
    const speed = Math.hypot(this.player.vel.x, this.player.vel.z);
    if (this.player.onGround && speed > 1) vm.bob += dt * speed * 1.4;
    const bobAmt = settings.bob ? Math.min(1, speed / 8) * (1 - vm.zoom * 0.85) : 0;
    const bx = Math.cos(vm.bob) * 0.012 * bobAmt, by = Math.abs(Math.sin(vm.bob)) * 0.016 * bobAmt;
    const hip = [0.24, -0.25, -0.5], ads = [0, -0.155, -0.38];
    let x = THREE.MathUtils.lerp(hip[0], ads[0], vm.zoom) + bx;
    let y = THREE.MathUtils.lerp(hip[1], ads[1], vm.zoom) + by - vm.swap * 0.3;
    let z = THREE.MathUtils.lerp(hip[2], ads[2], vm.zoom) + vm.kick * 0.07;
    let rx = vm.kick * 0.12;
    if (this.reloading) {
      const k = (now - this.reloadStart) / (this.reloadEnd - this.reloadStart);
      const s = Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);
      y -= s * 0.12;
      rx -= s * 0.6;
    }
    if (this.player.sprinting && !this.zoomed) { rx -= 0.25; x -= 0.04; }
    vm.gun.position.set(x, y, z);
    vm.gun.rotation.set(rx, 0, 0);
    vm.group.visible = this.alive && !(w.scope && vm.zoom > 0.8);
  }

  // ------------------------------------------------------------------ loop
  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.update(dt, t);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
    this.fpsAcc.t += dt; this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      $('fps').textContent = Math.round(this.fpsAcc.n / this.fpsAcc.t) + ' FPS';
      this.fpsAcc.t = 0; this.fpsAcc.n = 0;
    }
  }

  update(dt, now) {
    const pl = this.player;
    const canMove = this.alive && this.locked;
    const k = this.keys;
    const input = canMove ? {
      f: k.has('KeyW'), b: k.has('KeyS'), l: k.has('KeyA'), r: k.has('KeyD'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'), jump: k.has('Space'), dash: k.has('KeyX'), zoom: this.zoomed,
    } : {};

    if (this.alive) {
      pl.update(dt, input, WEAPONS[this.weapon.id].moveMul || 1);
      for (const e of pl.events) { if (e === 'dash') sfx.dash(); else if (e === 'jump') sfx.jump(); else if (e === 'land') sfx.land(); }
      pl.events.length = 0;
      this.updateCamera(dt);
      this.updateWeapon(now, dt);
      // lava
      const under = this.world.get(Math.floor(pl.pos.x), Math.floor(pl.pos.y - 0.05), Math.floor(pl.pos.z));
      if (under === B.LAVA && pl.onGround && now - this.lastLava > 500) {
        this.lastLava = now;
        this.net.send({ t: 'hit', target: this.myId, dmg: 12, w: 'lava' });
      }
      // weapon pickups: walk over them
      for (const pk of this.pickups.values()) {
        if (!pk.active) continue;
        const dx = pk.x - pl.pos.x, dz = pk.z - pl.pos.z, dy = pl.pos.y - pk.y;
        if (dx * dx + dz * dz < 1.1 && dy > -1 && dy < 1.6) {
          const last = this.pendingPickups.get(pk.id) || 0;
          if (now - last > 800) {
            this.pendingPickups.set(pk.id, now);
            this.net.send({ t: 'pickup', id: pk.id });
          }
        }
      }
    } else {
      this.updateCamera(dt);
    }
    if (!this.alive && this.state === 'playing' && now - this.deathAt > RESPAWN_MS && now - this.lastRespawnReq > 1000) {
      this.lastRespawnReq = now;
      const s = this.chooseSpawn();
      this.net.send({ t: 'respawn', p: s });
    }

    const w = WEAPONS[this.weapon.id];
    let targetFov = this.zoomed ? (w.scope ? w.zoomFov : settings.fov * (w.zoomFov / 80)) : settings.fov;
    if (pl.sprinting && !this.zoomed) targetFov += 6;
    if (pl.dashT > 0) targetFov += 12;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();
    $('scopeOverlay').classList.toggle('hidden', !(w.scope && this.zoomed && this.vm.zoom > 0.8));

    // others
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const before = p.pos.clone();
      p.pos.lerp(p.target, 1 - Math.exp(-dt * 16));
      let dy = p.tyaw - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += dy * Math.min(1, dt * 16);
      p.pitch += (p.tpitch - p.pitch) * Math.min(1, dt * 16);
      const sp = Math.hypot(p.pos.x - before.x, p.pos.z - before.z) / Math.max(dt, 1e-3);
      p.speed += (sp - p.speed) * Math.min(1, dt * 10);
      p.model.position.copy(p.pos);
      p.model.rotation.y = p.yaw;
      poseCharacter(p.model, p.pitch, p.speed, dt);
    }

    for (const pk of this.pickups.values()) {
      if (!pk.active) continue;
      pk.spin.rotation.y = now * 0.002;
      pk.spin.position.y = 0.7 + Math.sin(now * 0.003 + pk.id) * 0.12;
    }

    this.updateRockets(dt);
    this.updateEffects(dt);
    this.updateViewmodel(dt, now);

    if (now - this.lastSend > SEND_MS && this.alive) {
      this.lastSend = now;
      const f = (pl.sprinting ? 1 : 0) | (this.zoomed ? 2 : 0);
      this.net.send({ t: 's', p: [+pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)], y: +pl.yaw.toFixed(3), x: +pl.pitch.toFixed(3), w: this.weapon.id, f });
    }
    this.updateHud(now);
  }

  updateCamera(dt) {
    const pl = this.player;
    this.recoil = Math.max(0, this.recoil - dt * (this.mouseDown ? 0.12 : 0.6));
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.alive) {
      this.camera.position.set(pl.pos.x, pl.pos.y + PLAYER.eye, pl.pos.z);
      this.camera.rotation.set(pl.pitch + this.recoil + (Math.random() - 0.5) * this.shake * 0.04, pl.yaw + (Math.random() - 0.5) * this.shake * 0.04, 0);
    } else {
      // death cam: rise up and look at whoever got you
      this.camera.position.y += (pl.pos.y + 3.5 - this.camera.position.y) * Math.min(1, dt * 2);
      const killer = this.players.get(this.killedBy);
      if (killer && !killer.dead) {
        const d = killer.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(this.camera.position);
        const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        this.camera.rotation.set(pitch, yaw, 0);
      }
    }
  }

  chooseSpawn() {
    const spawns = this.map.spawns;
    const enemies = [...this.players.values()].filter((p) => !p.dead);
    let best = spawns[0], bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      let minD = 60;
      for (const e of enemies) minD = Math.min(minD, Math.hypot(e.pos.x - s[0], e.pos.y - s[1], e.pos.z - s[2]));
      const score = minD + Math.random() * 8;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  // ------------------------------------------------------------------ HUD
  set(id, value, prop = 'textContent') {
    if (this.hud[id + prop] === value) return;
    this.hud[id + prop] = value;
    $(id)[prop] = value;
  }

  updateHud(now) {
    const hp = Math.max(0, Math.round(this.hp));
    this.set('hpText', String(hp));
    const fill = $('hpFill');
    const fw = hp + '%';
    if (fill.style.width !== fw) {
      fill.style.width = fw;
      fill.style.background = hp > 50 ? 'linear-gradient(180deg,#5fe06a,#2fb53e)' : hp > 25 ? 'linear-gradient(180deg,#ffd23f,#e0a800)' : 'linear-gradient(180deg,#ff6b5e,#d33a2e)';
    }
    const dash = 1 - this.player.dashCd / PLAYER.dashCooldown;
    $('dashFill').style.width = Math.round(dash * 100) + '%';
    $('dashFill').style.background = dash >= 1 ? '#4fc3f7' : '#2a6f91';

    const cur = this.weapon;
    const w = WEAPONS[cur.id];
    this.set('weaponName', w.name);
    this.set('ammoMag', String(cur.mag));
    this.set('ammoRes', cur.reserve === Infinity ? '∞' : String(cur.reserve));
    $('reloadHint').classList.toggle('hidden', !(cur.mag === 0 && !this.reloading && cur.reserve > 0));
    const slotsHtml = this.slots.map((s, i) => (s ? `<div class="slot${i === this.slot ? ' active' : ''}">${i + 1} ${WEAPONS[s.id].name}</div>` : `<div class="slot">${i + 1} —</div>`)).join('');
    this.set('slots', slotsHtml, 'innerHTML');

    // crosshair spread
    const hs = Math.hypot(this.player.vel.x, this.player.vel.z);
    const gap = 5 + (w.spread * (this.zoomed ? w.zoomSpread : 1) * (hs > 1 ? 1.5 : 1) * (this.player.onGround ? 1 : 1.8) + this.bloom) * 400;
    $('crosshair').style.setProperty('--gap', Math.min(60, gap).toFixed(1) + 'px');
    $('crosshair').classList.toggle('hidden', (w.scope && this.zoomed) || !this.alive);

    // timer
    const left = Math.max(0, this.timerEnd - now);
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    this.set('timer', this.state === 'playing' ? `${m}:${String(s).padStart(2, '0')}` : 'MATCH OVER');

    // death screen
    if (!this.alive && this.state === 'playing') {
      const r = Math.max(0, RESPAWN_MS - (now - this.deathAt));
      this.set('respawnTimer', r > 0 ? `Respawning in ${(r / 1000).toFixed(1)}s` : 'Respawning...');
    }

    // leader box
    const all = this.allScores();
    const rank = all.findIndex((p) => p.id === this.myId) + 1;
    const top = all.slice(0, 3).map((p, i) => `${i + 1}. <span style="color:${esc(p.color)}">${esc(p.name)}</span> — ${p.kills}`).join('<br>');
    this.set('leader', `${top}<br><span style="opacity:.8">You: #${rank} · ${this.myStats.kills} K / ${this.myStats.deaths} D</span>`, 'innerHTML');
    if (!$('scoreboard').classList.contains('hidden') && now - (this.sbT || 0) > 250) { this.sbT = now; this.renderScoreboard(); }
    if (this.state === 'ended' && this.endUntil) {
      const el = $('nextIn');
      if (el) el.textContent = Math.max(0, Math.ceil((this.endUntil - now) / 1000));
    }
  }

  allScores() {
    const list = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths }));
    list.push({ id: this.myId, name: this.me.name, color: this.me.color, kills: this.myStats.kills, deaths: this.myStats.deaths });
    return list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  table(list) {
    return `<table class="sb"><tr><th>#</th><th>PLAYER</th><th>KILLS</th><th>DEATHS</th></tr>${list
      .map((p, i) => `<tr class="${p.id === this.myId ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}${p.id === this.hostId ? ' 👑' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`)
      .join('')}</table>`;
  }

  renderScoreboard() {
    $('scoreboard').innerHTML = `<h2>Scoreboard · ${esc(this.code)}</h2>${this.table(this.allScores())}`;
  }

  showEnd(board, nextMs) {
    this.endUntil = performance.now() + nextMs;
    const winner = board[0];
    $('endScreen').innerHTML = `<h2>MATCH OVER</h2>${winner ? `<p style="font-size:22px;margin:0 0 12px">🏆 <span style="color:${esc(winner.color)}">${esc(winner.name)}</span> wins with ${winner.kills} kills!</p>` : ''}
      ${this.table(board)}<p style="margin-top:14px">Next match in <span id="nextIn">${Math.ceil(nextMs / 1000)}</span>s${this.roomSettings.map === 'random' ? ' on a new random map' : ''}...</p>`;
    $('endScreen').classList.remove('hidden');
  }

  // ------------------------------------------------------------------ teardown
  exit(reason) {
    if (!this.running) return;
    this.running = false;
    this.net.send({ t: 'leave' });
    this.unbindInput();
    this.unsub();
    removeEventListener('resize', this.onResize);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.worldGroup) this.worldGroup.traverse((o) => o.geometry && o.geometry.dispose());
    for (const id of ['endScreen', 'deathScreen', 'scoreboard', 'scopeOverlay', 'chatInput', 'clickToPlay']) $(id).classList.add('hidden');
    $('killfeed').innerHTML = '';
    $('chatLog').innerHTML = '';
    this.onExit(reason);
  }
}
