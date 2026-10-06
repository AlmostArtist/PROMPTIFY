import { useEffect, useRef, useState } from 'react';
import { requestAi, sendToAi, type AiTask, type HistoryEntry } from '@/lib/messages';
import { addSavedPrompt } from '@/lib/storage';
import type { BackendHealth } from '@/ui/hooks/useBackendHealth';

const ACTIONS: { task: AiTask; label: string; description: string }[] = [
  { task: 'enhance', label: 'Enhance', description: 'Add clarity and structure' },
  { task: 'enhance-concise', label: 'Shorten', description: 'Keep only what matters' },
  { task: 'enhance-detailed', label: 'Expand', description: 'Give your AI more context' },
];

export function Workspace({ health, history, getPrompt, setPrompt, onSaved, onNavigate, flash }: {
  health: BackendHealth; history: HistoryEntry[];
  getPrompt: () => Promise<string | null>; setPrompt: (text: string) => Promise<boolean>;
  onSaved: (tool: string, original: string, enhanced: string) => Promise<void>;
  onNavigate: (tab: 'connections' | 'history' | 'prompts' | 'vision') => void;
  flash: (message: string, ok?: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [task, setTask] = useState<AiTask>('enhance');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastInput, setLastInput] = useState('');
  const running = useRef(false);
  useEffect(() => {
    void chrome.storage.session.get('pk_workspace_draft').then((value) => {
      setDraft(typeof value.pk_workspace_draft === 'string' ? value.pk_workspace_draft : ''); setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) void chrome.storage.session.set({ pk_workspace_draft: draft });
  }, [draft, loaded]);
  const run = async () => {
    if (!draft.trim() || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const original = draft.trim();
      const result = await requestAi(task, original);
      if (!result.ok || !result.text) { setError(result.error || 'No response received. Try again.'); return; }
      setOutput(result.text); setLastInput(original);
      await onSaved(ACTIONS.find((action) => action.task === task)?.label || 'Enhance', original, result.text);
    } catch { setError('The request failed. Check your connection and try again.'); }
    finally { setBusy(false); running.current = false; }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(output); flash('Prompt copied'); }
    catch { flash('Could not copy the prompt.', false); }
  };
  return <div className="pk-workspace">
    <section className="pk-welcome"><h1>Write a better prompt</h1><p>Start with a draft. Refine it, save it, or send it to your AI.</p></section>
    {health.state !== 'online' && <button className="pk-connect-banner" onClick={() => onNavigate('connections')}><span className="pk-connect-icon" aria-hidden="true">↗</span><span><strong>{health.state === 'checking' ? 'Checking your AI connection' : 'Connect your AI to get started'}</strong><small>ChatGPT, Claude or an OpenRouter key</small></span><span aria-hidden="true">→</span></button>}
    <section className="pk-composer" aria-label="Prompt workspace">
      <div className="pk-row"><label className="pk-label" htmlFor="workspace-draft">YOUR STARTING POINT</label><button className="pk-text-link" disabled={busy} onClick={async () => {
        const text = await getPrompt(); if (text) setDraft(text); else flash('Open an AI chat with a draft first.', false);
      }}>Grab from tab ↙</button></div>
      <textarea id="workspace-draft" value={draft} disabled={!loaded || busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && health.state === 'online') { e.preventDefault(); void run(); }
      }} placeholder="What would you like AI to help with?" maxLength={24000} rows={5} />
      <div className="pk-draft-meta"><span>{draft.length.toLocaleString()} / 24,000</span><span>⌘ / Ctrl + Enter to run</span></div>
      <div className="pk-rewrite-options" aria-label="Rewrite style">{ACTIONS.map((action) => <button key={action.task} aria-pressed={task === action.task} disabled={busy} title={action.description} onClick={() => setTask(action.task)}>{action.label}</button>)}</div>
      <button className="pk-run" disabled={!loaded || busy || !draft.trim() || health.state !== 'online'} onClick={() => void run()}><span>{busy ? 'Working on your prompt…' : `${ACTIONS.find((action) => action.task === task)?.label} prompt`}</span><span aria-hidden="true">{busy ? '◌' : '↗'}</span></button>
      {error && <p className="pk-error" role="alert">{error}</p>}
    </section>
    {busy && <div className="pk-working" role="status"><span /><span /><span /><p>Thinking through the details…</p></div>}
    {output && !busy && <section className="pk-result"><div className="pk-row"><h2>Your refined prompt</h2><button className="pk-text-link" onClick={() => { setDraft(lastInput); setOutput(''); }}>Restore original</button></div><p className="pk-result-text">{output}</p><div className="pk-button-row">
      <button className="p-btn p-btn-primary p-btn-sm" onClick={() => void copy()}>Copy prompt</button>
      <button className="p-btn p-btn-ghost p-btn-sm" onClick={async () => { const ok = await setPrompt(output); flash(ok ? 'Inserted into chat' : 'Focus a supported AI chat first.', ok); }}>Insert</button>
      <button className="p-btn p-btn-ghost p-btn-sm" onClick={async () => {
        try { await addSavedPrompt({ id: crypto.randomUUID(), label: output.slice(0, 48).replace(/\n/g, ' '), content: output, ts: Date.now() }); flash('Saved to your library'); }
        catch { flash('Could not save the prompt.', false); }
      }}>Save</button></div>
      <div className="pk-send-row"><span>Continue in</span>{['chatgpt', 'claude'].map((id) => <button key={id} className="pk-text-link" onClick={async () => { const ok = await sendToAi([id], output, false); flash(ok ? 'Opening a draft for review' : 'Could not open the chat.', ok); }}>{id === 'chatgpt' ? 'ChatGPT' : 'Claude'} ↗</button>)}</div>
    </section>}
    <section className="pk-shortcuts"><button onClick={() => onNavigate('prompts')}><span aria-hidden="true">▤</span><strong>Prompt library</strong><small>Your words, ready to reuse</small><span className="pk-shortcut-arrow" aria-hidden="true">↗</span></button><button onClick={() => onNavigate('vision')}><span aria-hidden="true">▧</span><strong>Start with an image</strong><small>Make a screenshot a prompt</small><span className="pk-shortcut-arrow" aria-hidden="true">↗</span></button></section>
    <section className="pk-recent"><div className="pk-row"><h2>Pick up where you left off</h2><button className="pk-text-link" onClick={() => onNavigate('history')}>View all →</button></div>
      {history.length ? history.slice(0, 3).map((entry) => <button className="pk-recent-entry" key={entry.id} disabled={busy} onClick={() => setDraft(entry.enhanced)}><span className="pk-recent-icon" aria-hidden="true">↺</span><span><strong>{entry.original || entry.enhanced}</strong><small>{entry.tool} · {new Date(entry.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span><span aria-hidden="true">↗</span></button>) : <div className="pk-empty-history"><span aria-hidden="true">↺</span><p>A fresh start.<br /><small>Your enhanced prompts will appear here.</small></p></div>}
    </section>
  </div>;
}
