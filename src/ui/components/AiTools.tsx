import { useCallback, useEffect, useState } from 'react';
import { ROLES, getRole } from '@/data/roles';
import { modelLabel, requestAi, type AiTask } from '@/lib/messages';
import { addCustomTool, loadCustomTools, removeCustomTool } from '@/lib/storage';
import type { CustomTool } from '@/engine/types';
import type { BackendHealth } from '../hooks/useBackendHealth';
import { StructuredText } from './StructuredText';

type Behavior = 'replace' | 'variations' | 'show' | 'roles';

interface AiToolsProps {
  health: BackendHealth;
  isDark: boolean;
  getPrompt: () => Promise<string | null>;
  setPrompt: (text: string) => Promise<boolean>;
  applyRoles: (ids: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (tool: string, original: string, enhanced: string) => void;
}

interface ResultState { task: AiTask; text: string; variations?: string[]; }

interface Tool {
  task: AiTask; label: string; blurb: string; behavior: Behavior; mark: string;
  customId?: string; customInstruction?: string;
}

const TOOLS: Tool[] = [
  { task: 'enhance',      label: 'Enhance',      blurb: 'Turn notes into a strong prompt',   behavior: 'replace', mark: 'E' },
  { task: 'code-review',  label: 'Code Review',  blurb: 'Review code for bugs & quality',    behavior: 'show',    mark: 'C' },
  { task: 'image-prompt', label: 'Image Prompt', blurb: 'Craft a detailed image-gen prompt', behavior: 'show',    mark: 'I' },
  { task: 'debug',        label: 'Debug',        blurb: 'Find root cause & fix bugs',        behavior: 'show',    mark: 'D' },
  { task: 'seo-optimize', label: 'SEO Boost',    blurb: 'Optimize content for search',       behavior: 'show',    mark: 'S' },
  { task: 'brainstorm',   label: 'Brainstorm',   blurb: 'Generate fresh ideas',              behavior: 'show',    mark: 'B' },
  { task: 'shorten',      label: 'Shorten',      blurb: 'Make it more concise',              behavior: 'replace', mark: 'T' },
  { task: 'professional', label: 'Polish',       blurb: 'Elevate tone & clarity',            behavior: 'replace', mark: 'P' },
];

/* Light pastels / dark muted variants for tool cards */
const PASTELS = [
  { lightBg: '#DDF7DD', darkBg: 'rgba(34,197,94,0.12)',    iconLight: 'rgba(22,163,74,0.18)',    iconDark: 'rgba(74,222,128,0.2)',    colorLight: '#16A34A', colorDark: '#4ADE80' },
  { lightBg: '#DFF5FF', darkBg: 'rgba(56,189,248,0.12)',   iconLight: 'rgba(2,132,199,0.15)',    iconDark: 'rgba(56,189,248,0.2)',    colorLight: '#0284C7', colorDark: '#38BDF8' },
  { lightBg: '#F1D9FF', darkBg: 'rgba(167,139,250,0.12)',  iconLight: 'rgba(124,58,237,0.13)',   iconDark: 'rgba(167,139,250,0.2)',   colorLight: '#7C3AED', colorDark: '#A78BFA' },
  { lightBg: '#FFF3BF', darkBg: 'rgba(253,224,71,0.12)',   iconLight: 'rgba(217,119,6,0.13)',    iconDark: 'rgba(253,224,71,0.2)',    colorLight: '#D97706', colorDark: '#FDE047' },
  { lightBg: '#D8F8D8', darkBg: 'rgba(134,239,172,0.12)',  iconLight: 'rgba(21,128,61,0.13)',    iconDark: 'rgba(134,239,172,0.2)',   colorLight: '#15803D', colorDark: '#86EFAC' },
  { lightBg: '#FFDFF4', darkBg: 'rgba(244,114,182,0.12)',  iconLight: 'rgba(219,39,119,0.12)',   iconDark: 'rgba(244,114,182,0.2)',   colorLight: '#DB2777', colorDark: '#F472B6' },
] as const;

function splitVariations(text: string): string[] {
  const parts = text.split(/\n(?=\s*\d+[.)]\s)/).map((p) => p.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  return parts.length > 1 ? parts : [];
}

function matchRoles(text: string): string[] {
  const wanted = text.split(/[,\n]/).map((s) => s.replace(/^[\d.)\-\s]+/, '').trim().toLowerCase()).filter(Boolean);
  const ids: string[] = [];
  for (const w of wanted) {
    const role = ROLES.find((r) => r.label.toLowerCase() === w) || ROLES.find((r) => w.includes(r.label.toLowerCase()) || r.label.toLowerCase().includes(w));
    if (role && !ids.includes(role.id)) ids.push(role.id);
    if (ids.length >= 3) break;
  }
  return ids;
}

interface CustomToolForm { label: string; blurb: string; instruction: string; behavior: 'replace' | 'show'; mark: string; coverIndex: number; }
const emptyForm = (): CustomToolForm => ({ label: '', blurb: '', instruction: '', behavior: 'replace', mark: '', coverIndex: 0 });

export function AiTools({ health, isDark, getPrompt, setPrompt, applyRoles, onBusyChange, onSaved }: AiToolsProps) {
  const [busy, setBusy]               = useState<AiTask | null>(null);
  const [busyId, setBusyId]           = useState<string | null>(null);
  const [result, setResult]           = useState<ResultState | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [showCreator, setShowCreator] = useState(false);
  const [form, setForm]               = useState<CustomToolForm>(emptyForm);

  const online = health.state === 'online';

  useEffect(() => { void loadCustomTools().then(setCustomTools); }, []);

  const run = async (task: AiTask, behavior: Behavior, customId?: string, customInstruction?: string) => {
    const prompt = (await getPrompt())?.trim();
    if (!prompt) { setError('Type a prompt in the AI chat first (and keep that tab focused).'); return; }
    setError(null); setResult(null);
    setBusy(task); setBusyId(customId ?? null); onBusyChange?.(true);

    const payload = behavior === 'roles' ? `${prompt}\n\nAvailable role names: ${ROLES.map((r) => r.label).join(', ')}` : prompt;
    const res = await requestAi(customId ? 'custom' : task, payload, customInstruction);
    setBusy(null); setBusyId(null); onBusyChange?.(false);

    if (!res.ok || !res.text) { setError([res.error, res.hint].filter(Boolean).join('\n') || 'Request failed.'); return; }

    if (behavior === 'replace') {
      void setPrompt(res.text);
      const label = customId ? customTools.find((t) => t.id === customId)?.label ?? 'Custom' : TOOLS.find((t) => t.task === task)?.label ?? task;
      onSaved?.(label, prompt, res.text);
      setResult({ task, text: 'Prompt updated in the box ✓' });
    } else if (behavior === 'variations') {
      setResult({ task, text: res.text, variations: splitVariations(res.text) });
    } else if (behavior === 'roles') {
      const ids = matchRoles(res.text);
      if (ids.length) { applyRoles(ids); setResult({ task, text: `Applied: ${ids.map((id) => getRole(id)?.label).join(', ')} ✓` }); }
      else setResult({ task, text: res.text });
    } else {
      setResult({ task, text: res.text });
    }
  };

  const handleCreate = useCallback(async () => {
    if (!form.label.trim() || !form.instruction.trim()) return;
    const tool: CustomTool = {
      id: crypto.randomUUID?.() ?? `ct-${Date.now()}`,
      label: form.label.trim(), blurb: form.blurb.trim() || form.label.trim(),
      instruction: form.instruction.trim(), behavior: form.behavior,
      mark: (form.mark || form.label[0] || '+').toUpperCase(),
      coverIndex: form.coverIndex,
    };
    setCustomTools(await addCustomTool(tool));
    setForm(emptyForm()); setShowCreator(false);
  }, [form]);

  const handleDelete = useCallback(async (id: string) => { setCustomTools(await removeCustomTool(id)); }, []);

  const allTools: Tool[] = [
    ...TOOLS,
    ...customTools.map((ct): Tool => ({ task: 'custom', label: ct.label, blurb: ct.blurb, behavior: ct.behavior, mark: ct.mark, customId: ct.id, customInstruction: ct.instruction })),
  ];

  return (
    <div>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: 'var(--p-surface-2)', borderRadius: 14, border: '1px solid var(--p-border)' }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: health.state === 'online' ? 'var(--p-success)' : health.state === 'checking' ? 'var(--p-warning)' : 'var(--p-error)',
        }} />
        <span style={{ fontSize: 12, color: 'var(--p-text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {health.state === 'online' ? `${modelLabel(health.info?.model)} · Ready` : health.state === 'checking' ? 'Connecting…' : 'OpenRouter not connected'}
        </span>
        <button type="button" onClick={health.refresh}
          style={{ fontSize: 11, fontWeight: 500, color: 'var(--p-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          Recheck
        </button>
      </div>

      {!online && health.state === 'offline' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--p-surface-2)', borderRadius: 14, border: '1px solid var(--p-border)' }}>
          <p style={{ fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5 }}>
            {health.info?.hint || 'Add your OpenRouter API key in Settings to use AI tools.'}
          </p>
        </div>
      )}

      {/* Tool card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {allTools.map((t, idx) => {
          const isCustom = !!t.customId;
          const isBusy   = isCustom ? busyId === t.customId : busy === t.task && !busyId;
          const coverIdx = isCustom
            ? (customTools.find((ct) => ct.id === t.customId)?.coverIndex ?? 0)
            : idx;
          const p = PASTELS[coverIdx % PASTELS.length];
          const cardBg    = isDark ? 'var(--p-surface)' : p.lightBg;
          const iconBg    = isDark ? p.iconDark : p.iconLight;
          const iconColor = isDark ? p.colorDark : p.colorLight;

          return (
            <div key={t.customId ?? t.task} className="p-tool-card-shell">
              <button
                type="button"
                disabled={!online || busy !== null}
                onClick={() => run(t.task, t.behavior, t.customId, t.customInstruction)}
                title={t.blurb}
                className="p-tool-card"
                style={{ background: cardBg }}
              >
              {/* Icon badge */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: iconBg, color: iconColor,
                display: 'grid', placeItems: 'center',
                fontSize: 15, fontWeight: 700,
              }}>
                {t.mark}
              </div>

              {/* Label + blurb */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t.label}
                  {isCustom && <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--p-text-3)', background: 'rgba(0,0,0,0.08)', borderRadius: 999, padding: '1px 5px' }}>custom</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--p-text-2)', lineHeight: 1.35 }}>{t.blurb}</div>
              </div>

              {/* Busy overlay */}
              {isBusy && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 20 }}>
                  <svg className="p-spin" style={{ width: 24, height: 24 }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.35" strokeWidth="2.5" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              </button>
              {isCustom && !isBusy && (
                <button type="button" className="p-del-btn"
                  onClick={() => void handleDelete(t.customId!)}
                  aria-label={`Delete ${t.label}`} title={`Delete ${t.label}`}>×</button>
              )}
            </div>
          );
        })}

        {/* Add custom tool */}
        <button type="button" onClick={() => setShowCreator(true)}
          className="p-tool-card"
          style={{
            background: 'var(--p-surface-2)',
            border: '1.5px dashed var(--p-border-2)',
            alignItems: 'center', justifyContent: 'center',
            gap: 6,
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--p-border)', color: 'var(--p-text-3)',
            display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 300,
          }}>+</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--p-text-3)' }}>Add Tool</div>
        </button>
      </div>

      {/* Custom Tool Creator Modal */}
      {showCreator && (
        <div className="p-modal-overlay"
          style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreator(false); }}
        >
          <div className="p-card p-modal-body pf-scroll" style={{ width: 308, padding: '18px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--p-text-1)', margin: 0 }}>New Tool</h3>
              <button type="button" onClick={() => setShowCreator(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--p-text-3)', lineHeight: 1, padding: 4 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="p-label" style={{ marginBottom: 6 }}>Tool name</div>
                <input value={form.label} maxLength={30} placeholder="e.g. Storyteller"
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value, mark: e.target.value[0]?.toUpperCase() ?? '' }))}
                  className="p-input" style={{ resize: 'none', height: 38, padding: '0 13px' }} />
              </div>

              <div>
                <div className="p-label" style={{ marginBottom: 6 }}>Short description</div>
                <input value={form.blurb} maxLength={40} placeholder="e.g. Narrative style"
                  onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
                  className="p-input" style={{ resize: 'none', height: 38, padding: '0 13px' }} />
              </div>

              <div>
                <div className="p-label" style={{ marginBottom: 6 }}>
                  Instruction
                  <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--p-text-3)', textTransform: 'none' }}>— what should the AI do?</span>
                </div>
                <textarea value={form.instruction} rows={3}
                  placeholder="e.g. Rewrite the prompt below in vivid storytelling style…"
                  onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                  className="p-input pf-scroll" style={{ resize: 'none' }} />
              </div>

              <div>
                <div className="p-label" style={{ marginBottom: 8 }}>Result behavior</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <BehaviorBtn active={form.behavior === 'replace'} onClick={() => setForm((f) => ({ ...f, behavior: 'replace' }))}>
                    Replace prompt
                  </BehaviorBtn>
                  <BehaviorBtn active={form.behavior === 'show'} onClick={() => setForm((f) => ({ ...f, behavior: 'show' }))}>
                    Show result
                  </BehaviorBtn>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div>
                  <div className="p-label" style={{ marginBottom: 6 }}>Mark</div>
                  <input value={form.mark} maxLength={1}
                    onChange={(e) => setForm((f) => ({ ...f, mark: e.target.value.slice(0, 1).toUpperCase() }))}
                    className="p-input"
                    style={{ width: 42, height: 42, textAlign: 'center', fontSize: 16, fontWeight: 700, resize: 'none', padding: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="p-label" style={{ marginBottom: 6 }}>Card color</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PASTELS.map((p, ci) => (
                      <button key={ci} type="button"
                        onClick={() => setForm((f) => ({ ...f, coverIndex: ci }))}
                        style={{
                          width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: p.lightBg,
                          outline: form.coverIndex === ci ? '2.5px solid var(--p-primary)' : '2px solid transparent',
                          outlineOffset: 2, transition: 'outline 0.12s',
                        }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="p-btn p-btn-ghost" style={{ flex: 1 }}
                onClick={() => setShowCreator(false)}>Cancel</button>
              <button type="button" className="p-btn p-btn-primary" style={{ flex: 1 }}
                disabled={!form.label.trim() || !form.instruction.trim()}
                onClick={() => void handleCreate()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--p-error)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 10 }} className="p-animate-in">
          {result.variations && result.variations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.variations.map((v, i) => (
                <div key={i} className="p-card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--p-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Variation {i + 1}
                    </span>
                    <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                      onClick={() => void setPrompt(v)}>
                      Insert
                    </button>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--p-text-2)', whiteSpace: 'pre-wrap' }}>{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-card" style={{ padding: '12px 14px' }}>
              <div className="pf-scroll" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <StructuredText text={result.text} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BehaviorBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`p-btn ${active ? 'p-btn-primary' : 'p-btn-ghost'} p-btn-sm`}
      style={{ flex: 1 }}>
      {children}
    </button>
  );
}
