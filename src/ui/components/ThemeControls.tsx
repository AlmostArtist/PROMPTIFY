import { useId } from 'react';
import { applyPreset, DEFAULT_THEME, THEME_PRESETS, type ThemePreferences } from '@/lib/theme';
import { useThemePreferences } from '../hooks/useThemePreferences';

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return <fieldset className="tc-choice"><legend>{label}</legend><div>{options.map(option => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div></fieldset>;
}

function Slider({ label, value, min, max, unit = '%', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  const id = useId();
  return <div className="tc-slider"><label htmlFor={id}>{label}<output htmlFor={id}>{value}{unit}</output></label><input id={id} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /></div>;
}

/** Compact appearance choices. Advanced custom colour/import controls were
 * intentionally removed so Settings stays focused on useful daily controls. */
export function ThemeControls() {
  const { preferences: p, update, ready, status } = useThemePreferences();
  const range = (key: keyof ThemePreferences, label: string, min: number, max: number, unit?: string) => (
    <Slider label={label} value={p[key] as number} min={min} max={max} unit={unit} onChange={value => update({ [key]: value })} />
  );

  return (
    <section className="tc-section" aria-labelledby="theme-heading">
      <header className="tc-heading"><div><span className="tc-eyebrow">Workspace</span><h2 id="theme-heading">Theme Controls</h2></div></header>
      <fieldset className="tc-controls" disabled={!ready}>
        <legend className="tc-sr-only">Appearance preferences</legend>

        <fieldset className="tc-group"><legend>01 / Design preset</legend><div className="tc-presets">{THEME_PRESETS.map(preset => (
          <button
            type="button"
            className="tc-preset"
            key={preset.id}
            data-preset={preset.id}
            style={{ '--preset-accent': preset.values.accent } as React.CSSProperties}
            aria-pressed={p.preset === preset.id}
            onClick={() => update(applyPreset(p, preset.id))}
          >
            <span className="tc-preset-art" aria-hidden="true"><i /><i /><i /></span>
            <strong>{preset.name}<span aria-hidden="true">{p.preset === preset.id ? '✓' : '↗'}</span></strong>
            <small>{preset.description}</small>
          </button>
        ))}</div></fieldset>

        <fieldset className="tc-group"><legend>02 / Appearance</legend>
          <Choices label="Mode" value={p.appearance} options={['light', 'dark', 'system']} onChange={appearance => update({ appearance })} />
        </fieldset>

        <fieldset className="tc-group"><legend>03 / Layout &amp; type</legend>
          <Choices label="Density" value={p.density} options={['compact', 'comfortable', 'spacious']} onChange={density => update({ density })} />
          <Choices label="Navigation" value={p.layout} options={['sidebar', 'tabs', 'cards']} onChange={layout => update({ layout })} />
          <label className="tc-select">Typography<select className="p-input" value={p.typography} onChange={event => update({ typography: event.target.value as ThemePreferences['typography'] })}><option value="system">System sans</option><option value="humanist">Humanist sans</option><option value="mono">Monospace</option></select></label>
          <div className="tc-grid">{range('fontSize', 'Font size', 12, 16, 'px')}{range('radius', 'Corners', 0, 24, 'px')}</div>
        </fieldset>

        <fieldset className="tc-group"><legend>04 / Motion</legend>
          <label className="tc-toggle"><span>Reduced motion<small>System preference is always respected</small></span><input type="checkbox" checked={p.reducedMotion} onChange={event => update({ reducedMotion: event.target.checked })} /></label>
        </fieldset>

        <footer className="tc-actions">
          <button type="button" className="tc-text-button" title="Reset appearance only; prompts and accounts are preserved" onClick={() => update(DEFAULT_THEME)}>Restore defaults</button>
        </footer>
      </fieldset>
      <div className="tc-save-status" role="status">{status}</div>
    </section>
  );
}

