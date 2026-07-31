export type ThemeId = 'graphite' | 'blue' | 'forest';

const THEME_KEY = 'storeflow_theme';
const ALL_THEME_CLASSES = ['theme-graphite', 'theme-blue', 'theme-forest'];

export const THEMES: { id: ThemeId; label: string; emoji: string; desc: string; swatch: string; quote: string }[] = [
  { id: 'graphite', label: 'Graphite', emoji: '⚫', desc: 'Sleek, premium gold — quiet luxury', swatch: '#F2C94C', quote: 'This is my style 😉' },
  { id: 'blue',     label: 'Blue Sky', emoji: '🌤️', desc: 'Clean, fresh, Apple-like blue',     swatch: '#3BA4F7', quote: 'Blue this is pure 😌' },
  { id: 'forest',   label: 'Green Forest', emoji: '🌲', desc: 'Premium, money-focused green',   swatch: '#2C7A52', quote: 'White & Green fits me best 🌲' },
];

export function getTheme(): ThemeId {
  return (localStorage.getItem(THEME_KEY) as ThemeId) || 'graphite';
}

// Sets the ACCENT only (which of the 3 palettes). Light vs dark is handled
// separately below by applyResolvedPolarity/setThemeMode — the two are
// independent, so every accent theme works in both light and dark.
export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove(...ALL_THEME_CLASSES);
  root.classList.add(`theme-${theme}`);
  localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
  applyTheme(getTheme());
  initThemeMode();
}

// ─── Display Mode (Dark / Light / System) ──────────────────────────────────
// Independent of the accent theme above. Toggles the `.dark` / `.light`
// class on <html>; combined with whichever `.theme-*` class is active, CSS
// picks the matching variant (e.g. `.theme-blue.light`). System follows the
// OS preference and stays in sync live if it changes while the app is open.
export type ThemeMode = 'light' | 'dark' | 'system';
const MODE_KEY = 'storeflow_theme_mode';
let systemListenerAttached = false;

export function getThemeMode(): ThemeMode {
  return (localStorage.getItem(MODE_KEY) as ThemeMode) || 'system';
}

function applyResolvedPolarity(mode: ThemeMode) {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' ? true : mode === 'light' ? false : prefersDark;
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(MODE_KEY, mode);
  applyResolvedPolarity(mode);
}

export function initThemeMode() {
  applyResolvedPolarity(getThemeMode());
  if (!systemListenerAttached && window.matchMedia) {
    systemListenerAttached = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemeMode() === 'system') applyResolvedPolarity('system');
    });
  }
}
