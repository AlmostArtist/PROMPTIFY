import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { grabActiveTabText, requestAi, type AiTask } from '@/lib/messages';
import { extractResumeText } from '@/lib/resume';
import type { BackendHealth } from '../hooks/useBackendHealth';

interface AnalyzerProps {
  health: BackendHealth;
  setPrompt: (text: string) => Promise<boolean>;
  flash: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (tool: string, original: string, enhanced: string) => void;
}

interface Action {
  task: AiTask;
  label: string;
  blurb: string;
}

const ANALYZE: Action[] = [
  { task: 'content-summarize',  label: 'Summarize',  blurb: 'Condense key points' },
  { task: 'content-key-points', label: 'Key Points', blurb: 'Extract main takeaways' },
  { task: 'content-critique',   label: 'Critique',   blurb: 'Find weaknesses & fixes' },
  { task: 'content-explain',    label: 'Explain',    blurb: 'Break it down simply' },
];

const GENERATE: Action[] = [
  { task: 'content-expand',     label: 'Expand',     blurb: 'Add depth and detail' },
  { task: 'content-simplify',   label: 'Simplify',   blurb: 'Make it clearer & shorter' },
  { task: 'content-translate',  label: 'Translate',  blurb: 'Convert language or style' },
  { task: 'content-variations', label: 'Variations', blurb: 'Create 3 alternatives' },
];

function buildContext(content: string, context: string): string {
  const c = content.trim().slice(0, 9000);
  const x = context.trim().slice(0, 4000);
  return (
    `=== MAIN CONTENT ===\n${c || '(none provided)'}\n=== END ===\n\n` +
    (x ? `=== CONTEXT / GOAL ===\n${x}\n=== END ===` : '')
  );
}

function InputStats({ text }: { text: string }) {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--p-text-3)' }}>{chars} chars</span>
      <span style={{ fontSize: 11, color: 'var(--p-text-3)' }}>{words} words</span>
    </div>
  );
}

export function Analyzer({ health, setPrompt, flash, onBusyChange, onSaved }: AnalyzerProps) {
  const [content, setContent] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy]       = useState<string | null>(null);
  const [result, setResult]   = useState<{ title: string; text: string } | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const online  = health.state === 'online';
  const working = busy !== null;

  const setBusyState = (label: string | null) => { setBusy(label); onBusyChange?.(label !== null); };

  const grabInto = async (which: 'content' | 'context') => {
    setError(null);
    setBusyState(which === 'content' ? 'grab-content' : 'grab-context');
    const text = await grabActiveTabText();
    setBusyState(null);
    if (text === null) return flash('Could not read page — reopen extension on that tab, or paste manually.');
    if (!text.trim()) return flash('No readable text found on the active tab.');
    if (which === 'content') setContent(text); else setContext(text);
    flash('Pulled text from active tab ✓');
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusyState('upload');
    try {
      const text = await extractResumeText(file);
      setContent(text);
      flash(`Loaded ${file.name} ✓`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusyState(null);
    }
  };

  const run = async (action: Action) => {
    if (!online) return flash('Add your OpenRouter API key in Settings.');
    if (!content.trim() && !context.trim()) return flash('Paste some content first.');
    setError(null);
    setResult(null);
    setBusyState(action.label);
    const combined = buildContext(content, context);
    const res = await requestAi(action.task, combined);
    setBusyState(null);
    if (!res.ok || !res.text) { setError(res.error || `${action.label} failed.`); return; }
    setResult({ title: action.label, text: res.text });
    const original = content.trim() ? content.trim().slice(0, 100) : context.trim().slice(0, 100);
    onSaved?.(action.label, original, res.text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Content input */}
      <div className="p-card" style={{ padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="p-label">Content</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="p-btn p-btn-ghost p-btn-xs"
              disabled={working} onClick={() => void grabInto('content')}>
              {busy === 'grab-content' ? <MiniSpinner /> : null}Grab
            </button>
            <button type="button" className="p-btn p-btn-ghost p-btn-xs"
              disabled={working} onClick={() => fileRef.current?.click()}>
              {busy === 'upload' ? <MiniSpinner /> : null}Upload
            </button>
            {content && (
              <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                onClick={() => setContent('')}>
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste code, articles, prompts, or any text…"
          rows={4}
          className="p-input pf-scroll"
        />
        <InputStats text={content} />
        <input ref={fileRef} type="file"
          accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onPickFile} style={{ display: 'none' }} />
      </div>

      {/* Context / goal */}
      <div className="p-card" style={{ padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="p-label">
            Context / Goal
            <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--p-text-3)', textTransform: 'none', marginLeft: 4 }}>optional</span>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="p-btn p-btn-ghost p-btn-xs"
              disabled={working} onClick={() => void grabInto('context')}>
              {busy === 'grab-context' ? <MiniSpinner /> : null}Grab
            </button>
            {context && (
              <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                onClick={() => setContext('')}>
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Describe goal, target language, audience…"
          rows={2}
          className="p-input pf-scroll"
        />
        <InputStats text={context} />
      </div>

      <ActionGrid title="Analyze"  actions={ANALYZE}  busy={busy} disabled={!online || working} onRun={run} />
      <ActionGrid title="Generate" actions={GENERATE} busy={busy} disabled={!online || working} onRun={run} />

      {!online && (
        <div style={{ padding: '12px 14px', background: 'var(--p-surface-2)', borderRadius: 14, border: '1px solid var(--p-border)' }}>
          <p style={{ fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5 }}>
            {health.info?.hint || 'Add your OpenRouter API key in Settings to enable AI tools.'}
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--p-error)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="p-card p-animate-in" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-text-1)' }}>{result.title}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="p-btn p-btn-primary p-btn-xs"
                onClick={async () => {
                  const ok = await setPrompt(result.text);
                  flash(ok ? 'Inserted ✓' : 'Focus a supported AI chat tab first');
                }}>
                Insert
              </button>
              <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                onClick={() => { void navigator.clipboard?.writeText(result.text); flash('Copied ✓'); }}>
                Copy
              </button>
              <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                onClick={() => setResult(null)} aria-label="Close">
                ✕
              </button>
            </div>
          </div>
          <div className="pf-scroll" style={{ maxHeight: 380, overflowY: 'auto' }}>
            <ResultView text={result.text} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action grid ────────────────────────────────────────────────────────────

function ActionGrid({
  title, actions, busy, disabled, onRun,
}: { title: string; actions: Action[]; busy: string | null; disabled: boolean; onRun: (a: Action) => void }) {
  return (
    <div>
      <div className="p-section-div">
        <span className="p-section-div-label">{title}</span>
        <div className="p-section-div-line" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {actions.map((a) => {
          const isBusy = busy === a.label;
          return (
            <button key={a.task} type="button"
              disabled={disabled} onClick={() => onRun(a)} title={a.blurb}
              className="p-btn p-btn-ghost"
              style={{
                height: 'auto', padding: '10px 13px', borderRadius: 14,
                flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                background: isBusy ? 'var(--p-surface-2)' : undefined,
                justifyContent: 'flex-start',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)' }}>
                {isBusy && <MiniSpinner />}
                {a.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--p-text-3)', fontWeight: 400, lineHeight: 1.3 }}>{a.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Result renderer ────────────────────────────────────────────────────────
interface RSection { heading: string; score: number | null; body: string; }

const HEAD_RE    = /^\s*(?:[-*•]|\d+[.)])?\s*\*\*\s*(.+?)\s*\*\*\s*[:\-–—]?\s*(.*)$/;
const ALT_HEAD_RE = /^\s*#{1,4}\s+(.+?)\s*$/;

function extractScore(s: string): number | null {
  const tries = [/(\d{1,3})\s*%/, /(\d{1,3})\s*\/\s*100/, /\b(\d{1,3})\s*(?:out of|of)\s*100/i, /\b(\d{1,3})\b/];
  for (const re of tries) {
    const m = s.match(re);
    if (m) { const n = parseInt(m[1], 10); if (n >= 0 && n <= 100) return n; }
  }
  return null;
}

function parseResult(text: string): RSection[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const sections: RSection[] = [];
  let cur: RSection | null = null;
  for (const line of lines) {
    let heading: string | null = null; let rest = '';
    const m = line.match(HEAD_RE);
    if (m) { heading = m[1].trim(); rest = m[2].trim(); }
    else { const m2 = line.match(ALT_HEAD_RE); if (m2) heading = m2[1].replace(/\*\*/g, '').trim(); }
    if (heading) { cur = { heading, score: null, body: rest }; sections.push(cur); }
    else { if (!cur) { cur = { heading: '', score: null, body: '' }; sections.push(cur); } cur.body += (cur.body ? '\n' : '') + line; }
  }
  for (const s of sections) { if (/score|rating/i.test(s.heading)) s.score = extractScore(`${s.heading} ${s.body}`); }
  return sections.filter((s) => s.heading || s.body.trim());
}

export function ResultView({ text }: { text: string }) {
  const sections = parseResult(text);
  if (sections.length === 0 || (sections.length === 1 && !sections[0].heading)) {
    return <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--p-text-1)' }}>{text.trim()}</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sections.map((s, i) => (
        <div key={i} style={{
          background: 'var(--p-surface-2)', borderRadius: 12, padding: '10px 12px',
          border: '1px solid var(--p-border)',
        }}>
          {s.heading && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 6 }}>
              {s.heading}
            </div>
          )}
          {s.score !== null && <ScoreBar value={s.score} />}
          <Body text={s.body} />
        </div>
      ))}
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setWidth(value), 80);
    return () => window.clearTimeout(id);
  }, [value]);
  const color = value >= 75 ? 'var(--p-success)' : value >= 50 ? 'var(--p-warning)' : 'var(--p-error)';
  const label = value >= 75 ? 'Strong' : value >= 50 ? 'Moderate' : 'Needs work';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--p-text-1)', lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
      </div>
      <div className="p-progress-track">
        <div className="p-progress-fill" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

function Body({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((l, i) => {
        const bullet = /^([-*•]|\d+[.)])\s+/.test(l);
        const clean  = l.replace(/^([-*•]|\d+[.)])\s+/, '');
        if (bullet) return (
          <div key={i} className="pk-analyzer-point">
            <span className="pk-structured-dot" aria-hidden="true" />
            <span style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--p-text-2)' }}><Inline text={clean} /></span>
          </div>
        );
        return <p key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--p-text-2)' }}><Inline text={clean} /></p>;
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ fontWeight: 600, color: 'var(--p-text-1)' }}>{p}</strong>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function MiniSpinner() {
  return (
    <svg className="p-spin" style={{ width: 11, height: 11, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
