import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { requestAi, type AiTask, type SessionData } from '@/lib/messages';
import type { BackendHealth } from '../hooks/useBackendHealth';
import { StructuredText } from './StructuredText';

interface SessionToolsProps {
  health: BackendHealth;
  getSession: () => Promise<SessionData | null>;
  setPrompt: (text: string) => Promise<boolean>;
  onBusyChange?: (busy: boolean) => void;
  onBurst?: () => void;
  flash: (msg: string) => void;
}

const STOOLS: { task: AiTask; label: string; blurb: string; mark: string }[] = [
  { task: 'summarize', label: 'Summarize', blurb: 'Recap the chat', mark: '∑' },
  { task: 'analyze', label: 'Analyze', blurb: 'Insights & sentiment', mark: '◎' },
  { task: 'action-items', label: 'Action items', blurb: 'Tasks & next steps', mark: '✓' },
  { task: 'key-topics', label: 'Key topics', blurb: 'Main themes', mark: '#' },
  { task: 'tldr', label: 'TL;DR', blurb: '2–3 sentences', mark: '!' },
];

function buildMarkdown(s: SessionData): string {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const count = s.count > 0 ? `${s.count} messages` : 'transcript';
  return `# Session — ${s.site}\n\n_Captured ${when} · ${count}_\n\n${s.text.trim()}\n`;
}

export function SessionTools({ health, getSession, setPrompt, onBusyChange, onBurst, flash }: SessionToolsProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [busy, setBusy] = useState<AiTask | null>(null);
  const [result, setResult] = useState<{ task: AiTask; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const online = health.state === 'online';

  const capture = useCallback(async () => {
    setCapturing(true);
    setError(null);
    const s = await getSession();
    setCapturing(false);
    if (!s || !s.text) {
      setSession(null);
      setError('No conversation found. Open a chat with messages and recapture.');
      return;
    }
    setSession(s);
  }, [getSession]);

  // Auto-capture when the tab is first shown.
  useEffect(() => {
    void capture();
  }, [capture]);

  const run = async (task: AiTask) => {
    if (!session?.text) {
      setError('Capture a conversation first.');
      return;
    }
    setError(null);
    setResult(null);
    setBusy(task);
    onBusyChange?.(true);
    const res = await requestAi(task, session.text);
    setBusy(null);
    onBusyChange?.(false);
    if (!res.ok || !res.text) {
      setError([res.error, res.hint].filter(Boolean).join('\n') || 'Request failed.');
      return;
    }
    setResult({ task, text: res.text });
  };

  const copyMd = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(session));
      flash('Session copied as .md ✓');
    } catch {
      flash('Copy failed.');
    }
  };

  const exportMd = async () => {
    if (!session) return;
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(buildMarkdown(session))}`;
    try {
      await chrome.downloads.download({ url, filename: 'PROMPTIFY/promptify-session.md', conflictAction: 'overwrite', saveAs: false });
      flash('Exported session → .md ✓');
    } catch {
      flash('Export failed.');
    }
  };

  const sendToPrompt = async (text: string) => {
    const ok = await setPrompt(text);
    if (ok) {
      onBurst?.();
      flash('Pasted into the prompt box ✓');
    } else {
      flash('Focus a supported AI chat tab first.');
    }
  };

  return (
    <div>
      {/* Capture status */}
      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-3 text-[11px]">
        <span className="text-[var(--pf-muted)]">
          {capturing
            ? 'Reading the conversation…'
            : session
              ? `${session.site} · ${session.count > 0 ? `${session.count} messages` : 'captured'} · ${session.text.length.toLocaleString()} chars`
              : 'No conversation captured'}
        </span>
        <button type="button" onClick={() => void capture()} className="ml-auto text-[10px] text-[var(--pf-accent)] hover:opacity-80">
          recapture
        </button>
      </div>

      {/* Session export / paste */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SmallBtn onClick={copyMd} disabled={!session}>
          Copy .md
        </SmallBtn>
        <SmallBtn onClick={exportMd} disabled={!session}>
          Export .md
        </SmallBtn>
        <SmallBtn onClick={() => session && void sendToPrompt(session.text)} disabled={!session} accent>
          Use as prompt
        </SmallBtn>
      </div>

      {!online && (
        <div className="mb-3 rounded-lg border border-[var(--pf-border)] bg-[var(--pf-elev)] p-2 text-[10.5px] text-[var(--pf-muted)]">
          {health.info?.hint || 'Add your OpenRouter API key in Settings to use the analysis tools.'}
        </div>
      )}

      {/* AI session tools */}
      <div className="grid grid-cols-2 gap-2.5">
        {STOOLS.map((t) => (
          <button
            key={t.task}
            type="button"
            disabled={!online || !session || busy !== null}
            onClick={() => run(t.task)}
            title={t.blurb}
            className="group relative h-[78px] overflow-hidden rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-2.5 text-left transition-transform duration-150 hover:scale-[1.03] hover:bg-[var(--pf-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="pointer-events-none absolute -right-1 -top-3 select-none text-[52px] font-black leading-none text-[var(--pf-accent)] opacity-15">
              {t.mark}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="text-[12px] font-semibold text-[var(--pf-fg)]">{busy === t.task ? 'Working…' : t.label}</div>
              <div className="text-[10px] text-[var(--pf-faint)]">{t.blurb}</div>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--pf-border)] bg-[var(--pf-elev)] px-2.5 py-1.5 text-[10.5px] text-[var(--pf-fg)]">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--pf-faint)]">
              {STOOLS.find((t) => t.task === result.task)?.label}
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(result.text);
                  flash('Copied');
                }}
                className="text-[10px] text-[var(--pf-accent)] hover:opacity-80"
              >
                Copy
              </button>
              <button type="button" onClick={() => void sendToPrompt(result.text)} className="text-[10px] text-[var(--pf-accent)] hover:opacity-80">
                Send →
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto pf-scroll">
            <StructuredText text={result.text} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function SmallBtn({
  onClick,
  children,
  disabled,
  accent,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-xl py-2 text-[11px] font-semibold transition-colors disabled:opacity-40',
        accent
          ? 'bg-[var(--pf-accent)] text-[var(--pf-accent-fg)] hover:opacity-90'
          : 'border border-[var(--pf-border)] bg-[var(--pf-elev)] text-[var(--pf-fg)] hover:bg-[var(--pf-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
