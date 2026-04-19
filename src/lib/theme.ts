export type ThemeId = 'graphite' | 'blue' | 'forest';

const THEME_KEY = 'storeflow_theme';

export const THEMES: { id: ThemeId; label: string; emoji: string; desc: string; swatch: string }[] = [
  { id: 'graphite', label: 'Graphite', emoji: '⚫', desc: 'Sleek, premium dark — quiet luxury', swatch: '#F2C94C' },
  { id: 'blue',     label: 'Blue Sky', emoji: '🌤️', desc: 'Clean, fresh, Apple-like light',    swatch: '#3BA4F7' },
  { id: 'forest',   label: 'Green Forest', emoji: '🌲', desc: 'Premium, money-focused dark',    swatch: '#27AE60' },
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
}
