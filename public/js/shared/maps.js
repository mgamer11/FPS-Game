// Procedural blocky maps. Every map uses a fixed seed so all players (and the server)
// build exactly the same world from just the map number.
import { mulberry32 } from './rng.js';
import { VoxelWorld } from './voxel.js';
import { PICKUP_WEAPONS } from './weapons.js';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, PLANK: 4, LOG: 5, LEAVES: 6, SAND: 7, SANDSTONE: 8,
  BRICK: 9, CONCRETE: 10, SNOW: 11, ICE: 12, METAL: 13, BASALT: 14, LAVA: 15, CRATE: 16,
  ROOF: 17, BEDROCK: 18, CACTUS: 19, PINE: 20, STONEBRICK: 21, MOSSY: 22, CONT_RED: 23,
  CONT_BLUE: 24, CONT_GREEN: 25, ASPHALT: 26, WATER: 27, CLAY: 28, GRAVEL: 29, SANDBAG: 30,
  PLASTER: 31, DARKPLANK: 32, LINE: 33, CAR_RED: 34, CAR_BLUE: 35, GLASS: 36, SNOWROOF: 37,
};

export const SIZE = 72;
export const HEIGHT = 40;

// Deterministic Fisher-Yates shuffle (Array.sort with a random comparator gives
// different results in different browsers, which would make players' maps differ).
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function smoothNoise(rng, cell) {
  const g = Math.ceil(SIZE / cell) + 3;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, z) => {
    const fx = x / cell, fz = z / cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = sm(fx - ix), tz = sm(fz - iz);
    const a = grid[iz * g + ix], b = grid[iz * g + ix + 1];
    const c = grid[(iz + 1) * g + ix], d = grid[(iz + 1) * g + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

class Builder {
  constructor(def) {
    this.def = def;
    this.r = mulberry32(def.seed);
    this.w = new VoxelWorld(SIZE, HEIGHT, SIZE);
    this.reserved = new Uint8Array(SIZE * SIZE);
    this.maxH = 0;
  }
  rand() { return this.r(); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  chance(p) { return this.r() < p; }
  get(x, y, z) { return this.w.get(x, y, z); }
  set(x, y, z, b) { this.w.set(x, y, z, b); }

  fill(x0, y0, z0, x1, y1, z1, b) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) this.w.set(x, y, z, b);
  }

  top(x, z) { return this.w.top(x, z); }
  surface(x, z) { return this.w.top(x, z) + 1; }

  terrain({ base = 6, amp = 3, scale = 18, top, sub, deep = B.STONE, heightFn, layerFn }) {
    const n1 = smoothNoise(this.r, scale);
    const n2 = smoothNoise(this.r, Math.max(4, scale / 2.5));
    this.noise = n1;
    this.noise2 = n2;
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        let h = heightFn
          ? heightFn(x, z, n1, n2)
          : base + Math.round(((n1(x, z) * 0.75 + n2(x, z) * 0.25) - 0.5) * 2 * amp);
        h = Math.max(2, Math.min(HEIGHT - 14, h));
        this.maxH = Math.max(this.maxH, h);
        this.set(x, 0, z, B.BEDROCK);
        for (let y = 1; y < h; y++) {
          let b;
          if (layerFn) b = layerFn(x, y, z, h);
          else b = y === h - 1 ? top : y >= h - 3 ? sub : deep;
          this.set(x, y, z, b);
        }
      }
    }
  }

  isFree(x0, z0, x1, z1) {
    if (x0 < 2 || z0 < 2 || x1 > SIZE - 3 || z1 > SIZE - 3) return false;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (this.reserved[z * SIZE + x]) return false;
    return true;
  }

  reserve(x0, z0, x1, z1) {
    for (let z = Math.max(0, z0); z <= Math.min(SIZE - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x++) this.reserved[z * SIZE + x] = 1;
  }

  findSpot(w, d, margin = 2, tries = 120, area) {
    const [ax, az, bx, bz] = area || [3, 3, SIZE - 4, SIZE - 4];
    for (let i = 0; i < tries; i++) {
      const x = this.ri(ax, Math.max(ax, bx - w + 1));
      const z = this.ri(az, Math.max(az, bz - d + 1));
      if (this.isFree(x - margin, z - margin, x + w - 1 + margin, z + d - 1 + margin)) return { x, z };
    }
    return null;
  }

  avgSurface(x0, z0, x1, z1) {
    let s = 0, n = 0;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) { s += this.surface(x, z); n++; }
    return Math.round(s / n);
  }

  flatten(x0, z0, x1, z1, y, topB, subB) {
    topB = topB ?? this.def.ground.top;
    subB = subB ?? this.def.ground.sub;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (x < 1 || z < 1 || x > SIZE - 2 || z > SIZE - 2) continue;
        for (let yy = y; yy < HEIGHT; yy++) this.set(x, yy, z, B.AIR);
        for (let yy = 1; yy < y - 1; yy++) if (this.get(x, yy, z) === B.AIR) this.set(x, yy, z, subB);
        this.set(x, y - 1, z, topB);
      }
  }

  // A building with doors, windows, inside stairs and an optional walkable roof.
  house(x0, z0, w, d, o = {}) {
    const stories = o.stories || 1;
    const wall = o.wall ?? B.PLANK;
    const floor = o.floor ?? B.PLANK;
    const pillar = o.pillar ?? wall;
    const roof = o.roof || 'flat';
    const roofBlock = o.roofBlock ?? wall;
    const x1 = x0 + w - 1, z1 = z0 + d - 1;
    const by = o.y ?? this.avgSurface(x0, z0, x1, z1);
    this.flatten(x0 - 1, z0 - 1, x1 + 1, z1 + 1, by, o.groundTop);
    this.reserve(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    const H = stories * 4;

    this.fill(x0, by - 1, z0, x1, by - 1, z1, floor);
    for (let y = by; y <= by + H - 2; y++) {
      for (let x = x0; x <= x1; x++) { this.set(x, y, z0, wall); this.set(x, y, z1, wall); }
      for (let z = z0; z <= z1; z++) { this.set(x0, y, z, wall); this.set(x1, y, z, wall); }
      this.set(x0, y, z0, pillar); this.set(x1, y, z0, pillar);
      this.set(x0, y, z1, pillar); this.set(x1, y, z1, pillar);
    }
    for (let s = 1; s < stories; s++) this.fill(x0 + 1, by + s * 4 - 1, z0 + 1, x1 - 1, by + s * 4 - 1, z1 - 1, floor);
    this.fill(x0, by + H - 1, z0, x1, by + H - 1, z1, roof === 'flat' ? roofBlock : floor);

    // Stairs between floors (alternating sides), and up to the roof when it's flat.
    const flights = roof === 'flat' && o.roofAccess !== false ? stories : stories - 1;
    for (let s = 0; s < flights; s++) {
      const fy = by + s * 4;
      const left = s % 2 === 0;
      const xs = left ? [x0 + 1, x0 + 2] : [x1 - 2, x1 - 1];
      for (let i = 0; i < 3; i++) {
        const z = left ? z0 + 1 + i : z1 - 1 - i;
        for (const x of xs) {
          this.fill(x, fy, z, x, fy + i, z, o.stairBlock ?? floor);
          this.set(x, fy + 3, z, B.AIR);
        }
      }
    }

    // Parapet around a flat roof
    if (roof === 'flat' && o.parapet !== false) {
      const y = by + H;
      for (let x = x0; x <= x1; x++) {
        if (!o.crenel || x % 2 === 0) { this.set(x, y, z0, wall); this.set(x, y, z1, wall); }
      }
      for (let z = z0; z <= z1; z++) {
        if (!o.crenel || z % 2 === 0) { this.set(x0, y, z, wall); this.set(x1, y, z, wall); }
      }
    }

    // Pitched roof along the longer side
    if (roof === 'pitched') {
      const alongX = w >= d;
      const span = alongX ? d : w;
      for (let k = 0; k <= Math.ceil(span / 2) + 1; k++) {
        const y = by + H + k;
        const lo = (alongX ? z0 : x0) - 1 + k;
        const hi = (alongX ? z1 : x1) + 1 - k;
        if (lo > hi) break;
        if (alongX) {
          this.fill(x0 - 1, y, lo, x1 + 1, y, lo, roofBlock);
          this.fill(x0 - 1, y, hi, x1 + 1, y, hi, roofBlock);
          if (hi - lo <= 1) this.fill(x0 - 1, y, lo, x1 + 1, y, hi, roofBlock);
          else { this.fill(x0, y, lo + 1, x0, y, hi - 1, wall); this.fill(x1, y, lo + 1, x1, y, hi - 1, wall); }
        } else {
          this.fill(lo, y, z0 - 1, lo, y, z1 + 1, roofBlock);
          this.fill(hi, y, z0 - 1, hi, y, z1 + 1, roofBlock);
          if (hi - lo <= 1) this.fill(lo, y, z0 - 1, hi, y, z1 + 1, roofBlock);
          else { this.fill(lo + 1, y, z0, hi - 1, y, z0, wall); this.fill(lo + 1, y, z1, hi - 1, y, z1, wall); }
        }
      }
    }

    // Windows
    if (o.windows !== false) {
      for (let s = 0; s < stories; s++) {
        const y = by + s * 4 + 1;
        const tall = o.tallWindows;
        for (let x = x0 + 2; x <= x1 - 2; x++) {
          if ((x - x0) % 4 === 1 || (x - x0) % 4 === 2) {
            for (const z of [z0, z1]) {
              this.set(x, y, z, o.glass ? B.GLASS : B.AIR);
              if (tall) this.set(x, y + 1, z, o.glass ? B.GLASS : B.AIR);
            }
          }
        }
        for (let z = z0 + 2; z <= z1 - 2; z++) {
          if ((z - z0) % 4 === 1 || (z - z0) % 4 === 2) {
            for (const x of [x0, x1]) {
              this.set(x, y, z, o.glass ? B.GLASS : B.AIR);
              if (tall) this.set(x, y + 1, z, o.glass ? B.GLASS : B.AIR);
            }
          }
        }
      }
    }

    // Doors (ground floor) - always at least two so you can't get trapped.
    const doorW = o.doorW || 2;
    const doorH = o.doorH || 3;
    const sides = o.doors || shuffle(['n', 's', 'e', 'w'], this.r).slice(0, 2);
    for (const side of sides) {
      if (side === 'n' || side === 's') {
        const z = side === 'n' ? z0 : z1;
        const cx = Math.floor((x0 + x1) / 2) - Math.floor(doorW / 2) + 1;
        this.fill(cx, by, z, cx + doorW - 1, by + doorH - 1, z, B.AIR);
      } else {
        const x = side === 'w' ? x0 : x1;
        const cz = Math.floor((z0 + z1) / 2) - Math.floor(doorW / 2) + 1;
        this.fill(x, by, cz, x, by + doorH - 1, cz + doorW - 1, B.AIR);
      }
    }

    // A couple of crates inside for cover
    if (o.props !== false && w >= 7 && d >= 7) {
      if (this.chance(0.7)) this.set(x1 - 1, by, z1 - 1, B.CRATE);
      if (this.chance(0.5)) this.set(x1 - 1, by, z0 + 1, B.CRATE);
      if (this.chance(0.3)) this.set(x1 - 1, by + 1, z1 - 1, B.CRATE);
    }
    return { x0, z0, x1, z1, by, H };
  }

  // Watchtower with a staircase on its side.
  tower(x0, z0, o = {}) {
    const post = o.post ?? B.LOG, plat = o.plat ?? B.PLANK, rail = o.rail ?? B.PLANK;
    const by = this.avgSurface(x0 - 1, z0 - 1, x0 + 9, z0 + 3);
    this.flatten(x0 - 2, z0 - 2, x0 + 10, z0 + 4, by);
    this.reserve(x0 - 2, z0 - 2, x0 + 10, z0 + 4);
    const P = by + 5;
    for (const [px, pz] of [[x0 - 1, z0 - 1], [x0 + 3, z0 - 1], [x0 - 1, z0 + 3], [x0 + 3, z0 + 3]]) {
      this.fill(px, by, pz, px, P + 3, pz, post);
    }
    this.fill(x0 - 1, P, z0 - 1, x0 + 3, P, z0 + 3, plat);
    for (let x = x0 - 1; x <= x0 + 3; x++) { this.set(x, P + 1, z0 - 1, rail); this.set(x, P + 1, z0 + 3, rail); }
    for (let z = z0 - 1; z <= z0 + 3; z++) { this.set(x0 - 1, P + 1, z, rail); this.set(x0 + 3, P + 1, z, rail); }
    this.fill(x0 - 1, P + 4, z0 - 1, x0 + 3, P + 4, z0 + 3, o.roof ?? plat);
    for (let i = 0; i <= 5; i++) {
      const x = x0 + 9 - i;
      this.fill(x, by, z0 + 1, x, by + i, z0 + 2, plat);
    }
    this.fill(x0 + 3, P + 1, z0 + 1, x0 + 3, P + 1, z0 + 2, B.AIR);
  }

  // Shipping container you can walk through.
  container(x0, z0, alongX, block, y) {
    const L = 8, W = 4, Hh = 4;
    const x1 = alongX ? x0 + L - 1 : x0 + W - 1;
    const z1 = alongX ? z0 + W - 1 : z0 + L - 1;
    const by = y ?? this.avgSurface(x0, z0, x1, z1);
    if (y === undefined) { this.flatten(x0 - 1, z0 - 1, x1 + 1, z1 + 1, by); this.reserve(x0 - 1, z0 - 1, x1 + 1, z1 + 1); }
    this.fill(x0, by, z0, x1, by + Hh - 1, z1, block);
    if (alongX) this.fill(x0, by, z0 + 1, x1, by + Hh - 2, z1 - 1, B.AIR);
    else this.fill(x0 + 1, by, z0, x1 - 1, by + Hh - 2, z1, B.AIR);
    if (this.chance(0.5)) {
      // close one end
      if (alongX) this.fill(x1, by, z0, x1, by + Hh - 1, z1, block);
      else this.fill(x0, by, z1, x1, by + Hh - 1, z1, block);
    }
    return by + Hh;
  }

  canGrow(x, z, ok) {
    if (x < 3 || z < 3 || x > SIZE - 4 || z > SIZE - 4) return -1;
    if (this.reserved[z * SIZE + x]) return -1;
    const t = this.top(x, z);
    if (!ok.includes(this.get(x, t, z))) return -1;
    return t + 1;
  }

  oak(x, z, leaves = B.LEAVES, trunk = B.LOG, big = false) {
    const y = this.canGrow(x, z, [B.GRASS, B.DIRT, B.SNOW, B.SAND, B.MOSSY]);
    if (y < 0 || !this.isFree(x - 2, z - 2, x + 2, z + 2)) return;
    const h = big ? this.ri(6, 8) : this.ri(4, 5);
    const r = big ? 3 : 2;
    for (let dy = -2; dy <= 1; dy++) {
      const rr = dy >= 1 ? r - 1 : r;
      for (let dx = -rr; dx <= rr; dx++)
        for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) === rr && Math.abs(dz) === rr && this.chance(0.6)) continue;
          if (this.get(x + dx, y + h + dy, z + dz) === B.AIR) this.set(x + dx, y + h + dy, z + dz, leaves);
        }
    }
    this.fill(x, y, z, x, y + h - 1, z, trunk);
  }

  pine(x, z, leaves = B.PINE, snowy = false) {
    const y = this.canGrow(x, z, [B.GRASS, B.DIRT, B.SNOW, B.MOSSY]);
    if (y < 0 || !this.isFree(x - 2, z - 2, x + 2, z + 2)) return;
    const h = this.ri(6, 8);
    const layers = [2, 1, 2, 1, 1, 0];
    for (let i = 0; i < layers.length; i++) {
      const yy = y + h - layers.length + 2 + i;
      const r = layers[i];
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          this.set(x + dx, yy, z + dz, snowy && i % 2 === 1 ? B.SNOW : leaves);
        }
    }
    this.set(x, y + h + 1, z, snowy ? B.SNOW : leaves);
    this.fill(x, y, z, x, y + h - 1, z, B.LOG);
  }

  cactus(x, z) {
    const y = this.canGrow(x, z, [B.SAND, B.CLAY]);
    if (y < 0 || !this.isFree(x - 1, z - 1, x + 1, z + 1)) return;
    const h = this.ri(2, 4);
    this.fill(x, y, z, x, y + h - 1, z, B.CACTUS);
    if (h >= 3 && this.chance(0.5)) {
      const dx = this.chance(0.5) ? 1 : -1;
      this.set(x + dx, y + 1, z, B.CACTUS);
      this.set(x + dx, y + 2, z, B.CACTUS);
    }
  }

  deadTree(x, z, block = B.LOG) {
    const y = this.canGrow(x, z, [B.BASALT, B.SAND, B.CLAY, B.DIRT, B.GRASS, B.GRAVEL, B.STONE]);
    if (y < 0 || !this.isFree(x - 2, z - 2, x + 2, z + 2)) return;
    const h = this.ri(3, 6);
    this.fill(x, y, z, x, y + h - 1, z, block);
    for (let i = 0; i < 2; i++) {
      const dx = this.pick([-1, 0, 1]), dz = dx === 0 ? this.pick([-1, 1]) : 0;
      const yy = y + this.ri(2, h - 1);
      this.set(x + dx, yy, z + dz, block);
      this.set(x + dx * 2, yy + 1, z + dz * 2, block);
    }
  }

  palm(x, z) {
    const y = this.canGrow(x, z, [B.SAND, B.GRASS]);
    if (y < 0 || !this.isFree(x - 3, z - 3, x + 3, z + 3)) return;
    const h = this.ri(5, 7);
    this.fill(x, y, z, x, y + h - 1, z, B.LOG);
    const t = y + h;
    this.set(x, t, z, B.LEAVES);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.set(x + dx, t, z + dz, B.LEAVES);
      this.set(x + dx * 2, t, z + dz * 2, B.LEAVES);
      this.set(x + dx * 3, t - 1, z + dz * 3, B.LEAVES);
    }
  }

  rock(cx, cz, r, block = B.STONE, cap) {
    if (!this.isFree(cx - r, cz - r, cx + r, cz + r)) return;
    const by = this.surface(cx, cz) - 1;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (let dy = 0; dy <= r * 1.5; dy++) {
          const dist = Math.sqrt(dx * dx + dz * dz + dy * 0.9 * (dy * 0.9));
          if (dist <= r + this.rand() * 0.6 - 0.2) this.set(cx + dx, by + dy, cz + dz, block);
        }
    if (cap) {
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const t = this.top(cx + dx, cz + dz);
          if (this.get(cx + dx, t, cz + dz) === block) this.set(cx + dx, t, cz + dz, cap);
        }
    }
  }

  bush(x, z, block = B.LEAVES) {
    const y = this.canGrow(x, z, [B.GRASS, B.DIRT, B.MOSSY, B.SNOW]);
    if (y < 0) return;
    this.set(x, y, z, block);
    if (this.chance(0.5)) this.set(x + this.pick([-1, 1]), y, z, block);
    if (this.chance(0.3)) this.set(x, y + 1, z, block);
  }

  crates(x, z, n = 3) {
    if (!this.isFree(x - 1, z - 1, x + 2, z + 2)) return;
    const y = this.surface(x, z);
    const spots = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let i = 0; i < n; i++) {
      const [dx, dz] = spots[i % 4];
      const yy = i >= 4 ? y + 1 : y;
      this.set(x + dx, Math.max(yy, this.surface(x + dx, z + dz)), z + dz, B.CRATE);
    }
    if (this.chance(0.4)) this.set(x, this.surface(x, z), z, B.CRATE);
    this.reserve(x, z, x + 1, z + 1);
  }

  wallLine(x, z, len, alongX, h, block) {
    for (let i = 0; i < len; i++) {
      const xx = alongX ? x + i : x, zz = alongX ? z : z + i;
      if (!this.isFree(xx, zz, xx, zz)) continue;
      const y = this.surface(xx, zz);
      this.fill(xx, y, zz, xx, y + h - 1, zz, block);
    }
  }

  scatter(n, fn, tries = 6) {
    for (let i = 0; i < n * tries && n > 0; i++) {
      const x = this.ri(3, SIZE - 4), z = this.ri(3, SIZE - 4);
      if (fn(x, z) !== false) n--;
    }
  }

  border(block) {
    const h = Math.min(HEIGHT - 1, this.maxH + 7);
    for (let i = 0; i < SIZE; i++) {
      this.fill(i, 0, 0, i, h, 0, block);
      this.fill(i, 0, SIZE - 1, i, h, SIZE - 1, block);
      this.fill(0, 0, i, 0, h, i, block);
      this.fill(SIZE - 1, 0, i, SIZE - 1, h, i, block);
    }
  }
}

// ---------------------------------------------------------------------------
// The 10 maps
// ---------------------------------------------------------------------------
export const MAPS = [
  {
    name: 'Meadow Village', desc: 'Rolling hills, cottages and oak trees.', seed: 1101,
    sky: ['#6fb7ff', '#d8f0ff'], fog: '#cfe9ff', ground: { top: B.GRASS, sub: B.DIRT }, border: B.STONEBRICK,
    build(b) {
      b.terrain({ base: 7, amp: 3, scale: 20, top: B.GRASS, sub: B.DIRT });
      // central plaza with a well
      const c = 36;
      b.flatten(c - 4, c - 4, c + 4, c + 4, b.avgSurface(c - 4, c - 4, c + 4, c + 4), B.GRAVEL);
      b.reserve(c - 4, c - 4, c + 4, c + 4);
      const wy = b.surface(c, c);
      b.fill(c - 1, wy, c - 1, c + 1, wy, c + 1, B.STONEBRICK);
      b.set(c, wy, c, B.WATER);
      b.fill(c - 1, wy + 1, c - 1, c - 1, wy + 2, c - 1, B.LOG); b.fill(c + 1, wy + 1, c + 1, c + 1, wy + 2, c + 1, B.LOG);
      b.fill(c - 1, wy + 1, c + 1, c - 1, wy + 2, c + 1, B.LOG); b.fill(c + 1, wy + 1, c - 1, c + 1, wy + 2, c - 1, B.LOG);
      b.fill(c - 1, wy + 3, c - 1, c + 1, wy + 3, c + 1, B.ROOF);
      for (let i = 0; i < 9; i++) {
        const w = b.ri(7, 10), d = b.ri(7, 10);
        const s = b.findSpot(w, d, 3);
        if (!s) continue;
        const two = b.chance(0.35);
        b.house(s.x, s.z, w, d, {
          wall: b.pick([B.PLANK, B.BRICK, B.PLASTER]), pillar: B.LOG, floor: B.PLANK,
          stories: two ? 2 : 1, roof: two ? 'flat' : 'pitched', roofBlock: two ? B.PLANK : B.ROOF,
        });
      }
      b.scatter(10, (x, z) => b.crates(x, z, b.ri(2, 5)));
      b.scatter(12, (x, z) => b.rock(x, z, b.ri(1, 2), B.STONE));
      b.scatter(55, (x, z) => b.oak(x, z));
      b.scatter(30, (x, z) => b.bush(x, z));
      b.border(B.STONEBRICK);
    },
  },
  {
    name: 'Dune Outpost', desc: 'Sandstone forts in a hot desert.', seed: 2202,
    sky: ['#ffb86b', '#ffe9c4'], fog: '#f6dcb0', ground: { top: B.SAND, sub: B.SAND }, border: B.SANDSTONE,
    build(b) {
      b.terrain({ base: 6, amp: 4, scale: 22, top: B.SAND, sub: B.SAND, deep: B.SANDSTONE });
      b.house(31, 31, 9, 9, { wall: B.SANDSTONE, floor: B.SANDSTONE, stories: 3, crenel: true, doors: ['n', 's', 'e', 'w'] });
      for (let i = 0; i < 9; i++) {
        const w = b.ri(6, 10), d = b.ri(7, 10);
        const s = b.findSpot(w, d, 3);
        if (!s) continue;
        b.house(s.x, s.z, w, d, { wall: B.SANDSTONE, floor: B.SANDSTONE, stories: b.chance(0.4) ? 2 : 1, crenel: b.chance(0.5) });
      }
      // oasis
      const o = b.findSpot(8, 8, 1);
      if (o) {
        const y = b.avgSurface(o.x, o.z, o.x + 7, o.z + 7);
        b.flatten(o.x, o.z, o.x + 7, o.z + 7, y, B.SAND);
        b.fill(o.x + 2, y - 1, o.z + 2, o.x + 5, y - 1, o.z + 5, B.WATER);
        b.palm(o.x, o.z); b.palm(o.x + 7, o.z + 7); b.palm(o.x + 7, o.z);
        b.reserve(o.x, o.z, o.x + 7, o.z + 7);
      }
      b.scatter(12, (x, z) => b.wallLine(x, z, b.ri(3, 6), b.chance(0.5), b.ri(1, 2), B.SANDSTONE));
      b.scatter(8, (x, z) => b.crates(x, z, b.ri(2, 4)));
      b.scatter(10, (x, z) => b.rock(x, z, b.ri(1, 2), B.SANDSTONE));
      b.scatter(35, (x, z) => b.cactus(x, z));
      b.border(B.SANDSTONE);
    },
  },
  {
    name: 'Frostbite', desc: 'Snowy hills, pine forest and log cabins.', seed: 3303,
    sky: ['#9fc4e8', '#eef6ff'], fog: '#e4eef8', ground: { top: B.SNOW, sub: B.DIRT }, border: B.STONE,
    build(b) {
      b.terrain({ base: 7, amp: 6, scale: 22, top: B.SNOW, sub: B.DIRT });
      // frozen ponds
      for (let z = 3; z < SIZE - 3; z++)
        for (let x = 3; x < SIZE - 3; x++)
          if (b.noise2(x, z) < 0.22) { const t = b.top(x, z); b.set(x, t, z, B.ICE); }
      for (let i = 0; i < 7; i++) {
        const w = b.ri(7, 9), d = b.ri(7, 10);
        const s = b.findSpot(w, d, 3);
        if (!s) continue;
        const two = b.chance(0.3);
        b.house(s.x, s.z, w, d, {
          wall: B.LOG, pillar: B.DARKPLANK, floor: B.PLANK, stories: two ? 2 : 1,
          roof: two ? 'flat' : 'pitched', roofBlock: two ? B.DARKPLANK : B.SNOWROOF, groundTop: B.SNOW,
        });
      }
      const t = b.findSpot(12, 6, 2);
      if (t) b.tower(t.x + 1, t.z + 1, { roof: B.SNOWROOF });
      b.scatter(15, (x, z) => b.rock(x, z, b.ri(1, 3), B.STONE, B.SNOW));
      b.scatter(70, (x, z) => b.pine(x, z, B.PINE, b.chance(0.5)));
      b.scatter(6, (x, z) => b.crates(x, z, 3));
      b.border(B.STONE);
    },
  },
  {
    name: 'Downtown', desc: 'City blocks, streets and tall buildings.', seed: 4404,
    sky: ['#7aa7d6', '#dfe9f3'], fog: '#cdd8e3', ground: { top: B.ASPHALT, sub: B.STONE }, border: B.CONCRETE,
    build(b) {
      b.terrain({ heightFn: () => 6, top: B.ASPHALT, sub: B.STONE, layerFn: (x, y, z, h) => (y === h - 1 ? B.ASPHALT : B.STONE) });
      // road markings
      for (let i = 0; i < SIZE; i++) {
        for (const r of [3, 21, 39, 57]) {
          if (i % 4 < 2) { b.set(i, 5, r, B.LINE); b.set(r, 5, i, B.LINE); }
        }
      }
      // city blocks: 12x12 between streets
      for (let bz = 0; bz < 3; bz++)
        for (let bx = 0; bx < 3; bx++) {
          const x0 = 7 + bx * 18 + (bx === 2 ? 0 : 0), z0 = 7 + bz * 18;
          const x1 = x0 + 11, z1 = z0 + 11;
          b.fill(x0, 5, z0, x1, 5, z1, B.CONCRETE); // sidewalk
          const kind = bx === 1 && bz === 1 ? 'plaza' : b.pick(['bld', 'bld', 'bld', 'park', 'lot']);
          if (kind === 'bld') {
            const w = b.ri(8, 10), d = b.ri(8, 10);
            const sx = x0 + 1 + b.ri(0, 10 - w), sz = z0 + 1 + b.ri(0, 10 - d);
            b.house(sx, sz, w, d, {
              wall: b.pick([B.CONCRETE, B.BRICK, B.PLASTER]), floor: B.CONCRETE, pillar: B.CONCRETE,
              stories: b.ri(2, 3), y: 6, groundTop: B.CONCRETE, glass: false, tallWindows: true,
            });
            b.reserve(x0, z0, x1, z1);
          } else if (kind === 'park') {
            b.fill(x0 + 1, 5, z0 + 1, x1 - 1, 5, z1 - 1, B.GRASS);
            b.oak(x0 + 3, z0 + 3); b.oak(x1 - 3, z1 - 3); b.oak(x0 + 3, z1 - 3);
            b.fill(x1 - 4, 6, z0 + 2, x1 - 2, 6, z0 + 2, B.PLANK);
            b.reserve(x0, z0, x1, z1);
          } else if (kind === 'lot') {
            for (let i = 0; i < 3; i++) {
              const cx = x0 + 2 + i * 3, cz = z0 + 2 + b.ri(0, 5);
              const col = b.pick([B.CAR_RED, B.CAR_BLUE, B.METAL]);
              b.fill(cx, 6, cz, cx + 1, 6, cz + 3, col);
              b.fill(cx, 7, cz + 1, cx + 1, 7, cz + 2, B.GLASS);
            }
            b.reserve(x0, z0, x1, z1);
          } else {
            // plaza with a fountain and cover
            b.fill(x0 + 4, 6, z0 + 4, x1 - 4, 6, z1 - 4, B.STONEBRICK);
            b.fill(x0 + 5, 6, z0 + 5, x1 - 5, 6, z1 - 5, B.WATER);
            b.fill(x0 + 5, 7, z0 + 5, x0 + 6, 9, z0 + 6, B.STONEBRICK);
            b.set(x0 + 1, 6, z0 + 1, B.CRATE); b.set(x1 - 1, 6, z1 - 1, B.CRATE);
            b.reserve(x0, z0, x1, z1);
          }
        }
      // parked cars on streets
      b.scatter(10, (x, z) => {
        if (b.top(x, z) !== 5 || b.get(x, 5, z) === B.CONCRETE) return false;
        if (!b.isFree(x - 1, z - 1, x + 2, z + 4)) return false;
        const col = b.pick([B.CAR_RED, B.CAR_BLUE, B.METAL]);
        b.fill(x, 6, z, x + 1, 6, z + 3, col);
        b.fill(x, 7, z + 1, x + 1, 7, z + 2, B.GLASS);
        b.reserve(x - 1, z - 1, x + 2, z + 4);
      });
      b.border(B.CONCRETE);
    },
  },
  {
    name: 'Timber Woods', desc: 'A dense forest with cabins and a lookout.', seed: 5505,
    sky: ['#86c5f0', '#e3f4ff'], fog: '#b9dcc4', ground: { top: B.GRASS, sub: B.DIRT }, border: B.LOG,
    build(b) {
      b.terrain({ base: 7, amp: 5, scale: 14, top: B.GRASS, sub: B.DIRT });
      for (let i = 0; i < 3; i++) {
        const s = b.findSpot(8, 8, 3);
        if (s) b.house(s.x, s.z, 8, 8, { wall: B.LOG, pillar: B.DARKPLANK, roof: 'pitched', roofBlock: B.DARKPLANK });
      }
      for (let i = 0; i < 2; i++) {
        const t = b.findSpot(12, 6, 2);
        if (t) b.tower(t.x + 1, t.z + 1);
      }
      // fallen logs
      b.scatter(12, (x, z) => {
        const alongX = b.chance(0.5), len = b.ri(4, 7);
        if (!b.isFree(x, z, alongX ? x + len : x, alongX ? z : z + len)) return false;
        for (let i = 0; i < len; i++) {
          const xx = alongX ? x + i : x, zz = alongX ? z : z + i;
          b.set(xx, b.surface(xx, zz), zz, B.LOG);
        }
      });
      b.scatter(15, (x, z) => b.rock(x, z, b.ri(1, 2), B.MOSSY));
      b.scatter(120, (x, z) => (b.chance(0.5) ? b.oak(x, z, B.LEAVES, B.LOG, b.chance(0.3)) : b.pine(x, z)));
      b.scatter(40, (x, z) => b.bush(x, z));
      b.border(B.LOG);
    },
  },
  {
    name: 'Red Canyon', desc: 'Layered red rock mesas and dusty valleys.', seed: 6606,
    sky: ['#f7a072', '#fde2c8'], fog: '#efc6a2', ground: { top: B.CLAY, sub: B.CLAY }, border: B.SANDSTONE,
    build(b) {
      b.terrain({
        scale: 20,
        heightFn: (x, z, n1, n2) => {
          const v = n1(x, z) * 0.8 + n2(x, z) * 0.2;
          let h = 5;
          if (v > 0.5) h += Math.floor((v - 0.5) * 30);
          return Math.min(h, 14);
        },
        layerFn: (x, y, z, h) => (y === h - 1 ? B.CLAY : y % 3 === 0 ? B.SANDSTONE : y % 3 === 1 ? B.CLAY : B.SAND),
      });
      for (let i = 0; i < 6; i++) {
        const w = b.ri(6, 8), d = b.ri(7, 9);
        const s = b.findSpot(w, d, 3);
        if (s) b.house(s.x, s.z, w, d, { wall: B.SANDSTONE, floor: B.PLANK, stories: b.chance(0.3) ? 2 : 1, groundTop: B.CLAY });
      }
      const t = b.findSpot(12, 6, 2);
      if (t) b.tower(t.x + 1, t.z + 1, { post: B.LOG });
      b.scatter(14, (x, z) => b.rock(x, z, b.ri(1, 3), B.CLAY));
      b.scatter(20, (x, z) => b.cactus(x, z));
      b.scatter(12, (x, z) => b.deadTree(x, z));
      b.scatter(8, (x, z) => b.crates(x, z, 3));
      b.border(B.SANDSTONE);
    },
  },
  {
    name: 'Lost Temple', desc: 'Jungle ruins around a stepped pyramid.', seed: 7707,
    sky: ['#79c9a8', '#e6fbef'], fog: '#bfe3c9', ground: { top: B.GRASS, sub: B.DIRT }, border: B.MOSSY,
    build(b) {
      b.terrain({ base: 7, amp: 2, scale: 18, top: B.GRASS, sub: B.DIRT });
      const c = 36;
      const by = b.avgSurface(c - 10, c - 10, c + 10, c + 10);
      b.flatten(c - 12, c - 12, c + 12, c + 12, by);
      b.reserve(c - 12, c - 12, c + 12, c + 12);
      for (let l = 0; l < 6; l++) {
        const r = 10 - l;
        b.fill(c - r, by + l, c - r, c + r, by + l, c + r, l % 2 ? B.STONEBRICK : B.MOSSY);
      }
      // inner chamber and tunnels
      b.fill(c - 4, by, c - 4, c + 4, by + 2, c + 4, B.AIR);
      b.fill(c - 10, by, c - 1, c + 10, by + 2, c, B.AIR);
      b.fill(c - 1, by, c - 10, c, by + 2, c + 10, B.AIR);
      b.set(c - 3, by, c - 3, B.CRATE); b.set(c + 3, by, c + 3, B.CRATE);
      // shrine on top
      const ty = by + 6;
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.fill(c + dx, ty, c + dz, c + dx, ty + 2, c + dz, B.STONEBRICK);
      b.fill(c - 3, ty + 3, c - 3, c + 3, ty + 3, c + 3, B.MOSSY);
      // ruins
      b.scatter(16, (x, z) => b.wallLine(x, z, b.ri(3, 7), b.chance(0.5), b.ri(1, 3), b.chance(0.5) ? B.MOSSY : B.STONEBRICK));
      b.scatter(18, (x, z) => {
        if (!b.isFree(x - 1, z - 1, x + 1, z + 1)) return false;
        const y = b.surface(x, z);
        b.fill(x, y, z, x, y + b.ri(2, 5), z, B.STONEBRICK);
      });
      for (let i = 0; i < 3; i++) {
        const s = b.findSpot(8, 8, 3);
        if (s) b.house(s.x, s.z, 8, 8, { wall: B.MOSSY, pillar: B.STONEBRICK, floor: B.STONEBRICK, crenel: true });
      }
      b.scatter(45, (x, z) => b.oak(x, z, B.LEAVES, B.LOG, true));
      b.scatter(45, (x, z) => b.bush(x, z));
      b.border(B.MOSSY);
    },
  },
  {
    name: 'Harbor', desc: 'Docks, shipping containers and warehouses.', seed: 8808,
    sky: ['#5fa8e0', '#d6ecff'], fog: '#c4dcef', ground: { top: B.CONCRETE, sub: B.STONE }, border: B.METAL,
    build(b) {
      b.terrain({
        heightFn: (x, z) => (z > 54 ? 4 : 6),
        layerFn: (x, y, z, h) => (y === h - 1 ? (z > 54 ? B.WATER : B.CONCRETE) : B.STONE),
      });
      // piers
      for (const px of [10, 30, 50]) b.fill(px, 5, 55, px + 3, 5, 68, B.DARKPLANK);
      b.reserve(0, 54, SIZE - 1, SIZE - 1);
      // boats
      for (const bx of [18, 40]) {
        b.fill(bx, 4, 58, bx + 5, 4, 67, B.PLANK);
        b.fill(bx, 5, 58, bx + 5, 5, 67, B.DARKPLANK);
        b.fill(bx + 1, 5, 59, bx + 4, 5, 66, B.AIR);
        b.fill(bx + 1, 5, 62, bx + 4, 7, 64, B.PLASTER);
        b.fill(bx + 2, 5, 62, bx + 3, 6, 64, B.AIR);
      }
      // warehouses
      b.house(6, 6, 16, 11, { wall: B.METAL, floor: B.CONCRETE, stories: 2, doorW: 4, doorH: 4, doors: ['s', 'e', 'w'], windows: true });
      b.house(46, 8, 14, 12, { wall: B.METAL, floor: B.CONCRETE, stories: 2, doorW: 4, doorH: 4, doors: ['s', 'n', 'w'] });
      // containers
      const cols = [B.CONT_RED, B.CONT_BLUE, B.CONT_GREEN];
      for (let i = 0; i < 12; i++) {
        const along = b.chance(0.5);
        const s = b.findSpot(along ? 8 : 4, along ? 4 : 8, 2, 120, [3, 3, SIZE - 4, 52]);
        if (!s) continue;
        const topY = b.container(s.x, s.z, along, b.pick(cols));
        if (b.chance(0.35)) b.container(s.x, s.z, along, b.pick(cols), topY);
      }
      b.scatter(14, (x, z) => (z < 52 ? b.crates(x, z, b.ri(3, 6)) : false));
      b.border(B.METAL);
    },
  },
  {
    name: 'Magma Core', desc: 'Volcanic rock and rivers of lava. Don\'t stand in it!', seed: 9909,
    sky: ['#3a1f2b', '#a3482e'], fog: '#5a2a24', ground: { top: B.BASALT, sub: B.STONE }, border: B.BASALT,
    build(b) {
      b.terrain({ base: 7, amp: 5, scale: 16, top: B.BASALT, sub: B.STONE });
      const river = smoothNoise(b.r, 14);
      for (let z = 2; z < SIZE - 2; z++)
        for (let x = 2; x < SIZE - 2; x++)
          if (Math.abs(river(x, z) - 0.5) < 0.035) {
            const t = b.top(x, z);
            b.set(x, t, z, B.AIR);
            b.set(x, t - 1, z, B.LAVA);
          }
      for (let i = 0; i < 6; i++) {
        const w = b.ri(6, 9), d = b.ri(6, 9);
        const s = b.findSpot(w, d, 3);
        if (s) b.house(s.x, s.z, w, d, { wall: B.STONEBRICK, pillar: B.BASALT, floor: B.STONE, stories: b.chance(0.4) ? 2 : 1, crenel: true, groundTop: B.BASALT });
      }
      b.scatter(22, (x, z) => {
        if (!b.isFree(x - 1, z - 1, x + 1, z + 1)) return false;
        const y = b.surface(x, z), h = b.ri(3, 7);
        b.fill(x, y, z, x, y + h, z, B.BASALT);
        b.fill(x, y, z, x + 1, y + Math.floor(h / 2), z + 1, B.BASALT);
      });
      b.scatter(12, (x, z) => b.deadTree(x, z, B.BASALT));
      b.scatter(12, (x, z) => b.rock(x, z, b.ri(1, 2), B.BASALT));
      b.border(B.BASALT);
    },
  },
  {
    name: 'Army Base', desc: 'Bunkers, a hangar, sandbags and watchtowers.', seed: 1010,
    sky: ['#8db6d4', '#e8f1f6'], fog: '#d3dcd0', ground: { top: B.GRAVEL, sub: B.DIRT }, border: B.METAL,
    build(b) {
      b.terrain({
        base: 6, amp: 1, scale: 24,
        layerFn: (x, y, z, h) => (y === h - 1 ? (b.noise2 && b.noise2(x, z) > 0.6 ? B.GRASS : B.GRAVEL) : B.DIRT),
      });
      b.house(26, 26, 18, 14, { wall: B.METAL, floor: B.CONCRETE, stories: 2, doorW: 5, doorH: 4, doors: ['n', 's'], windows: true });
      for (let i = 0; i < 5; i++) {
        const s = b.findSpot(7, 7, 3);
        if (s) b.house(s.x, s.z, 7, 7, { wall: B.CONCRETE, floor: B.CONCRETE, windows: true, props: false });
      }
      for (let i = 0; i < 3; i++) {
        const t = b.findSpot(12, 6, 2);
        if (t) b.tower(t.x + 1, t.z + 1, { post: B.METAL, plat: B.DARKPLANK, rail: B.SANDBAG, roof: B.METAL });
      }
      // sandbag walls
      b.scatter(24, (x, z) => {
        const len = b.ri(3, 6);
        b.wallLine(x, z, len, true, b.ri(1, 2), B.SANDBAG);
        if (b.chance(0.5)) b.wallLine(x, z + 1, b.ri(2, 4), false, 1, B.SANDBAG);
      });
      b.scatter(16, (x, z) => b.crates(x, z, b.ri(2, 6)));
      b.scatter(10, (x, z) => b.oak(x, z));
      b.border(B.METAL);
    },
  },
];

const cache = new Map();

// Build a map (cached). Returns { world, def, spawns, pickups }.
export function generateMap(index) {
  if (cache.has(index)) return cache.get(index);
  const def = MAPS[index];
  const b = new Builder(def);
  b.noise2 = null;
  def.build(b);
  const world = b.w;

  // Spawn points: any open block surface with headroom.
  const bad = new Set([B.LEAVES, B.PINE, B.LAVA, B.CACTUS, B.ROOF, B.SNOWROOF, B.GLASS, B.CAR_RED, B.CAR_BLUE]);
  const rng = mulberry32(def.seed + 77);
  const candidates = [];
  for (let i = 0; i < 6000 && candidates.length < 400; i++) {
    const x = 2 + Math.floor(rng() * (SIZE - 4));
    const z = 2 + Math.floor(rng() * (SIZE - 4));
    // scan downward for a standable spot (may be inside a building)
    const startY = world.top(x, z);
    for (let y = startY; y >= 1; y--) {
      const blk = world.get(x, y, z);
      if (blk === 0) continue;
      if (world.get(x, y + 1, z) === 0 && world.get(x, y + 2, z) === 0 && world.get(x, y + 3, z) === 0 && !bad.has(blk) && y + 1 < HEIGHT - 3) {
        candidates.push([x + 0.5, y + 1, z + 0.5]);
      }
      if (rng() < 0.6) break;
    }
  }
  const spread = (list, n, minD) => {
    const out = [];
    for (const p of list) {
      if (out.length >= n) break;
      if (out.every((q) => (q[0] - p[0]) * (q[0] - p[0]) + (q[2] - p[2]) * (q[2] - p[2]) >= minD * minD)) out.push(p);
    }
    return out;
  };
  const spawns = spread(candidates, 40, 6);
  const shuffled = shuffle(candidates, rng);
  const pickSpots = spread(shuffled, 16, 9);
  const order = [];
  while (order.length < pickSpots.length) {
    const bag = shuffle(PICKUP_WEAPONS, rng);
    order.push(...bag);
  }
  const pickups = pickSpots.map((p, i) => ({ id: i, type: order[i], x: p[0], y: p[1], z: p[2] }));
  const result = { world, def, spawns, pickups, index };
  cache.set(index, result);
  return result;
}

// Fingerprint of a map's blocks, used to check everyone built the same world.
export function mapHash(index) {
  const data = generateMap(index).world.data;
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
  return (h >>> 0).toString(16);
}
