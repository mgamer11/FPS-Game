// Computer-controlled players. They live inside the room host and are moved with the
// same movement code as real players, so they obey the same walls, jumps and speeds.
import { WEAPONS } from './shared/weapons.js';
import { B } from './shared/maps.js';
import { LocalPlayer, PLAYER } from './player.js';

export const BOT_SKILLS = {
  easy: { label: 'Easy', react: 1100, err: 0.11, turn: 3.2, view: 30, fireMul: 2.2, headAim: 0 },
  normal: { label: 'Normal', react: 500, err: 0.05, turn: 6, view: 42, fireMul: 1.35, headAim: 0.1 },
  hard: { label: 'Hard', react: 280, err: 0.028, turn: 10, view: 55, fireMul: 1.1, headAim: 0.35 },
};
export const MAX_BOTS = 12;

const NAMES = ['Blocky', 'Pixel', 'Cubert', 'Voxel', 'Brick', 'Chip', 'Nugget', 'Boxer', 'Tetra', 'Dicey', 'Crate', 'Gizmo', 'Rusty', 'Zippy', 'Bolt', 'Pebble'];
const COLORS = ['#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#eab308', '#0ea5e9', '#3b82f6', '#84cc16'];
// which guns a bot will swap up to (it never takes a pickup that isn't an upgrade)
const TIER = { pistol: 0, revolver: 1, smg: 1, shotgun: 1, burst: 2, ar: 2, dmr: 2, lmg: 2, sniper: 2 };
const IDEAL_RANGE = { shotgun: 4, smg: 9, pistol: 11, revolver: 13, ar: 14, burst: 15, lmg: 15, dmr: 22, sniper: 28 };
const RESPAWN_MS = 3200;
const HURT = 55; // below this health a bot goes looking for a health pack

const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class BotManager {
  constructor(host) {
    this.host = host;
  }

  get list() {
    return [...this.host.players.values()].filter((p) => p.bot);
  }

  // Add or remove bots so the room has the number the host asked for (leaving room for people).
  sync() {
    const host = this.host;
    const humans = host.players.size - this.list.length;
    const want = Math.max(0, Math.min(host.settings.bots, host.settings.maxPlayers - humans));
    while (this.list.length > want) this.remove();
    while (this.list.length < want) this.add();
  }

  add() {
    const host = this.host;
    const used = new Set([...host.players.values()].map((p) => p.name));
    const free = NAMES.filter((n) => !used.has('Bot ' + n));
    const name = 'Bot ' + (free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(rand(100, 999)));
    const p = host.makePlayer({ send() {} }, name, COLORS[Math.floor(Math.random() * COLORS.length)]);
    p.bot = this.freshState(Math.random() * 1200);
    host.addPlayer(p);
    return p;
  }

  remove() {
    const bots = this.list;
    const p = bots[bots.length - 1];
    if (!p) return;
    this.host.players.delete(p.id);
    this.host.broadcast({ t: 'pl', id: p.id });
  }

  freshState(respawnJitter = Math.random() * 1500) {
    return {
      body: new LocalPlayer(this.host.map.world),
      path: [], pi: 0, repathAt: 0, goalUntil: 0,
      target: null, seenAt: 0, reactAt: 0, lastKnown: null, alert: 0, alertAt: 0,
      nextThink: 0, nextFire: 0, mag: WEAPONS.pistol.mag, reloadUntil: 0, burstLeft: 0, sprayUntil: 0, restUntil: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeUntil: 0, stuckT: 0, wanderUntil: 0, lastLava: 0,
      aimHead: false, healing: false, respawnJitter,
      skill: BOT_SKILLS[this.host.settings.botSkill] || BOT_SKILLS.normal,
    };
  }

  onMatchStart() {
    for (const p of this.list) {
      p.bot = this.freshState();
      p.w = 'pistol';
    }
  }

  // A bot that gets shot turns to face whoever did it.
  onDamaged(target, attacker) {
    if (!target.bot || attacker === target) return;
    target.bot.alert = attacker.id;
    target.bot.alertAt = Date.now();
  }

  update(dt, now) {
    for (const p of this.list) this.updateBot(p, Math.min(dt, 0.1), now);
  }

  spawn(p, now) {
    const host = this.host, b = p.bot;
    const s = host.chooseSpawn(p);
    const jitter = b.respawnJitter;
    p.bot = this.freshState(jitter);
    p.bot.body.pos.set(s[0], s[1], s[2]);
    const c = host.map.world.sx / 2;
    p.bot.body.yaw = Math.atan2(-(c - s[0]), -(c - s[2]));
    p.w = 'pistol';
    p.dead = false;
    p.hp = 100;
    p.prot = now + 1500;
    p.pos = [s[0], s[1], s[2]];
    p.yaw = p.bot.body.yaw;
    p.pitch = 0;
    host.broadcast({ t: 'spawn', id: p.id, p: p.pos });
  }

  canSee(p, q, now) {
    const b = p.bot, body = b.body;
    const ox = body.pos.x, oy = body.pos.y + PLAYER.eye, oz = body.pos.z;
    const dx = q.pos[0] - ox, dy = q.pos[1] + (q.flags & 4 ? 0.6 : 1.0) - oy, dz = q.pos[2] - oz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > b.skill.view || dist < 0.01) return dist < 0.01;
    const alerted = b.alert === q.id && now - b.alertAt < 3000;
    if (dist > 7 && !alerted && b.target !== q) {
      const facing = Math.abs(angleDiff(Math.atan2(-dx, -dz), body.yaw));
      if (facing > 1.9) return false; // behind the bot
    }
    const hit = this.host.map.world.raycast(ox, oy, oz, dx / dist, dy / dist, dz / dist, dist);
    return !hit || hit.t >= dist - 0.4;
  }

  think(p, now) {
    const host = this.host, b = p.bot, body = b.body, nav = host.nav;
    b.skill = BOT_SKILLS[host.settings.botSkill] || BOT_SKILLS.normal;
    // who to shoot at: the nearest enemy the bot can see
    let best = null, bestD = Infinity;
    for (const q of host.players.values()) {
      if (q === p || q.dead || !host.isEnemy(p, q) || now < q.prot) continue;
      if (!this.canSee(p, q, now)) continue;
      const d = Math.hypot(q.pos[0] - body.pos.x, q.pos[1] - body.pos.y, q.pos[2] - body.pos.z);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) {
      if (b.target !== best) {
        b.reactAt = now + b.skill.react * rand(0.7, 1.3);
        b.aimHead = Math.random() < b.skill.headAim;
      }
      b.target = best;
      b.seenAt = now;
      b.lastKnown = best.pos.slice();
    } else if (b.target && (b.target.dead || now - b.seenAt > 1500)) {
      b.target = null;
    }

    // where to walk
    const me = nav.nodeNear(body.pos.x, body.pos.y, body.pos.z);
    if (me < 0) return;
    if (b.target) {
      if (now >= b.repathAt) {
        b.repathAt = now + 600;
        this.setPath(b, nav.path(me, nav.nodeNear(b.target.pos[0], b.target.pos[1], b.target.pos[2])));
      }
      return;
    }
    if (p.hp < HURT && !b.healing && host.pickups.some((pk) => pk.active && pk.type === 'health')) b.goalUntil = 0;
    if (b.pi < b.path.length && now < b.goalUntil) return;
    b.goalUntil = now + 20000;
    // lost sight of someone: go and look where they were
    if (b.lastKnown) {
      const goal = nav.nodeNear(b.lastKnown[0], b.lastKnown[1], b.lastKnown[2]);
      b.lastKnown = null;
      if (this.setPath(b, nav.path(me, goal))) return;
    }
    for (let tries = 0; tries < 5; tries++) {
      const spot = this.pickGoal(p);
      if (this.setPath(b, nav.path(me, nav.nodeNear(spot[0], spot[1], spot[2])))) return;
    }
  }

  setPath(b, path) {
    if (!path.length) return false;
    b.path = path;
    b.pi = 0;
    return true;
  }

  // Somewhere interesting to walk to: a better gun, or just another part of the map.
  pickGoal(p) {
    const host = this.host, body = p.bot.body;
    const near = (a, b) => Math.hypot(a.x - body.pos.x, a.z - body.pos.z) - Math.hypot(b.x - body.pos.x, b.z - body.pos.z);
    p.bot.healing = false;
    if (p.hp < HURT) {
      const packs = host.pickups.filter((pk) => pk.active && pk.type === 'health').sort(near);
      if (packs.length) { p.bot.healing = true; return [packs[0].x, packs[0].y, packs[0].z]; }
    }
    const wanted = host.pickups.filter((pk) => pk.active && this.wants(p, pk));
    if (wanted.length && Math.random() < 0.75) {
      wanted.sort(near);
      const pk = wanted[Math.floor(Math.random() * Math.min(3, wanted.length))];
      return [pk.x, pk.y, pk.z];
    }
    const spawns = host.map.spawns;
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  wants(p, pk) {
    return pk.type in TIER && TIER[pk.type] > TIER[p.w];
  }

  updateBot(p, dt, now) {
    const host = this.host;
    const b = p.bot;
    if (p.dead) {
      if (host.state === 'playing' && now - p.deathAt > RESPAWN_MS + b.respawnJitter) this.spawn(p, now);
      return;
    }
    if (host.state !== 'playing') return;
    const body = b.body, nav = host.nav;
    if (now >= b.nextThink) {
      b.nextThink = now + rand(180, 280);
      this.think(p, now);
    }
    const skill = b.skill;
    const w = WEAPONS[p.w];
    const t = b.target && !b.target.dead ? b.target : null;
    const px = body.pos.x, py = body.pos.y, pz = body.pos.z;

    // ---- follow the path
    let wish = null, jump = false;
    while (b.pi < b.path.length) {
      const n = b.path[b.pi];
      const hd = Math.hypot(nav.x[n] + 0.5 - px, nav.z[n] + 0.5 - pz);
      if (hd < 0.4 && Math.abs(nav.y[n] - py) < 1.1) b.pi++;
      else break;
    }
    if (b.pi < b.path.length) {
      const n = b.path[b.pi];
      const dx = nav.x[n] + 0.5 - px, dz = nav.z[n] + 0.5 - pz;
      const hd = Math.hypot(dx, dz);
      if (hd > 3.5) { b.path = []; b.repathAt = 0; b.goalUntil = 0; } // knocked off the route
      else {
        if (hd > 0.05) wish = [dx / hd, dz / hd];
        if (nav.y[n] > py + 0.4 && hd < 1.5) jump = true;
      }
    }

    // ---- fighting: face the enemy, keep a sensible distance, strafe
    let wantYaw = wish ? Math.atan2(-wish[0], -wish[1]) : body.yaw;
    let wantPitch = 0;
    let canFire = false;
    if (t) {
      const ex = t.pos[0] - px, ez = t.pos[2] - pz;
      const low = t.flags & 4; // crouching target
      const ey = t.pos[1] + (b.aimHead ? (low ? 1.1 : 1.62) : (low ? 0.55 : 1.0)) - (py + PLAYER.eye);
      const hd = Math.hypot(ex, ez);
      wantYaw = Math.atan2(-ex, -ez);
      wantPitch = Math.atan2(ey, hd);
      const seen = now - b.seenAt < 400;
      if (seen && hd < (IDEAL_RANGE[p.w] || 12)) {
        if (now > b.strafeUntil) { b.strafe = -b.strafe; b.strafeUntil = now + rand(500, 1400); }
        let sx = (-ez / (hd || 1)) * b.strafe, sz = (ex / (hd || 1)) * b.strafe;
        // don't strafe off a ledge or into lava
        const ahead = nav.nodeNear(px + sx * 0.8, py, pz + sz * 0.8);
        if (ahead < 0 || nav.y[ahead] < py - 1.2) { b.strafe = -b.strafe; sx = 0; sz = 0; }
        wish = sx || sz ? [sx, sz] : null;
        jump = false;
      }
      canFire = seen && now >= b.reactAt;
    }

    // ---- unstick: hop, then give up on this route
    const before = [px, pz];
    body.yaw += Math.max(-skill.turn * dt, Math.min(skill.turn * dt, angleDiff(wantYaw, body.yaw)));
    body.pitch += Math.max(-skill.turn * dt, Math.min(skill.turn * dt, wantPitch - body.pitch));
    if (b.stuckT > 0.3) jump = true;
    const sprint = !t && b.path.length - b.pi > 5;
    body.update(dt, { wish: wish || [0, 0], jump: jump && body.onGround, sprint }, w.moveMul || 1);
    body.events.length = 0;
    if (wish) {
      const moved = Math.hypot(body.pos.x - before[0], body.pos.z - before[1]);
      b.stuckT = moved < PLAYER.walk * dt * 0.25 ? b.stuckT + dt : 0;
      if (b.stuckT > 1.4) { b.stuckT = 0; b.path = []; b.repathAt = 0; b.goalUntil = 0; b.strafe = -b.strafe; }
    } else b.stuckT = 0;

    // ---- shooting
    if (now >= b.reloadUntil && b.mag <= 0) b.mag = w.mag;
    if (b.burstLeft > 0 && now >= b.nextFire && b.mag > 0) {
      b.burstLeft--;
      this.shoot(p, now, w);
    } else if (canFire && now >= b.nextFire && now >= b.reloadUntil && now >= b.restUntil && b.mag > 0 &&
      Math.abs(angleDiff(wantYaw, body.yaw)) < 0.2 && Math.abs(wantPitch - body.pitch) < 0.25) {
      // automatic guns are fired in short sprays with pauses
      if (w.auto) {
        if (now > b.sprayUntil + 200) b.sprayUntil = now + rand(450, 1100);
        else if (now > b.sprayUntil) { b.restUntil = now + rand(250, 600) * skill.fireMul; b.sprayUntil = 0; }
      }
      if (now >= b.restUntil) {
        if (w.burst) b.burstLeft = w.burst - 1;
        this.shoot(p, now, w);
      }
    }
    if (b.mag <= 0 && now >= b.reloadUntil) b.reloadUntil = now + w.reload * 1000;

    // ---- walking over a better gun picks it up
    for (const pk of host.pickups) {
      const health = pk.type === 'health';
      if (!pk.active || (health ? p.hp > 99 : !this.wants(p, pk))) continue;
      const dx = pk.x - body.pos.x, dz = pk.z - body.pos.z, dy = body.pos.y - pk.y;
      if (dx * dx + dz * dz < 1.2 && dy > -1 && dy < 1.6) {
        if (!host.takePickup(pk, p)) continue;
        b.goalUntil = 0;
        if (health) continue;
        p.w = pk.type;
        b.mag = WEAPONS[pk.type].mag;
        b.reloadUntil = 0;
        b.burstLeft = 0;
        b.nextFire = now + 400;
        b.goalUntil = 0;
      }
    }

    // ---- lava hurts bots too
    const under = host.map.world.get(Math.floor(body.pos.x), Math.floor(body.pos.y - 0.05), Math.floor(body.pos.z));
    if (under === B.LAVA && body.onGround && now - b.lastLava > 500) {
      b.lastLava = now;
      host.applyDamage(p, p, 12, 'lava', false);
    }

    p.pos = [body.pos.x, body.pos.y, body.pos.z];
    p.yaw = body.yaw;
    p.pitch = body.pitch;
    p.flags = body.sprinting ? 1 : 0;
  }

  shoot(p, now, w) {
    const host = this.host, b = p.bot, body = b.body, skill = b.skill;
    b.mag--;
    const slow = p.w === 'sniper' ? 1.5 : 1;
    b.nextFire = now + (b.burstLeft > 0 ? w.burstGap * 1000 : w.rate * 1000 * (w.auto ? 1 : skill.fireMul * slow * rand(1, 1.5)));
    const err = skill.err * slow + (w.pellets > 1 ? 0 : w.spread * 0.5);
    const yaw = body.yaw + gauss() * err, pitch = body.pitch + gauss() * err;
    const origin = [body.pos.x, body.pos.y + PLAYER.eye, body.pos.z];
    const ends = [];
    const hits = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const y2 = yaw + (w.pellets > 1 ? gauss() * w.spread : 0), p2 = pitch + (w.pellets > 1 ? gauss() * w.spread : 0);
      const cp = Math.cos(p2);
      const dir = [-Math.sin(y2) * cp, Math.sin(p2), -Math.cos(y2) * cp];
      const res = host.trace(origin, dir, w.range, p);
      ends.push(res.point.map((v) => +v.toFixed(2)));
      if (res.player && host.isEnemy(p, res.player)) {
        let dmg = w.dmg * (res.head ? w.head : 1);
        if (w.falloff) {
          const [near, far] = w.falloff;
          dmg *= res.t <= near ? 1 : Math.max(0.3, Math.min(0.9, 0.9 - ((res.t - near) / (far - near)) * 0.6));
        }
        const h = hits.get(res.player) || { dmg: 0, head: false };
        h.dmg += dmg;
        h.head = h.head || res.head;
        hits.set(res.player, h);
      }
    }
    host.broadcast({ t: 'shot', id: p.id, w: p.w, e: ends });
    for (const [target, h] of hits) host.applyDamage(p, target, h.dmg, p.w, h.head);
  }
}
