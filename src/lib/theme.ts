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
}
