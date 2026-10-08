// Weapon stats. Shared so the server can sanity-check damage reports.
export const WEAPONS = {
  pistol: {
    name: 'Pistol', dmg: 22, head: 1.75, rate: 0.2, auto: false, mag: 12, reserve: Infinity,
    reload: 1.1, spread: 0.012, zoomSpread: 0.5, pellets: 1, range: 200, zoomFov: 55, recoil: 0.018,
    sound: { freq: 1400, dur: 0.14, vol: 0.45, low: 0.3 }, rarity: 0,
  },
  ar: {
    name: 'Assault Rifle', dmg: 17, head: 1.6, rate: 0.1, auto: true, mag: 30, reserve: 150,
    reload: 1.8, spread: 0.014, zoomSpread: 0.35, pellets: 1, range: 250, zoomFov: 48, recoil: 0.011,
    sound: { freq: 900, dur: 0.16, vol: 0.5, low: 0.5 }, rarity: 3,
  },
  smg: {
    name: 'SMG', dmg: 13, head: 1.5, rate: 0.065, auto: true, mag: 35, reserve: 175,
    reload: 1.5, spread: 0.022, zoomSpread: 0.55, pellets: 1, range: 160, zoomFov: 58, recoil: 0.008,
    sound: { freq: 1700, dur: 0.1, vol: 0.4, low: 0.25 }, rarity: 3,
  },
  shotgun: {
    name: 'Shotgun', dmg: 12, head: 1.3, rate: 0.85, auto: false, mag: 6, reserve: 30,
    reload: 2.2, spread: 0.075, zoomSpread: 0.8, pellets: 9, range: 60, zoomFov: 60, recoil: 0.06,
    // full damage (can one-shot) only within 3 blocks
    falloff: [3, 24], sound: { freq: 500, dur: 0.3, vol: 0.7, low: 0.9 }, rarity: 2,
  },
  sniper: {
    name: 'Sniper', dmg: 100, head: 2, rate: 1.3, auto: false, mag: 5, reserve: 25,
    reload: 2.4, spread: 0.06, zoomSpread: 0.0, pellets: 1, range: 400, zoomFov: 18, recoil: 0.07,
    scope: true, sound: { freq: 700, dur: 0.45, vol: 0.8, low: 1 }, rarity: 1,
  },
  lmg: {
    name: 'LMG', dmg: 18, head: 1.5, rate: 0.085, auto: true, mag: 80, reserve: 160,
    reload: 3.2, spread: 0.024, zoomSpread: 0.45, pellets: 1, range: 220, zoomFov: 50, recoil: 0.01,
    moveMul: 0.88, sound: { freq: 750, dur: 0.18, vol: 0.55, low: 0.6 }, rarity: 1,
  },
  revolver: {
    name: 'Revolver', dmg: 45, head: 1.8, rate: 0.5, auto: false, mag: 6, reserve: 36,
    reload: 2.0, spread: 0.006, zoomSpread: 0.4, pellets: 1, range: 220, zoomFov: 45, recoil: 0.05,
    sound: { freq: 600, dur: 0.3, vol: 0.7, low: 0.8 }, rarity: 2,
  },
  rocket: {
    name: 'Rocket Launcher', dmg: 90, rate: 1.1, auto: false, mag: 1, reserve: 6,
    reload: 1.8, spread: 0.004, zoomSpread: 1, pellets: 1, range: 300, zoomFov: 55, recoil: 0.08,
    projectile: 38, splash: 4.2, sound: { freq: 300, dur: 0.5, vol: 0.7, low: 1 }, rarity: 0.6,
  },
};

export const PICKUP_WEAPONS = ['ar', 'smg', 'shotgun', 'sniper', 'lmg', 'revolver', 'rocket'];

export const MAX_HP = 100;
export const POINT_BLANK = 3;

// Highest damage a single hit message may report (checked by the server).
// Rule: nothing kills a full-health player in one shot unless it's the sniper,
// a headshot, or a shotgun at point-blank range.
export function maxHitDamage(id, head = false, dist = 0) {
  if (id === 'lava') return 15;
  const w = WEAPONS[id];
  if (!w) return 0;
  if (w.projectile) return w.dmg + 1;
  if (head || id === 'sniper') return w.dmg * (w.head || 1) * w.pellets + 1;
  const body = w.dmg * w.pellets;
  // allow a little extra range for network lag before capping the shotgun
  if (id === 'shotgun' && dist <= POINT_BLANK + 2.5) return body + 1;
  return Math.min(body + 1, MAX_HP - 1);
}
