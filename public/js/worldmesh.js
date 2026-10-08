// Turns the voxel world into 3D meshes: only visible faces, with baked ambient-occlusion shading.
import * as THREE from 'three';
import { getAtlas, TILE, ATLAS_TILES, GLOW } from './textures.js';

const FACE_DEFS = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], shade: 0.8, kind: 1 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.8, kind: 1 },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], shade: 1.0, kind: 0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.5, kind: 2 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.68, kind: 1 },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], shade: 0.68, kind: 1 },
];
const AO_LEVELS = [0.45, 0.65, 0.82, 1.0];
const CHUNK = 24;

export function buildWorldMeshes(world) {
  const { texture, faceTiles } = getAtlas();
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });
  const group = new THREE.Group();
  const opaque = (x, y, z) => {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= world.sx || z >= world.sz || y >= world.sy) return false;
    return world.get(x, y, z) !== 0;
  };
  const S = TILE * ATLAS_TILES;

  for (let cz = 0; cz < world.sz; cz += CHUNK) {
    for (let cx = 0; cx < world.sx; cx += CHUNK) {
      const pos = [], uv = [], col = [], idx = [];
      let vcount = 0;
      for (let y = 0; y < world.sy; y++) {
        for (let z = cz; z < Math.min(cz + CHUNK, world.sz); z++) {
          for (let x = cx; x < Math.min(cx + CHUNK, world.sx); x++) {
            const id = world.get(x, y, z);
            if (id === 0) continue;
            const tiles = faceTiles[id] || faceTiles[3];
            const glow = GLOW.has(id);
            for (const f of FACE_DEFS) {
              const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
              if (opaque(nx, ny, nz)) continue;
              const tile = f.kind === 0 ? tiles[0] : f.kind === 2 ? tiles[2] : tiles[1];
              const ao = [];
              for (let c = 0; c < 4; c++) {
                const cu = c === 1 || c === 2 ? 1 : 0;
                const cv = c >= 2 ? 1 : 0;
                const su = cu ? 1 : -1, sv = cv ? 1 : -1;
                const s1 = opaque(nx + f.u[0] * su, ny + f.u[1] * su, nz + f.u[2] * su) ? 1 : 0;
                const s2 = opaque(nx + f.v[0] * sv, ny + f.v[1] * sv, nz + f.v[2] * sv) ? 1 : 0;
                const cr = opaque(nx + f.u[0] * su + f.v[0] * sv, ny + f.u[1] * su + f.v[1] * sv, nz + f.u[2] * su + f.v[2] * sv) ? 1 : 0;
                const a = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
                ao.push(a);
                // local corner position in the block
                const lx = (f.n[0] > 0 ? 1 : 0) + f.u[0] * cu + f.v[0] * cv;
                const ly = (f.n[1] > 0 ? 1 : 0) + f.u[1] * cu + f.v[1] * cv;
                const lz = (f.n[2] > 0 ? 1 : 0) + f.u[2] * cu + f.v[2] * cv;
                pos.push(x + lx, y + ly, z + lz);
                let s, t;
                if (f.n[1] !== 0) { s = lx; t = lz; }
                else if (f.n[0] !== 0) { s = lz; t = ly; }
                else { s = lx; t = ly; }
                const pu = tile[0] * TILE + 0.02 + s * (TILE - 0.04);
                const pv = tile[1] * TILE + 0.02 + (1 - t) * (TILE - 0.04);
                uv.push(pu / S, 1 - pv / S);
                const b = glow ? 1.15 : Math.pow(f.shade * AO_LEVELS[a], 1.8);
                col.push(b, b, b);
              }
              if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
              else idx.push(vcount + 1, vcount + 2, vcount + 3, vcount + 1, vcount + 3, vcount);
              vcount += 4;
            }
          }
        }
      }
      if (vcount === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, material));
    }
  }
  return group;
}
