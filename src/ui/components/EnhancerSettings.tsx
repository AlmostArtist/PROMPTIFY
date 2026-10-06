import { useEffect, useState } from 'react';
import { ENHANCER_STRENGTHS, type EnhanceSubMode, type EnhancerStrength } from '@/lib/messages';
import {
  DEFAULT_ENHANCER,
  loadCoach, saveCoach,
  loadEnhancer, saveEnhancer,
  loadHumanTone, saveHumanTone,
  loadSelectionRail, saveSelectionRail,
  type EnhancerPrefs,
} from '@/lib/storage';
import { Toggle } from './primitives';

type Flash = (msg: string, ok?: boolean) => void;

const ADDONS: { id: EnhanceSubMode; label: string; blurb: string }[] = [
  { id: 'power',        label: 'Chain-of-thought', blurb: 'Tell the AI to reason step by step first.' },
  { id: 'formal',       label: 'Formal tone',      blurb: 'Precise, professional wording.' },
  { id: 'eli5',         label: 'Explain simply',   blurb: 'Answer in plain, beginner-friendly terms.' },
  { id: 'translate-en', label: 'Force English',    blurb: 'Always output the prompt in English.' },
];

/**
 * Enhancer settings — controls the toolbar Enhance button: how strongly it
 * rewrites a prompt, which add-ons it always layers on, plus the feature
 * toggles (human voice, Prompt Coach, selection rail).
 */
export function EnhancerSettings({ flash }: { flash: Flash }) {
  const [prefs, setPrefs] = useState<EnhancerPrefs>(DEFAULT_ENHANCER);
  const [human, setHuman] = useState(false);
  const [coach, setCoach] = useState(true);
  const [rail, setRail] = useState(true);

  useEffect(() => {
    void loadEnhancer().then(setPrefs);
    void loadHumanTone().then(setHuman);
    void loadCoach().then(setCoach);
    void loadSelectionRail().then(setRail);
  }, []);

  const update = (next: EnhancerPrefs) => { setPrefs(next); void saveEnhancer(next); };
  const setStrength = (strength: EnhancerStrength) => { update({ ...prefs, strength }); flash('Enhancer strength saved'); };
  const toggleAddon = (id: EnhanceSubMode) => {
    const on = prefs.subModes.includes(id);
    update({ ...prefs, subModes: on ? prefs.subModes.filter((m) => m !== id) : [...prefs.subModes, id] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Strength */}
      <div>
        <div className="pk-enh-label">Enhancer strength</div>
        <p className="pk-enh-hint">How much the ⚡ Enhance button rewrites your prompt in the composer.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ENHANCER_STRENGTHS.map((s) => (
            <button key={s.id} type="button" className="pk-enh-card" data-on={prefs.strength === s.id}
              aria-pressed={prefs.strength === s.id} onClick={() => setStrength(s.id)}>
              <span className="pk-enh-radio" aria-hidden="true" />
              <span>
                <strong>{s.label}</strong>
                <small>{s.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Add-ons */}
      <div>
        <div className="pk-enh-label">Always apply</div>
        <p className="pk-enh-hint">Add-ons layered onto every enhance. Combine as many as you like.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ADDONS.map((a) => (
            <button key={a.id} type="button" className="pk-enh-addon" data-on={prefs.subModes.includes(a.id)}
              aria-pressed={prefs.subModes.includes(a.id)} onClick={() => toggleAddon(a.id)} title={a.blurb}>
              <span className="pk-enh-check" aria-hidden="true">{prefs.subModes.includes(a.id) ? '✓' : ''}</span>
              <span><strong>{a.label}</strong><small>{a.blurb}</small></span>
            </button>
          ))}
        </div>
      </div>

      {/* Feature toggles */}
      <div>
        <div className="pk-enh-label">Features</div>
        <div className="p-card" style={{ padding: 4 }}>
          <FeatureRow title="Human voice" sub="Rewrite outputs to read like a person wrote them."
            on={human} onChange={(v) => { setHuman(v); void saveHumanTone(v); flash(v ? 'Human voice on' : 'Human voice off'); }} />
          <FeatureRow title="Prompt Coach" sub="Score each enhance and show what improved (Analysis tab)."
            on={coach} onChange={(v) => { setCoach(v); void saveCoach(v); }} divided />
          <FeatureRow title="Selection rail" sub="Quick AI actions when you select text on any page."
            on={rail} onChange={(v) => { setRail(v); void saveSelectionRail(v); }} divided />
        </div>
      </div>

      <p className="pk-enh-hint" style={{ margin: 0 }}>
        Tip: in a chat composer, press <b>⌘/Ctrl + ↑</b> for the Enhancer popover and <b>⌘/Ctrl + ↓</b> for the Tone shifter.
      </p>
    </div>
  );
}

function FeatureRow({ title, sub, on, onChange, divided }: { title: string; sub: string; on: boolean; onChange: (v: boolean) => void; divided?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 12px', borderTop: divided ? '1px solid var(--p-border)' : undefined }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--p-text-3)', lineHeight: 1.5, marginTop: 2 }}>{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
