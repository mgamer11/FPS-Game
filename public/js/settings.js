// Player settings, saved in the browser.
const DEFAULTS = {
  sens: 1, zoomSens: 0.7, fov: 80, vol: 0.6, qual: 1,
  xhairColor: '#ffffff', invertY: false, bob: true, showFps: false,
};
const KEY = 'blockblitz.settings';

export const settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* ignore broken storage */ }

const listeners = [];
export function onSettingsChange(fn) { listeners.push(fn); }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const fn of listeners) fn(settings);
}

export function bindSettingsUI() {
  const fmt = { sens: (v) => v.toFixed(2), zoomSens: (v) => v.toFixed(2), fov: (v) => v + '°', vol: (v) => Math.round(v * 100) + '%', qual: (v) => Math.round(v * 100) + '%' };
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    const label = document.getElementById(key + 'Val');
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
    if (label) label.textContent = fmt[key](Number(settings[key]));
    el.addEventListener('input', () => {
      if (el.type === 'checkbox') settings[key] = el.checked;
      else if (el.type === 'range') settings[key] = Number(el.value);
      else settings[key] = el.value;
      if (label) label.textContent = fmt[key](Number(settings[key]));
      saveSettings();
    });
  }
}
