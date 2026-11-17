// Walkable-spot graph of a map, used by bots to find their way around
// (through doors, up stairs, around lava).
import { B } from './maps.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_DROP = 12; // there is no fall damage, so bots happily jump off roofs

export class Nav {
  constructor(world) {
    this.world = world;
    const { sx, sy, sz } = world;
    this.idAt = new Int32Array(sx * sy * sz).fill(-1);
    const xs = [], ys = [], zs = [];
    // a spot is walkable when there is a floor under it and room for a player above it
    for (let y = 1; y < sy - 2; y++)
      for (let z = 1; z < sz - 1; z++)
        for (let x = 1; x < sx - 1; x++) {
          const floor = world.get(x, y - 1, z);
          if (floor === 0 || floor === B.LAVA || floor === B.CACTUS) continue;
          if (world.get(x, y, z) !== 0 || world.get(x, y + 1, z) !== 0) continue;
          this.idAt[this.key(x, y, z)] = xs.length;
          xs.push(x); ys.push(y); zs.push(z);
        }
    this.count = xs.length;
    this.x = Int16Array.from(xs);
    this.y = Int16Array.from(ys);
    this.z = Int16Array.from(zs);
    // up to 4 neighbours per spot: walk level, hop up one block, or drop down
    this.adj = new Int32Array(this.count * 4).fill(-1);
    for (let i = 0; i < this.count; i++) {
      const x = xs[i], y = ys[i], z = zs[i];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        let n = this.node(nx, y, nz);
        if (n < 0 && world.get(x, y + 2, z) === 0) n = this.node(nx, y + 1, nz);
        if (n < 0 && world.get(nx, y, nz) === 0 && world.get(nx, y + 1, nz) === 0) {
          for (let drop = 1; drop <= MAX_DROP && n < 0; drop++) {
            if (world.get(nx, y - drop, nz) !== 0) break;
            n = this.node(nx, y - drop, nz);
          }
        }
        this.adj[i * 4 + d] = n;
      }
    }
    this.prev = new Int32Array(this.count);
    this.queue = new Int32Array(this.count);
  }

  key(x, y, z) { return (y * this.world.sz + z) * this.world.sx + x; }

  node(x, y, z) {
    return this.world.inBounds(x, y, z) ? this.idAt[this.key(x, y, z)] : -1;
  }

  // The walkable spot at or just below a position (-1 if none).
  nodeNear(px, py, pz) {
    const x = Math.floor(px), z = Math.floor(pz);
    for (let y = Math.floor(py + 0.3); y >= Math.floor(py) - 6; y--) {
      const n = this.node(x, y, z);
      if (n >= 0) return n;
    }
    // standing half over an edge: try the cells around
    for (const [dx, dz] of DIRS) {
      for (let y = Math.floor(py + 0.3); y >= Math.floor(py) - 2; y--) {
        const n = this.node(x + dx, y, z + dz);
        if (n >= 0) return n;
      }
    }
    return -1;
  }

  // Shortest route between two spots as a list of spot ids (empty if unreachable).
  path(from, to) {
    if (from < 0 || to < 0) return [];
    if (from === to) return [to];
    const { prev, queue, adj } = this;
    prev.fill(-2);
    let head = 0, tail = 0;
    queue[tail++] = from;
    prev[from] = -1;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === to) break;
      for (let d = 0; d < 4; d++) {
        const n = adj[cur * 4 + d];
        if (n >= 0 && prev[n] === -2) { prev[n] = cur; queue[tail++] = n; }
      }
    }
    if (prev[to] === -2) return [];
    const out = [];
    for (let n = to; n !== -1; n = prev[n]) out.push(n);
    return out.reverse();
  }

  // Which spots can be reached FROM a spot (reverse = false), or can REACH it (reverse = true).
  reach(start, reverse = false) {
    const mask = new Uint8Array(this.count);
    if (start < 0) return mask;
    let radj = null, rstart = null;
    if (reverse) {
      // incoming edges, grouped per spot
      rstart = new Int32Array(this.count + 1);
      for (let i = 0; i < this.adj.length; i++) if (this.adj[i] >= 0) rstart[this.adj[i] + 1]++;
      for (let i = 0; i < this.count; i++) rstart[i + 1] += rstart[i];
      radj = new Int32Array(rstart[this.count]);
      const fill = rstart.slice(0, this.count);
      for (let i = 0; i < this.adj.length; i++) if (this.adj[i] >= 0) radj[fill[this.adj[i]]++] = i >> 2;
    }
    const queue = this.queue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    mask[start] = 1;
    while (head < tail) {
      const cur = queue[head++];
      if (reverse) {
        for (let k = rstart[cur]; k < rstart[cur + 1]; k++) {
          const n = radj[k];
          if (!mask[n]) { mask[n] = 1; queue[tail++] = n; }
        }
      } else {
        for (let d = 0; d < 4; d++) {
          const n = this.adj[cur * 4 + d];
          if (n >= 0 && !mask[n]) { mask[n] = 1; queue[tail++] = n; }
        }
      }
    }
    return mask;
  }
}

const cache = new WeakMap();
export function navFor(map) {
  if (!cache.has(map)) cache.set(map, map.nav || new Nav(map.world));
  return cache.get(map);
}
