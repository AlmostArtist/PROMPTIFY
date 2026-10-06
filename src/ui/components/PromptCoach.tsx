import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearAnalyses,
  loadAnalyses,
  loadCoach,
  saveCoach,
  subscribeAnalyses,
} from '@/lib/storage';
import type { PromptAnalysis } from '@/lib/messages';
import { Toggle } from './primitives';

/**
 * Analysis tab — the "Prompt Coach". After each Enhance it shows how the user's
 * original prompt scored, what was weak, what the enhancement fixed and reusable
 * tips. A stats + progress dashboard tracks improvement over time; the latest
 * report is featured, with the rest in a collapsible history.
 */
export function PromptCoach({ flash }: { flash: (msg: string, ok?: boolean) => void }) {
  const [on, setOn] = useState(true);
  const [items, setItems] = useState<PromptAnalysis[]>([]);

  useEffect(() => {
    void (async () => {
      setOn(await loadCoach());
      setItems(await loadAnalyses());
    })();
    return subscribeAnalyses(setItems); // live-update on new analyses
  }, []);

  const toggle = useCallback(async (v: boolean) => {
    setOn(v);
    await saveCoach(v);
    flash(v ? 'Prompt Coach on' : 'Prompt Coach off');
  }, [flash]);

  const onClear = useCallback(async () => {
    await clearAnalyses();
    setItems([]);
    flash('Analyses cleared');
  }, [flash]);

  const [latest, ...history] = items;

  return (
    <div>
      {/* Toggle card */}
      <div className="p-card" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 2 }}>
              Prompt Coach
            </div>
            <div style={{ fontSize: 11, color: 'var(--p-text-3)', lineHeight: 1.5 }}>
              Automatic scores & recommendations
            </div>
          </div>
          <Toggle on={on} onChange={(v) => void toggle(v)} />
        </div>
      </div>

      {items.length === 0 ? (
        <section className="pk-analysis-empty">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
          <h3>{on ? 'No reviews yet' : 'Prompt Coach is paused'}</h3>
          <p>{on ? 'Enhance a prompt on an AI site to see your first score.' : 'Enable Prompt Coach above to review the prompts you enhance.'}</p>
          <dl className="pk-analysis-dimensions">
            <div><dt>Clarity</dt><dd>Specific goal</dd></div>
            <div><dt>Context</dt><dd>Relevant background</dd></div>
            <div><dt>Direction</dt><dd>Format & constraints</dd></div>
          </dl>
        </section>
      ) : (
        <>
          <StatsGrid items={items} />
          <ProgressCard items={items} />

          {/* LATEST */}
          <GroupLabel>Latest</GroupLabel>
          <AnalysisCard a={latest} featured />

          {/* HISTORY */}
          {history.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
                <GroupLabel inline>History · {history.length}</GroupLabel>
                <button type="button" className="p-btn p-btn-ghost p-btn-xs" onClick={() => void onClear()}>
                  Clear all
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((a) => <AnalysisCard key={a.id} a={a} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────

function StatsGrid({ items }: { items: PromptAnalysis[] }) {
  const stats = useMemo(() => {
    const scores = items.map((a) => a.score);
    const count = scores.length;
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / count);
    const best = Math.max(...scores);
    const latest = scores[0];
    const lessons = items.reduce((s, a) => s + a.tips.length, 0);
    const issues = items.reduce((s, a) => s + a.mistakes.length, 0);
    return { count, avg, best, latest, lessons, issues };
  }, [items]);
  const r = 42, c = 2 * Math.PI * r;
  const label = scoreColor(stats.latest).label;

  return (
    <section className="pk-an-hero" aria-label="Prompt score summary">
      <div className="pk-an-gauge">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="pk-an-gauge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff8a5c" />
              <stop offset="100%" stopColor="#e5243b" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} className="pk-an-gauge-track" />
          <circle cx="50" cy="50" r={r} className="pk-an-gauge-fill" strokeDasharray={c} strokeDashoffset={c * (1 - stats.latest / 100)} />
        </svg>
        <div className="pk-an-gauge-value"><strong>{stats.latest}</strong><span>/100</span></div>
      </div>
      <div className="pk-an-summary">
        <span className="pk-an-kicker">Latest prompt · {label}</span>
        <dl className="pk-an-kpis">
          <div><dt>Average</dt><dd>{stats.avg}</dd></div>
          <div><dt>Best</dt><dd>{stats.best}</dd></div>
          <div><dt>Analysed</dt><dd>{stats.count}</dd></div>
          <div><dt>Lessons</dt><dd>{stats.lessons}</dd></div>
          <div data-alert={stats.issues > 0}><dt>Issues</dt><dd>{stats.issues}</dd></div>
        </dl>
      </div>
    </section>
  );
}

// ── Progress (trajectory + trend) ─────────────────────────────────────────

function ProgressCard({ items }: { items: PromptAnalysis[] }) {
  const { bars, trend } = useMemo(() => {
    // newest-first → take last 12, show oldest→newest (left→right)
    const recent = items.slice(0, 12).reverse();
    const bars = recent.map((a) => ({ score: a.score, ts: a.ts, id: a.id }));

    let trend = { dir: 'steady' as 'up' | 'down' | 'steady', delta: 0 };
    if (items.length >= 2) {
      const chrono = [...items].reverse().map((a) => a.score);
      const half = Math.floor(chrono.length / 2) || 1;
      const older = chrono.slice(0, half);
      const newer = chrono.slice(-half);
      const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
      const delta = Math.round(mean(newer) - mean(older));
      trend = { dir: delta > 5 ? 'up' : delta < -5 ? 'down' : 'steady', delta };
    }
    return { bars, trend };
  }, [items]);

  const trendMeta = {
    up:     { label: 'Improving',  color: 'var(--p-success)', icon: '▲' },
    down:   { label: 'Needs work', color: 'var(--p-error)', icon: '▼' },
    steady: { label: 'Steady',     color: 'var(--theme-accent-text)', icon: '▬' },
  }[trend.dir];

  return (
    <div className="p-card pk-an-chart" style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--p-text-2)' }}>Score trajectory</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: trendMeta.color,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span>{trendMeta.icon}</span>
          {items.length < 2 ? 'First review' : trendMeta.label}
          {trend.delta !== 0 && <span style={{ opacity: 0.8 }}>({trend.delta > 0 ? '+' : ''}{trend.delta})</span>}
        </span>
      </div>

      <figure className="pk-score-chart">
        <figcaption>Prompt score · 0–100</figcaption>
        <svg viewBox="0 0 320 120" role="img" aria-label={`Last ${bars.length} prompt scores, oldest to latest: ${bars.map(b => b.score).join(', ')}`}>
          {[0, 50, 100].map(value => <g key={value}><line x1="30" x2="308" y1={100 - value * .85} y2={100 - value * .85} stroke="var(--p-border)" /><text x="23" y={104 - value * .85} textAnchor="end" fill="var(--p-text-2)" fontSize="10">{value}</text></g>)}
          <defs><linearGradient id="pk-an-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--theme-accent-text)" stopOpacity=".32" /><stop offset="100%" stopColor="var(--theme-accent-text)" stopOpacity="0" /></linearGradient></defs>
          {bars.length > 1 && <polygon fill="url(#pk-an-area)" points={`34,100 ${bars.map((b, i) => `${34 + i * 270 / (bars.length - 1)},${100 - b.score * .85}`).join(' ')} 304,100`} />}
          <polyline fill="none" stroke="var(--theme-accent-text)" strokeWidth="2.5" strokeLinejoin="round" points={bars.map((b, i) => `${bars.length === 1 ? 169 : 34 + i * 270 / (bars.length - 1)},${100 - b.score * .85}`).join(' ')} />
          {bars.map((b, i) => <circle key={b.id} cx={bars.length === 1 ? 169 : 34 + i * 270 / (bars.length - 1)} cy={100 - b.score * .85} r="3.5" fill="var(--theme-accent-text)"><title>{new Date(b.ts).toLocaleString()}: {b.score}/100</title></circle>)}
        </svg>
        <div className="pk-chart-axis"><span>Oldest</span><span>Latest · {bars.length} reviews</span></div>
        <details><summary>Score data</summary><table><thead><tr><th scope="col">Reviewed</th><th scope="col">Score / 100</th></tr></thead><tbody>{bars.map(b => <tr key={b.id}><td>{new Date(b.ts).toLocaleString()}</td><td>{b.score}</td></tr>)}</tbody></table></details>
      </figure>
    </div>
  );
}

// ── Per-analysis card ──────────────────────────────────────────────────────

function AnalysisCard({ a, featured = false }: { a: PromptAnalysis; featured?: boolean }) {
  const [open, setOpen] = useState(featured);   // history collapsed, latest open
  const [showPrompts, setShowPrompts] = useState(false);
  const sc = scoreColor(a.score);
  const when = new Date(a.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="p-card"
      style={{ padding: 16, border: featured ? `1.5px solid ${sc.c}` : undefined }}
    >
      {/* Header — click to expand/collapse */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: sc.bg, display: 'grid', placeItems: 'center',
        }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: sc.c, lineHeight: 1 }}>{a.score}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: sc.c, background: sc.bg,
              borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>{sc.label}</span>
            <span style={{ fontSize: 11, color: 'var(--p-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.site} · {when}
            </span>
          </div>
          <div style={{
            fontSize: 12.5, color: 'var(--p-text-2)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap',
          }}>
            {a.verdict || a.original}
          </div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 11, color: 'var(--p-text-3)',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Score bar */}
          <div className="p-progress-track" role="meter" aria-label="Prompt score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.score} style={{ marginBottom: 14 }}>
            <div className="p-progress-fill" style={{ width: `${a.score}%`, background: sc.c }} />
          </div>

          {a.mistakes.length > 0 && <Section title="Issues" icon="✕" color="var(--p-error)" items={a.mistakes} />}
          {a.improvements.length > 0 && <Section title="Improvements" icon="✓" color="var(--p-success)" items={a.improvements} />}
          {a.tips.length > 0 && <Section title="Lessons" icon="💡" color="var(--p-text-2)" items={a.tips} />}

          <button
            type="button"
            onClick={() => setShowPrompts((s) => !s)}
            className="p-btn p-btn-ghost p-btn-xs"
            style={{ marginTop: 2 }}
          >
            {showPrompts ? 'Hide prompts' : 'Show original vs enhanced'}
          </button>
          {showPrompts && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PromptBlock label="Original" text={a.original} />
              <PromptBlock label="Enhanced" text={a.enhanced} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────

function GroupLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--p-text-3)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      margin: inline ? 0 : '4px 0 8px',
    }}>
      {children}
    </div>
  );
}

function Section({ title, icon, color, items }: { title: string; icon: string; color: string; items: string[] }) {
  return (
    <details className="pk-coach-detail">
      <summary><span style={{ color }} aria-hidden="true">{icon}</span><strong>{title}</strong><span>{items.length}</span></summary>
      <ul>{items.map((item, i) => <li key={i}><span className="pk-coach-dot" aria-hidden="true" /><span>{item}</span></li>)}</ul>
    </details>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ background: 'var(--p-surface-2)', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--p-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>
        {text}
      </div>
    </div>
  );
}

function scoreColor(score: number): { c: string; bg: string; label: string } {
  if (score >= 80) return { c: 'var(--p-success)', bg: 'var(--p-mint)', label: 'Strong' };
  if (score >= 60) return { c: 'var(--theme-accent-text)', bg: 'var(--p-sky)', label: 'Decent' };
  if (score >= 40) return { c: 'var(--p-warning)', bg: 'var(--p-yellow)', label: 'Weak' };
  return { c: 'var(--p-error)', bg: 'var(--p-pink)', label: 'Poor' };
}
