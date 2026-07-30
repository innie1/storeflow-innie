export type ThemeId = 'graphite' | 'blue' | 'forest';

const THEME_KEY = 'storeflow_theme';

export const THEMES: { id: ThemeId; label: string; emoji: string; desc: string; swatch: string; quote: string }[] = [
  { id: 'graphite', label: 'Graphite', emoji: '⚫', desc: 'Sleek, premium dark — quiet luxury', swatch: '#F2C94C', quote: 'This is my style 😉' },
  { id: 'blue',     label: 'Blue Sky', emoji: '🌤️', desc: 'Clean, fresh, Apple-like light',     swatch: '#3BA4F7', quote: 'Blue this is pure 😌' },
  { id: 'forest',   label: 'Green Forest', emoji: '🌲', desc: 'Premium, money-focused dark',     swatch: '#FFFFFF', quote: 'White & Green fits me best 🌲' },
];

export function getTheme(): ThemeId {
  return (localStorage.getItem(THEME_KEY) as ThemeId) || 'graphite';
}

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove('theme-blue', 'theme-forest');
  if (theme === 'blue') root.classList.add('theme-blue');
  if (theme === 'forest') root.classList.add('theme-forest');
  localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
  applyTheme(getTheme());
  initThemeMode();
}

// ─── Display Mode (Dark / Light / System) ──────────────────────────────────
// Sits on top of the accent theme above. Dark maps to 'graphite' (the app's
// dark theme), Light maps to 'blue' (the app's light theme), and System
// follows the OS preference and stays in sync if the OS setting changes
// while the app is open. Picking Dark or Light here also updates the accent
// theme selection, so the two pickers in Settings never disagree.
export type ThemeMode = 'light' | 'dark' | 'system';
const MODE_KEY = 'storeflow_theme_mode';
let systemListenerAttached = false;

export function getThemeMode(): ThemeMode {
  return (localStorage.getItem(MODE_KEY) as ThemeMode) || 'system';
}

function applyResolvedMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved: ThemeId = mode === 'dark' ? 'graphite' : mode === 'light' ? 'blue' : (prefersDark ? 'graphite' : 'blue');
  applyTheme(resolved);
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(MODE_KEY, mode);
  applyResolvedMode(mode);
}

export function initThemeMode() {
  applyResolvedMode(getThemeMode());
  if (!systemListenerAttached && window.matchMedia) {
    systemListenerAttached = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemeMode() === 'system') applyResolvedMode('system');
    });
  }
}
