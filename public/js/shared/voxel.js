// Voxel (block) world storage + collision/raycast helpers. Shared by the server and the browser.
export class VoxelWorld {
  constructor(sx, sy, sz) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.data[(y * this.sz + z) * this.sx + x];
  }

  set(x, y, z, b) {
    if (!this.inBounds(x, y, z)) return;
    this.data[(y * this.sz + z) * this.sx + x] = b;
  }

  // Used for player collision: the outside of the map is a solid wall, the sky is open.
  solid(x, y, z) {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return true;
    if (y >= this.sy) return false;
    return this.data[(y * this.sz + z) * this.sx + x] !== 0;
  }

  // Highest non-air block in a column (-1 if empty).
  top(x, z) {
    for (let y = this.sy - 1; y >= 0; y--) if (this.get(x, y, z) !== 0) return y;
    return -1;
  }

  // Grid traversal raycast (Amanatides & Woo). Direction must be normalised.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
    let tMaxY = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
    let tMaxZ = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 1024; i++) {
      if (y < 0) return { t, x, y, z, nx, ny, nz };
      if (this.inBounds(x, y, z) && this.get(x, y, z) !== 0) return { t, x, y, z, nx, ny, nz };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (t > maxDist) return null;
      if (x < -2 || z < -2 || x > this.sx + 1 || z > this.sz + 1 || (y >= this.sy && dy >= 0)) return null;
    }
    return null;
  }
}

// Ray vs axis-aligned box. Returns distance or -1.
export function rayBox(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return -1;
    } else {
      let t1 = (min[i] - o[i]) / d[i];
      let t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

// Player hitboxes from a feet position.
export function playerBoxes(x, y, z) {
  return {
    head: { min: [x - 0.28, y + 1.4, z - 0.28], max: [x + 0.28, y + 1.95, z + 0.28] },
    body: { min: [x - 0.36, y, z - 0.36], max: [x + 0.36, y + 1.4, z + 0.36] },
  };
}
