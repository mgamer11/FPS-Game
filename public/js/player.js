// Local player movement + collision against the block world.
import * as THREE from 'three';

export const PLAYER = {
  half: 0.3, height: 1.8, eye: 1.6,
  walk: 5.6, sprint: 8.8, jump: 8.6, gravity: 26,
  dashSpeed: 24, dashTime: 0.17, dashCooldown: 2.2,
};

export class LocalPlayer {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.dashCd = 0;
    this.dashT = 0;
    this.sprinting = false;
    this.events = [];
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  collides(x, y, z) {
    const h = PLAYER.half, w = this.world;
    const x0 = Math.floor(x - h), x1 = Math.floor(x + h - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + PLAYER.height - 1e-6);
    const z0 = Math.floor(z - h), z1 = Math.floor(z + h - 1e-6);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) if (w.solid(xx, yy, zz)) return true;
    return false;
  }

  moveAxis(axis, d) {
    if (d === 0) return false;
    const p = this.pos;
    const steps = Math.ceil(Math.abs(d) / 0.25);
    const sd = d / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === 0 ? p.x + sd : p.x;
      const ny = axis === 1 ? p.y + sd : p.y;
      const nz = axis === 2 ? p.z + sd : p.z;
      if (!this.collides(nx, ny, nz)) {
        p.set(nx, ny, nz);
        continue;
      }
      // snap flush against the block we hit
      if (axis === 0) p.x = sd > 0 ? Math.floor(nx + PLAYER.half) - PLAYER.half - 1e-4 : Math.floor(nx - PLAYER.half) + 1 + PLAYER.half + 1e-4;
      if (axis === 1) p.y = sd > 0 ? Math.floor(ny + PLAYER.height) - PLAYER.height - 1e-4 : Math.floor(ny) + 1;
      if (axis === 2) p.z = sd > 0 ? Math.floor(nz + PLAYER.half) - PLAYER.half - 1e-4 : Math.floor(nz - PLAYER.half) + 1 + PLAYER.half + 1e-4;
      if (this.collides(p.x, p.y, p.z)) {
        // safety: undo if the snap is invalid
        if (axis === 0) p.x -= sd; else if (axis === 1) p.y -= sd; else p.z -= sd;
        if (this.collides(p.x, p.y, p.z)) { if (axis === 0) p.x += sd; else if (axis === 1) p.y += sd; else p.z += sd; }
      }
      return true;
    }
    return false;
  }

  // input: {f, b, l, r, sprint, jump, dash, zoom}
  update(dt, input, speedMul = 1) {
    this.dashCd = Math.max(0, this.dashCd - dt);
    const v = this.vel;
    let ix = 0, iz = 0;
    if (input.f) iz -= 1;
    if (input.b) iz += 1;
    if (input.l) ix -= 1;
    if (input.r) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos + iz * sin;
    const wz = -ix * sin + iz * cos;
    this.sprinting = !!input.sprint && input.f && !input.zoom;
    let speed = (this.sprinting ? PLAYER.sprint : PLAYER.walk) * speedMul;
    if (input.zoom) speed *= 0.65;

    if (input.dash && this.dashCd <= 0) {
      const dir = this.forward(new THREE.Vector3());
      if (len > 0 && Math.abs(this.pitch) < 0.2) dir.set(wx, 0, wz);
      dir.y = THREE.MathUtils.clamp(dir.y, -0.3, 0.45);
      dir.normalize();
      v.copy(dir).multiplyScalar(PLAYER.dashSpeed);
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCooldown;
      this.events.push('dash');
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) v.multiplyScalar(0.35);
    } else {
      const accel = this.onGround ? 14 : 3.5;
      const k = Math.min(1, accel * dt);
      const tx = wx * speed, tz = wz * speed;
      // in the air keep momentum unless steering
      if (this.onGround || len > 0) {
        v.x += (tx - v.x) * k;
        v.z += (tz - v.z) * k;
      }
      v.y -= PLAYER.gravity * dt;
    }

    if (input.jump && this.onGround) {
      v.y = PLAYER.jump;
      this.onGround = false;
      this.events.push('jump');
    }

    const wasGround = this.onGround;
    const fallSpeed = v.y;
    if (this.moveAxis(0, v.x * dt)) v.x = 0;
    if (this.moveAxis(2, v.z * dt)) v.z = 0;
    this.onGround = false;
    if (this.moveAxis(1, v.y * dt)) {
      if (v.y < 0) this.onGround = true;
      v.y = 0;
    }
    if (!this.onGround && v.y <= 0 && this.collides(this.pos.x, this.pos.y - 0.02, this.pos.z)) this.onGround = true;
    if (this.onGround && !wasGround && fallSpeed < -9) this.events.push('land');
    v.y = Math.max(v.y, -40);
  }
}
