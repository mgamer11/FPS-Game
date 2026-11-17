// Your level and lifetime stats, saved in this browser.
const KEY = 'blockblitz.progress';

export const XP = { kill: 100, botKill: 50, headshot: 25, win: 300, match: 50 };

export const progress = { xp: 0, kills: 0, deaths: 0, headshots: 0, matches: 0, wins: 0, bestStreak: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(progress)) if (Number.isFinite(saved[k]) && saved[k] >= 0) progress[k] = saved[k];
} catch { /* ignore broken storage */ }

export function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* ignore */ }
}

// Total XP needed to reach a level: 0, 500, 1500, 3000, 5000 ... (each level needs 500 more than the last)
const xpAt = (level) => 250 * level * (level - 1);

export function levelInfo(xp = progress.xp) {
  let level = Math.floor((1 + Math.sqrt(1 + xp / 62.5)) / 2);
  while (xpAt(level + 1) <= xp) level++;
  while (xpAt(level) > xp) level--;
  return { level, into: xp - xpAt(level), need: xpAt(level + 1) - xpAt(level) };
}

// Returns the new level if this pushed you over a level boundary, otherwise 0.
export function addXp(amount) {
  const before = levelInfo().level;
  progress.xp += amount;
  saveProgress();
  const after = levelInfo().level;
  return after > before ? after : 0;
}
