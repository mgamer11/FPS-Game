// Per-map weather: a cloud of particles that follows the camera. Purely decoration.
import * as THREE from 'three';

// vel: blocks per second, sway: sideways wobble, streak: draw as a falling line (rain)
const TYPES = {
  snow: { count: 700, color: 0xffffff, size: 0.11, opacity: 0.9, vel: [0.6, -2.2, 0.2], sway: 0.6 },
  rain: { count: 900, color: 0xa9c8e8, opacity: 0.55, vel: [1.5, -22, 0.5], sway: 0, streak: 0.7 },
  embers: { count: 260, color: 0xff8a2a, size: 0.09, opacity: 0.95, vel: [0.3, 1.6, 0.1], sway: 0.9, fog: false },
  dust: { count: 420, color: 0xe8cfa0, size: 0.07, opacity: 0.55, vel: [3.2, -0.15, 0.9], sway: 0.5 },
  leaves: { count: 160, color: 0xc9892b, size: 0.16, opacity: 0.95, vel: [0.9, -1.3, 0.4], sway: 1.3 },
  pollen: { count: 220, color: 0xfff6b0, size: 0.06, opacity: 0.7, vel: [0.35, -0.12, 0.2], sway: 0.5 },
};
const RX = 22, RY = 13; // half-size of the box of weather around the camera

const wrap = (v, r) => ((((v + r) % (2 * r)) + 2 * r) % (2 * r)) - r;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.obj = null;
  }

  clear() {
    if (!this.obj) return;
    this.scene.remove(this.obj);
    this.obj.geometry.dispose();
    this.obj.material.dispose();
    this.obj = null;
  }

  // tops: highest block per column, so nothing falls through roofs or trees
  set(type, world) {
    this.clear();
    const t = this.type = TYPES[type];
    if (!t) return;
    this.world = world;
    this.tops = new Int8Array(world.sx * world.sz);
    for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) this.tops[z * world.sx + x] = world.top(x, z);
    const n = t.count;
    this.rel = new Float32Array(n * 3); // position relative to the camera
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.rel[i * 3] = (Math.random() * 2 - 1) * RX;
      this.rel[i * 3 + 1] = (Math.random() * 2 - 1) * RY;
      this.rel[i * 3 + 2] = (Math.random() * 2 - 1) * RX;
      this.phase[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3 * (t.streak ? 2 : 1));
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // always drawn
    const common = { color: t.color, transparent: true, opacity: t.opacity, depthWrite: false, fog: t.fog !== false };
    this.obj = t.streak
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial(common))
      : new THREE.Points(geo, new THREE.PointsMaterial({ ...common, size: t.size, sizeAttenuation: true }));
    this.obj.frustumCulled = false;
    this.scene.add(this.obj);
    this.last = null;
    this.time = 0;
  }

  update(dt, cam) {
    if (!this.obj) return;
    const t = this.type, { rel, pos, phase, world, tops } = this;
    this.time += dt;
    // keep the particles where they are in the world while the camera moves through them
    const mx = this.last ? cam.x - this.last.x : 0, my = this.last ? cam.y - this.last.y : 0, mz = this.last ? cam.z - this.last.z : 0;
    this.last = { x: cam.x, y: cam.y, z: cam.z };
    const n = t.count;
    for (let i = 0; i < n; i++) {
      const sw = t.sway ? Math.sin(this.time * 1.3 + phase[i]) * t.sway : 0;
      const x = rel[i * 3] = wrap(rel[i * 3] + (t.vel[0] + sw) * dt - mx, RX);
      const y = rel[i * 3 + 1] = wrap(rel[i * 3 + 1] + t.vel[1] * dt - my, RY);
      const z = rel[i * 3 + 2] = wrap(rel[i * 3 + 2] + (t.vel[2] + sw * 0.6) * dt - mz, RX);
      const wx = cam.x + x, wz = cam.z + z;
      let wy = cam.y + y;
      const cx = Math.floor(wx), cz = Math.floor(wz);
      // hide anything under a roof, inside the ground or outside the map
      if (cx < 1 || cz < 1 || cx >= world.sx - 1 || cz >= world.sz - 1 || wy <= tops[cz * world.sx + cx] + 1.05) wy = -999;
      if (t.streak) {
        const j = i * 6;
        pos[j] = wx; pos[j + 1] = wy; pos[j + 2] = wz;
        pos[j + 3] = wx - (t.vel[0] / -t.vel[1]) * t.streak; pos[j + 4] = wy + t.streak; pos[j + 5] = wz - (t.vel[2] / -t.vel[1]) * t.streak;
      } else {
        const j = i * 3;
        pos[j] = wx; pos[j + 1] = wy; pos[j + 2] = wz;
      }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }
}
