/** Versioned, allowlisted appearance preferences; no account data belongs here. */
export interface ThemePreferences {
  version: 1;
  preset: 'charcoal' | 'soft' | 'mono' | 'botanical' | 'editorial' | 'midnight';
  appearance: 'light' | 'dark' | 'system';
  accent: string;
  hue: number;
  contrast: number;
  brightness: number;
  intensity: number;
  density: 'compact' | 'comfortable' | 'spacious';
  radius: number;
  fontSize: number;
  typography: 'system' | 'humanist' | 'mono';
  reducedMotion: boolean;
  shadow: number;
  border: number;
  layout: 'sidebar' | 'tabs' | 'cards';
}
export const DEFAULT_THEME: ThemePreferences = {
  version: 1, preset: 'charcoal', appearance: 'dark', accent: '#ece8e1', hue: 0,
  contrast: 106, brightness: 100, intensity: 100, density: 'comfortable', radius: 18,
  fontSize: 13, typography: 'system', reducedMotion: false, shadow: 60, border: 22, layout: 'tabs',
};
/** Data colours for usage rings — the only saturated colour in the Charcoal design. */
export const RING_COLORS = { claude: '#ff6a3d', codex: '#2bd47d', openrouter: '#f4dc4a' } as const;
export const THEME_PRESETS = [
  { id: 'charcoal', name: 'Charcoal', description: 'Minimal · premium · dark', values: { accent: '#ece8e1', radius: 18, density: 'comfortable', shadow: 60, border: 22, typography: 'system' } },
  { id: 'soft', name: 'Soft Colorful', description: 'Pastel · rounded · welcoming', values: { accent: '#8864cf', radius: 20, density: 'comfortable', shadow: 25, border: 20, typography: 'humanist' } },
  { id: 'mono', name: 'Monochrome', description: 'Neutral · quiet · focused', values: { accent: '#727272', radius: 14, density: 'compact', shadow: 5, border: 30, typography: 'system' } },
  { id: 'botanical', name: 'Botanical', description: 'Sage · organic · grounded', values: { accent: '#34765a', radius: 22, density: 'comfortable', shadow: 20, border: 15, typography: 'humanist' } },
  { id: 'editorial', name: 'Editorial', description: 'Parchment · ink · precise', values: { accent: '#a14f38', radius: 12, density: 'spacious', shadow: 0, border: 40, typography: 'mono' } },
  { id: 'midnight', name: 'Tidal', description: 'Ocean · crisp · luminous', values: { accent: '#247aa2', radius: 16, density: 'compact', shadow: 35, border: 30, typography: 'system' } },
] as const;
export function applyPreset(p: ThemePreferences, id: ThemePreferences['preset']): ThemePreferences {
  return { ...p, ...THEME_PRESETS.find(item => item.id === id)!.values, preset: id, hue: 0, contrast: 100, brightness: 100, intensity: 100 };
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function hsl(h: number, s: number, l: number): number[] {
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); });
}
const hex = (rgb: number[]) => '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
export function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(s)) return s;
  if (/^#[\da-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('');
  const rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (rgb) { const values = rgb.slice(1).map(Number); return values.every(v => v <= 255) ? hex(values) : null; }
  const match = s.match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/);
  if (match) { const [h, sat, light] = match.slice(1).map(Number); return sat <= 100 && light <= 100 ? hex(hsl(((h % 360) + 360) % 360, sat / 100, light / 100)) : null; }
  return null;
}
export function normalizeTheme(raw: unknown): ThemePreferences {
  const p = { ...DEFAULT_THEME };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  let r = raw as Record<string, unknown>;
  const legacy: Record<string, ThemePreferences['preset']> = { minimal: 'mono', retro: 'editorial', power: 'midnight' };
  if (typeof r.preset === 'string' && legacy[r.preset]) r = { ...r, preset: legacy[r.preset] };
  const enums = { preset: ['charcoal', 'soft', 'mono', 'botanical', 'editorial', 'midnight'], appearance: ['light', 'dark', 'system'], density: ['compact', 'comfortable', 'spacious'], typography: ['system', 'humanist', 'mono'], layout: ['sidebar', 'tabs', 'cards'] };
  for (const [key, options] of Object.entries(enums)) if (options.includes(r[key] as string)) Object.assign(p, { [key]: r[key] });
  const ranges = { hue: [-180, 180], contrast: [85, 120], brightness: [85, 115], intensity: [0, 150], radius: [0, 24], fontSize: [12, 16], shadow: [0, 100], border: [0, 100] };
  for (const [key, [min, max]] of Object.entries(ranges)) if (typeof r[key] === 'number' && Number.isFinite(r[key])) Object.assign(p, { [key]: clamp(r[key] as number, min, max) });
  if (typeof r.accent === 'string') p.accent = parseColor(r.accent) ?? p.accent;
  if (typeof r.reducedMotion === 'boolean') p.reducedMotion = r.reducedMotion;
  return p;
}
export function importTheme(text: string): ThemePreferences {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as ThemePreferences).version !== 1 || !('preset' in raw) || !('accent' in raw)) throw new Error('Choose a version 1 PROMPTIFY theme file.');
  return normalizeTheme(raw);
}
function rgb(color: string) { return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)); }
function luminance(color: string) { return rgb(color).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
export function contrastRatio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function themeTokens(p: ThemePreferences, dark: boolean): Record<string, string> {
  const [r, g, b] = rgb(p.accent).map(n => n / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, light = (max + min) / 2;
  let hue = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = ((hue * 60 + p.hue) % 360 + 360) % 360;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1));
  const accent = hex(hsl(hue, Math.min(1, sat * p.intensity / 100), light));
  const base = { charcoal: [30, .045], soft: [275, .15], mono: [0, 0], botanical: [140, .12], editorial: [38, .18], midnight: [210, .23] }[p.preset];
  const surface = (l: number) => hex(hsl(base[0], base[1], clamp(l + (p.brightness - 100) / 650, 0, 1)));
  const charcoal = p.preset === 'charcoal';
  const bg = charcoal && dark ? '#090a0b' : surface(dark ? .065 : .965);
  const card = charcoal && dark ? '#111316' : surface(dark ? .105 : .995);
  const raised = charcoal && dark ? '#1a1d21' : surface(dark ? .15 : .935);
  const ink = dark ? (charcoal ? '#f3f1ec' : '#f2f4f7') : '#17202b';
  const contrastAmount = (p.contrast - 85) / 35;
  const low = dark ? [157, 167, 181] : [91, 100, 112];
  const high = dark ? [203, 209, 219] : [48, 59, 73];
  const muted = hex(low.map((v, i) => Math.round(v + (high[i] - v) * contrastAmount)));
  // Accent text is independently contrast corrected; custom brand fills remain exact.
  let accentText = accent;
  for (let i = 0; i < 100 && Math.min(contrastRatio(accentText, card), contrastRatio(accentText, raised), contrastRatio(accentText, bg)) < 4.5; i++) accentText = hex(hsl(hue, Math.min(1, sat * p.intensity / 100), dark ? Math.min(.98, light + i / 100) : Math.max(.02, light - i / 100)));
  const edge = surface(dark ? .20 + p.border / 700 : .88 - p.border / 700);
  const foreground = contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#111111') ? '#ffffff' : '#111111';
  const shadow = p.preset === 'editorial' ? `3px 3px 0 rgb(0 0 0 / ${p.shadow / (dark ? 160 : 300)})`
    : charcoal ? `0 18px 40px -22px rgb(0 0 0 / ${p.shadow / (dark ? 85 : 260)}), inset 0 1px 0 rgb(255 255 255 / ${dark ? .045 : .7})`
    : `0 4px 14px rgb(0 0 0 / ${p.shadow / (dark ? 220 : 700)})`;
  const font = p.typography === 'mono' ? '"SFMono-Regular", Consolas, monospace' : p.typography === 'humanist' ? '"Avenir Next", "Trebuchet MS", sans-serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const t: Record<string, string> = {
    '--p-bg': bg, '--p-surface': card, '--p-surface-2': raised, '--p-text-1': ink, '--p-text-2': muted, '--p-text-3': muted,
    '--p-success': p.preset === 'mono' ? ink : dark ? '#6fddb0' : '#166b47', '--p-warning': p.preset === 'mono' ? muted : dark ? '#e8bc68' : '#86500b', '--p-error': p.preset === 'mono' ? ink : dark ? '#ff94a5' : '#b42342',
    '--p-border': edge, '--p-border-2': edge, '--p-primary': accent, '--p-primary-fg': foreground, '--theme-accent-text': accentText,
    '--p-shadow-sm': shadow, '--p-shadow-md': shadow, '--p-shadow-lg': shadow, '--card-bg': card, '--glass': raised,
    '--theme-radius': `${p.radius}px`, '--theme-font': font, '--theme-size': `${p.fontSize}px`, '--theme-space': `${p.density === 'compact' ? 10 : p.density === 'comfortable' ? 14 : 19}px`,
    '--pf-bg': bg, '--pf-surface': card, '--pf-elev': raised, '--pf-fg': ink, '--pf-muted': muted, '--pf-faint': muted, '--pf-border': edge, '--pf-accent': accent, '--pf-accent-fg': foreground, '--pf-accent-hi': accentText,
  };
  const accents: Record<string, number> = { mint: 155, sky: 205, lavender: 270, yellow: 40, green: 135, pink: 335 };
  for (const [name, h] of Object.entries(accents)) {
    const colorful = p.preset === 'soft';
    t[`--p-${name}`] = colorful ? hex(hsl(h, dark ? .23 : .48, dark ? .16 : .93)) : raised;
    t[`--p-${name}-c`] = colorful ? hex(hsl(h, .45, dark ? .76 : .30)) : accentText;
  }
  t['--ring-claude'] = RING_COLORS.claude; t['--ring-codex'] = RING_COLORS.codex; t['--ring-openrouter'] = RING_COLORS.openrouter;
  t['--ring-track'] = dark ? 'rgb(255 255 255 / .12)' : 'rgb(0 0 0 / .1)';
  t['--theme-motion'] = p.reducedMotion ? '0ms' : '180ms';
  t['--theme-radius-inner'] = `${Math.max(6, p.radius - 6)}px`;
  t['--theme-heading-font'] = p.preset === 'editorial' ? 'Georgia, serif' : font;

  for (const name of ['primary', 'warm', 'cool', 'fresh', 'sun', 'berry']) t[`--grad-${name}`] = accent;
  return t;
}
