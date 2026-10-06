import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { DEFAULT_THEME, normalizeTheme, themeTokens, type ThemePreferences } from '@/lib/theme';
export const THEME_KEY = 'pf_appearance_v1';
let preferences = DEFAULT_THEME;
let state = { preferences, ready: false, status: 'Loading preferences…' };
let started = false;
let revision = 0;
let pending = 0;
let queue = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => { state = { ...state, preferences }; listeners.forEach(fn => fn()); };
const extensionStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;
async function start() {
  if (started) return;
  started = true;
  const initialRevision = revision;
  if (extensionStorage()) chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY] && !pending) { preferences = normalizeTheme(changes[THEME_KEY].newValue); emit(); }
  });
  else window.addEventListener('storage', event => { if (event.key === THEME_KEY && !pending) { try { preferences = normalizeTheme(JSON.parse(event.newValue || '{}')); emit(); } catch { /* Ignore malformed external storage. */ } } });
  try {
    const data = extensionStorage() ? await chrome.storage.local.get([THEME_KEY, 'pf_theme']) : { [THEME_KEY]: JSON.parse(localStorage.getItem(THEME_KEY) || 'null') };
    if (revision === initialRevision) preferences = normalizeTheme(data[THEME_KEY] ?? { appearance: data.pf_theme ?? 'system' });
    state.status = 'Saved on this device';
  } catch { state.status = 'Could not load preferences'; }
  state.ready = true; emit();
}
export function updateTheme(patch: Partial<ThemePreferences>) {
  preferences = normalizeTheme({ ...preferences, ...patch });
  const next = preferences, id = ++revision;
  pending++;
  state.status = 'Saving…'; emit();
  queue = queue.then(async () => {
    try {
      if (extensionStorage()) await chrome.storage.local.set({ [THEME_KEY]: next });
      else localStorage.setItem(THEME_KEY, JSON.stringify(next));
      if (id === revision) state.status = 'Saved on this device';
    } catch { if (id === revision) state.status = 'Save failed · change a control to retry'; }
    finally { pending--; emit(); }
  });
}
function subscribe(fn: () => void) { listeners.add(fn); void start(); return () => { listeners.delete(fn); }; }
export function useThemePreferences() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [systemMotion, setSystemMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const color = matchMedia('(prefers-color-scheme: dark)'), motion = matchMedia('(prefers-reduced-motion: reduce)');
    const onColor = () => setSystemDark(color.matches), onMotion = () => setSystemMotion(motion.matches);
    color.addEventListener('change', onColor); motion.addEventListener('change', onMotion);
    return () => { color.removeEventListener('change', onColor); motion.removeEventListener('change', onMotion); };
  }, []);
  const p = snapshot.preferences;
  const dark = p.appearance === 'system' ? systemDark : p.appearance === 'dark';
  return { ...snapshot, dark, reducedMotion: p.reducedMotion || systemMotion, tokens: themeTokens(p, dark) as CSSProperties & Record<string, string>, update: updateTheme };
}
