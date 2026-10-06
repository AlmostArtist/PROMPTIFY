import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const { DEFAULT_THEME, THEME_PRESETS, applyPreset, normalizeTheme, parseColor, importTheme, themeTokens, contrastRatio } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('colors accept documented formats and reject CSS injection, alpha, and out-of-range channels', () => {
  assert.equal(parseColor('#abc'), '#aabbcc');
  assert.equal(parseColor('rgb(86, 139, 250)'), '#568bfa');
  assert.equal(parseColor('hsl(0, 100%, 50%)'), '#ff0000');
  for (const bad of ['rgb(256,0,0)', 'hsl(0,101%,50%)', '#fff; color:red', 'red', 'rgba(0,0,0,0)']) assert.equal(parseColor(bad), null);
});
test('import round trips and isolates appearance from account and prompt data', () => {
  assert.deepEqual(importTheme(JSON.stringify(DEFAULT_THEME)), DEFAULT_THEME);
  assert.throws(() => importTheme('{"version":2}'));
  assert.throws(() => importTheme('[]'));
  const theme = normalizeTheme({ ...DEFAULT_THEME, apiKey: 'secret', radius: 10000, fontSize: -9, shadow: NaN, layout: 'invalid' });
  assert.equal(theme.radius, 24); assert.equal(theme.fontSize, 12); assert.equal(theme.shadow, DEFAULT_THEME.shadow);
  assert.equal(theme.layout, 'tabs'); assert.equal('apiKey' in theme, false);
});
test('presets preserve appearance and accessibility preferences', () => {
  for (const preset of THEME_PRESETS) {
    const p = applyPreset({ ...DEFAULT_THEME, reducedMotion: true, appearance: 'light', fontSize: 16 }, preset.id);
    assert.equal(p.preset, preset.id); assert.equal(p.appearance, 'light'); assert.equal(p.reducedMotion, true); assert.equal(p.fontSize, 16);
  }
});
test('custom accent and text retain WCAG AA contrast at setting extremes', () => {
  for (const preset of THEME_PRESETS) for (const dark of [true, false]) for (const brightness of [85, 100, 115]) for (const contrast of [85, 120]) for (const accent of ['#000000', '#ffffff', '#ffff00', '#0000ff', '#ff0000', '#568bfa']) {
    const t = themeTokens({ ...applyPreset(DEFAULT_THEME, preset.id), brightness, contrast, accent }, dark);
    assert.ok(contrastRatio(t['--p-primary'], t['--p-primary-fg']) >= 4.5, `Accent ${accent}`);
    for (const bg of ['--p-bg', '--p-surface', '--p-surface-2']) for (const fg of ['--p-text-1', '--p-text-2', '--theme-accent-text']) assert.ok(contrastRatio(t[bg], t[fg]) >= 4.5, `${preset.id} ${dark} ${brightness} ${bg} ${fg}`);
  }
});

test('six distinct presets and legacy migration preserve preferences', () => {
  assert.equal(THEME_PRESETS.length, 6);
  assert.equal(DEFAULT_THEME.preset, 'charcoal');
  assert.equal(new Set(THEME_PRESETS.map(p => p.values.accent)).size, 6);
  assert.equal(normalizeTheme({preset:'minimal',radius:18}).preset, 'mono');
  assert.equal(normalizeTheme({preset:'retro'}).preset, 'editorial');
  assert.equal(normalizeTheme({preset:'power'}).preset, 'midnight');
  assert.equal(normalizeTheme({preset:'minimal',radius:18}).radius, 18);
  for (const p of THEME_PRESETS) assert.deepEqual(importTheme(JSON.stringify(applyPreset(DEFAULT_THEME,p.id))), applyPreset(DEFAULT_THEME,p.id));
});
test('soft navigation pastel foregrounds meet AA in both modes', () => {
  for (const dark of [true,false]) {
    const t=themeTokens(DEFAULT_THEME,dark);
    for(const name of ['mint','sky','lavender','yellow','green','pink']) assert.ok(contrastRatio(t[`--p-${name}`],t[`--p-${name}-c`])>=4.5,name);
  }
});
