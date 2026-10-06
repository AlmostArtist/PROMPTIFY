import { loadCliModel, loadVisionProvider, saveVisionProvider, type VisionProviderChoice } from '@/lib/connections';
import { loadOpenRouterModel } from '@/lib/storage';
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestCapture, requestVision } from '@/lib/messages';
import { parseJsonLoose } from '@/lib/json';
import { normalizeImage } from '@/lib/image';
import { compileDna, DNA_GENES, DNA_TARGETS, parseDna, type Dna, type DnaTarget } from '@/lib/dna';
import { requestBrain } from '@/lib/permissions';
import {
  clearVisionHistory,
  loadVisionHistory,
  parsePerfectPrompts,
  readVisionJob,
  subscribeVisionJob,
  VISION_MODES,
  type VisionHistoryItem,
  type VisionJob,
  type VisionMode,
} from '@/lib/vision';
import type { BackendHealth } from '../hooks/useBackendHealth';
import { MiniSpinner, ResultView } from './Analyzer';
import { PromptActions } from './SendToAi';

type Flash = (msg: string, ok?: boolean) => void;

/**
 * Vision tab — Screenshot → Perfect Prompt and Prompt DNA. Jobs can start
 * here (capture / upload / paste / drop) or from the right-click menu and the
 * Alt+Shift+S shortcut; either way the service worker mirrors the job into
 * session storage and this view renders it.
 */
export function VisionStudio({ health, flash, onConnections }: { health: BackendHealth; flash: Flash; onConnections: () => void }) {
  const [mode, setMode] = useState<VisionMode>('prompts');
  const [job, setJob] = useState<VisionJob | null>(null);
  const [recent, setRecent] = useState<VisionHistoryItem[]>([]);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [visionModel, setVisionModel] = useState('');
  const submitting = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = job?.status === 'working' || job?.status === 'picking';

  const [visionChoice, setVisionChoice] = useState<VisionProviderChoice>('');
  useEffect(() => { void loadVisionProvider().then(setVisionChoice); }, []);
  const activeProvider = health.info?.provider;
  // Vision can use its own account (picker below) or follow the main provider.
  const provider = visionChoice || activeProvider;
  const providerName = provider === 'codex' ? 'ChatGPT' : provider === 'claude' ? 'Claude' : 'OpenRouter';
  // Health only covers the main provider; a separate Vision account reports its own errors per job.
  const online = health.state === 'online' || (visionChoice !== '' && visionChoice !== activeProvider);
  const chooseVision = async (next: VisionProviderChoice) => {
    setVisionChoice(next);
    await saveVisionProvider(next);
    const name = next === 'codex' ? 'ChatGPT' : next === 'claude' ? 'Claude' : next === 'openrouter' ? 'OpenRouter' : 'your main account';
    flash(`Vision will use ${name}`);
  };
  useEffect(() => {
    let live = true;
    const refreshModel = () => {
      if (provider === 'codex' || provider === 'claude') void loadCliModel(provider, 'vision').then(value => { if (live) setVisionModel(value || 'CLI default model'); });
      else if (provider === activeProvider) setVisionModel(health.info?.model || 'Selected model');
      else void loadOpenRouterModel().then(value => { if (live) setVisionModel(value); });
    };
    refreshModel();
    chrome.storage.onChanged.addListener(refreshModel);
    return () => { live = false; chrome.storage.onChanged.removeListener(refreshModel); };
  }, [provider, activeProvider, health.info?.model]);

  const refreshRecent = useCallback(async () => setRecent(await loadVisionHistory()), []);

  useEffect(() => {
    void readVisionJob().then((j) => {
      if (j) {
        setJob(j);
        setMode(j.mode);
      }
    });
    void refreshRecent();
    return subscribeVisionJob((j) => {
      setJob(j);
      if (j) setMode(j.mode);
      if (j?.status === 'done') void refreshRecent();
    });
  }, [refreshRecent]);

  const capture = async () => {
    if (!online) return flash('Connect an AI account in Connect to use Vision.', false);
    if (busy || submitting.current) return;
    setNeedsPerm(false);
    const r = await requestCapture(mode);
    if (!r.ok) {
      if (r.needsPermission) setNeedsPerm(true);
      else if (r.error && r.error !== 'Capture cancelled.') flash(r.error, false);
    }
  };

  const runOnDataUrl = useCallback(
    async (dataUrl: string, source?: { title?: string; url?: string }) => {
      if (!online) return flash('Connect an AI account in Connect to use Vision.', false);
      if (busy || submitting.current) return;
      submitting.current = true;
      try { await requestVision(mode, dataUrl, source); } finally { submitting.current = false; }
    },
    [mode, online, flash, busy],
  );

  const runOnFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return flash('That isn’t an image file.', false);
      try {
        await runOnDataUrl(await normalizeImage(file), { title: file.name });
      } catch {
        flash('Could not read that image.', false);
      }
    },
    [runOnDataUrl, flash],
  );

  // Paste an image anywhere in the panel.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void runOnFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [runOnFile]);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void runOnFile(file);
  };

  const rerun = (m: VisionMode) => {
    if (!job?.image || busy || submitting.current) return;
    setMode(m);
    void requestVision(m, job.image, job.source);
  };

  const openRecent = (it: VisionHistoryItem) => {
    setMode(it.mode);
    setJob({ id: it.id, mode: it.mode, status: 'done', image: it.thumb, source: it.source, text: it.text, ts: it.ts });
  };

  return (
    <div className="pk-vision-studio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pk-vision-account">
        <span className="pk-vision-account-icon" aria-hidden="true"><CameraIcon /></span>
        <div><strong>Vision with {providerName}</strong><span>{visionModel || 'Choose a model in Connect'}</span></div>
        <button className="pk-text-link" onClick={onConnections}>Models ↗</button>
      </div>
      <div className="pk-segment" role="radiogroup" aria-label="Account used for Vision">
        {([['', 'Auto'], ['codex', 'ChatGPT'], ['claude', 'Claude'], ['openrouter', 'OpenRouter']] as const).map(([id, label]) => (
          <button key={label} type="button" role="radio" aria-checked={visionChoice === id} data-on={visionChoice === id}
            data-provider={id || undefined} disabled={busy} onClick={() => void chooseVision(id)}>
            {label}
          </button>
        ))}
      </div>
      {/* Mode picker */}
      <div className="pk-vision-modes" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {VISION_MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} disabled={busy} onClick={() => setMode(m.id)}
            className={`p-btn ${mode === m.id ? 'p-btn-primary' : 'p-btn-ghost'}`}
            style={{
              height: 'auto', padding: '9px 12px', borderRadius: 14, flexDirection: 'column',
              alignItems: 'flex-start', gap: 2, gridColumn: m.id === 'prompts' ? 'span 2' : undefined,
            }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</span>
            <span style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.65 }}>{m.blurb}</span>
          </button>
        ))}
      </div>

      {/* Input */}
      <div
        className="p-card pk-vision-drop"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
          if (file) void runOnFile(file);
        }}
        style={{
          padding: 14, borderStyle: dragOver ? 'dashed' : 'solid',
          borderColor: dragOver ? 'var(--p-text-2)' : undefined,
        }}>
        <div className="pk-vision-art" aria-hidden="true"><div className="pk-image-tile"><svg viewBox="0 0 80 60" fill="none"><rect x="2" y="2" width="76" height="56" rx="12" /><circle cx="56" cy="19" r="7" /><path d="m8 49 20-22 17 19 10-9 17 17" /></svg></div><span className="pk-vision-spark">✦</span></div>
        <h3>Start with something you see.</h3><p className="pk-vision-drop-caption">Turn a screenshot into your next great prompt.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="p-btn p-btn-primary" style={{ flex: 1 }}
            disabled={busy || !online} onClick={() => void capture()}>
            <CameraIcon /> Capture screen
          </button>
          <button type="button" className="p-btn p-btn-ghost" disabled={busy || !online}
            onClick={() => fileRef.current?.click()}>
            Upload
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--p-text-3)', marginTop: 10, lineHeight: 1.5 }}>
          Drag on the page to pick a region · or paste / drop an image here · or right-click any image →
          <b style={{ color: 'var(--p-text-2)' }}> PROMPTIFY AI</b> · shortcut <Kbd>Alt</Kbd>+<Kbd>Shift</Kbd>+<Kbd>S</Kbd>
        </p>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
      </div>

      {needsPerm && (
        <Notice>
          Capturing from the panel needs <b>Browser Brain</b> access.{' '}
          <button type="button" className="p-btn p-btn-primary p-btn-xs" style={{ marginLeft: 4 }}
            onClick={async () => {
              if (await requestBrain()) { setNeedsPerm(false); void capture(); }
            }}>
            Enable
          </button>
          <div style={{ marginTop: 6 }}>Or use right-click → Screenshot → Perfect Prompt, which needs no extra access.</div>
        </Notice>
      )}

      {!online && <Notice>{health.info?.hint || 'Connect ChatGPT, Claude, or OpenRouter in Connect to use Vision.'}</Notice>}

      {job && <JobView job={job} flash={flash} onRerun={rerun} />}

      {/* Recent */}
      {recent.length > 0 && (
        <div>
          <div className="p-section-div">
            <span className="p-section-div-label">Recent</span>
            <div className="p-section-div-line" />
            <button type="button" className="p-btn p-btn-ghost p-btn-xs"
              onClick={async () => { await clearVisionHistory(); setRecent([]); }}>
              Clear
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {recent.map((it) => (
              <button key={it.id} type="button" onClick={() => openRecent(it)}
                title={`${VISION_MODES.find((m) => m.id === it.mode)?.label} · ${new Date(it.ts).toLocaleString()}`}
                style={{
                  aspectRatio: '1', borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer',
                  border: job?.id === it.id ? '2px solid var(--p-primary)' : '1px solid var(--p-border)',
                  background: 'var(--p-surface-2)', position: 'relative',
                }}>
                {it.thumb && <img src={it.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                <span style={{
                  position: 'absolute', left: 4, bottom: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                  borderRadius: 999, background: 'rgba(0,0,0,0.65)', color: '#fff',
                }}>
                  {it.mode === 'dna' ? 'DNA' : it.mode === 'prompts' ? 'PROMPT' : it.mode.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Job view ────────────────────────────────────────────────────────────────
function JobView({ job, flash, onRerun }: { job: VisionJob; flash: Flash; onRerun: (m: VisionMode) => void }) {
  return (
    <div className="p-card p-animate-in" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {job.image ? (
          <img src={job.image} alt="Analysed"
            style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--p-border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--p-surface-2)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
            <CameraIcon />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)' }}>
            {VISION_MODES.find((m) => m.id === job.mode)?.label}
          </div>
          {job.source?.title && (
            <div style={{ fontSize: 11, color: 'var(--p-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.source.title}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--p-text-2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {job.status === 'picking' && <>Drag on the page to select a region… (Esc to cancel)</>}
            {job.status === 'working' && <><MiniSpinner /> Reading the image…</>}
            {job.status === 'done' && job.model && <span style={{ color: 'var(--p-text-3)', fontSize: 11 }}>via {job.model}</span>}
          </div>
        </div>
      </div>

      {job.status === 'error' && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--p-error)', lineHeight: 1.5 }}>{job.error}</p>
          {job.hint && <p style={{ fontSize: 11.5, color: 'var(--p-text-2)', marginTop: 4 }}>{job.hint}</p>}
        </div>
      )}

      {job.status === 'done' && job.text && (
        <div style={{ marginTop: 12 }}>
          {job.mode === 'prompts' && <PerfectPromptsView text={job.text} flash={flash} />}
          {job.mode === 'dna' && <DnaView text={job.text} flash={flash} />}
          {job.mode !== 'prompts' && job.mode !== 'dna' && (
            <>
              <div className="pf-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <ResultView text={job.text} />
              </div>
              <PromptActions text={job.text} label={`${job.mode}: ${job.source?.title ?? 'image'}`} flash={flash} />
            </>
          )}
        </div>
      )}

      {job.image && (job.status === 'done' || job.status === 'error') && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--p-border)' }}>
          <span style={{ fontSize: 11, color: 'var(--p-text-3)', alignSelf: 'center', marginRight: 2 }}>Run again as</span>
          {VISION_MODES.map((m) => (
            <button key={m.id} type="button" className="p-btn p-btn-ghost p-btn-xs" onClick={() => onRerun(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PerfectPromptsView({ text, flash }: { text: string; flash: Flash }) {
  const p = useMemo(() => parsePerfectPrompts(parseJsonLoose(text)), [text]);
  const [tab, setTab] = useState<'image' | 'video' | 'ui'>('image');
  if (!p) return <RawFallback text={text} flash={flash} />;

  const body = tab === 'image' ? p.image : tab === 'video' ? p.video : p.ui;
  const full = tab === 'image' && p.negative ? `${p.image}\n\nNegative prompt: ${p.negative}` : body;
  return (
    <div>
      {(p.summary || p.type) && (
        <p style={{ fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5, marginBottom: 10 }}>
          {p.type && <span className="pk-badge">{p.type}</span>} {p.summary}
        </p>
      )}
      <div style={{ display: 'flex', background: 'var(--p-surface-2)', borderRadius: 999, padding: 3, gap: 2, marginBottom: 10 }}>
        {(['image', 'video', 'ui'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`p-tab ${tab === t ? 'p-tab-active' : ''}`}>
            {t === 'image' ? '🎨 Image' : t === 'video' ? '🎬 Video' : '🧩 UI'}
          </button>
        ))}
      </div>
      <PromptBox text={body || '—'} />
      {tab === 'image' && p.negative && (
        <div style={{ marginTop: 8 }}>
          <div className="p-label" style={{ marginBottom: 4 }}>Negative</div>
          <PromptBox text={p.negative} small />
        </div>
      )}
      <PromptActions text={full} label={`${tab} prompt: ${p.summary || 'screenshot'}`} flash={flash} />
    </div>
  );
}

function DnaView({ text, flash }: { text: string; flash: Flash }) {
  const parsed = useMemo(() => parseDna(parseJsonLoose(text)), [text]);
  const [dna, setDna] = useState<Dna | null>(parsed?.dna ?? null);
  const [target, setTarget] = useState<DnaTarget>('universal');

  useEffect(() => setDna(parsed?.dna ?? null), [parsed]);

  if (!parsed || !dna) return <RawFallback text={text} flash={flash} />;
  const compiled = compileDna(dna, target);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>🧬 {parsed.title}</div>
        <span style={{ fontSize: 10.5, color: 'var(--p-text-3)' }}>edit any gene ↓</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DNA_GENES.map((g) => (
          <label key={g.key} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 8, alignItems: 'start' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--p-text-2)', paddingTop: 7 }} title={g.hint}>{g.label}</span>
            <textarea
              value={dna[g.key]}
              onChange={(e) => setDna({ ...dna, [g.key]: e.target.value })}
              rows={Math.min(4, Math.max(1, Math.ceil(dna[g.key].length / 42)))}
              placeholder={g.hint}
              className="p-input"
              style={{ fontSize: 12, padding: '6px 9px', resize: 'none' }}
            />
          </label>
        ))}
      </div>

      <div className="p-section-div">
        <span className="p-section-div-label">Compiled prompt</span>
        <div className="p-section-div-line" />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {DNA_TARGETS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTarget(t.id)}
            className={`p-btn ${target === t.id ? 'p-btn-primary' : 'p-btn-ghost'} p-btn-xs`}>
            {t.label}
          </button>
        ))}
      </div>
      <PromptBox text={compiled} mono={target === 'json'} />
      <PromptActions text={compiled} label={`DNA · ${parsed.title}`} flash={flash} />

      {parsed.prompt && (
        <>
          <div className="p-section-div">
            <span className="p-section-div-label">Reusable master prompt</span>
            <div className="p-section-div-line" />
          </div>
          {parsed.variables.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {parsed.variables.map((v) => <span key={v} className="pk-badge">{v}</span>)}
            </div>
          )}
          <PromptBox text={parsed.prompt} />
          <PromptActions text={parsed.prompt} label={`DNA template · ${parsed.title}`} flash={flash} />
        </>
      )}
    </div>
  );
}

function RawFallback({ text, flash }: { text: string; flash: Flash }) {
  return (
    <>
      <div className="pf-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <ResultView text={text} />
      </div>
      <PromptActions text={text} label="Vision result" flash={flash} />
    </>
  );
}

function PromptBox({ text, small, mono }: { text: string; small?: boolean; mono?: boolean }) {
  return (
    <div className="pf-scroll" style={{
      background: 'var(--p-surface-2)', border: '1px solid var(--p-border)', borderRadius: 12,
      padding: '10px 12px', maxHeight: small ? 90 : 260, overflowY: 'auto', whiteSpace: 'pre-wrap',
      fontSize: mono ? 11.5 : 12.5, lineHeight: 1.6, color: 'var(--p-text-1)', userSelect: 'text',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
    }}>
      {text}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--p-surface-2)', borderRadius: 14, border: '1px solid var(--p-border)', fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'inherit', fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 5,
      border: '1px solid var(--p-border-2)', background: 'var(--p-surface-2)', color: 'var(--p-text-2)',
    }}>{children}</kbd>
  );
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
