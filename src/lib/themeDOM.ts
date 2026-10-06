import { DEFAULT_THEME, normalizeTheme, themeTokens } from './theme';

/** Inline token bridge for CSP-sensitive, non-React content-script surfaces. */
let preferences = DEFAULT_THEME;
let started = false;
const roots = new Set<HTMLElement>();
export function reducedThemeMotion() { return preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; }
function apply(root: HTMLElement) {
  const dark = preferences.appearance === 'dark' || (preferences.appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const [key, value] of Object.entries(themeTokens(preferences, dark))) root.style.setProperty(key, value);
  root.style.fontFamily = 'var(--theme-font)';
  root.style.fontSize = 'var(--theme-size)';
  root.style.borderRadius = 'var(--theme-radius)';
  if (reducedThemeMotion()) { root.style.animation = 'none'; root.getAnimations({ subtree: true }).forEach(animation => animation.cancel()); }
}
function refresh() { for (const root of roots) { if (!root.isConnected) roots.delete(root); else apply(root); } }
export function bindDOMTheme(root: HTMLElement) {
  roots.add(root); apply(root);
  initializeDOMTheme();
}
export function initializeDOMTheme() {
  if (started) return;
  started = true;
  let changed = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pf_appearance_v1) { changed = true; preferences = normalizeTheme(changes.pf_appearance_v1.newValue); refresh(); }
  });
  void chrome.storage.local.get(['pf_appearance_v1', 'pf_theme']).then(data => {
    if (!changed) preferences = normalizeTheme(data.pf_appearance_v1 ?? { appearance: data.pf_theme ?? 'system' });
    refresh();
  }).catch(() => undefined);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refresh);
}
