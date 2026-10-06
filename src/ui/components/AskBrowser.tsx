import { type ReactNode, useEffect, useRef, useState } from 'react';
import { requestAi, requestCapture, sendToAi } from '@/lib/messages';
import { hubById } from '@/lib/aiHubs';
import {
  defaultTabSet,
  listTabs,
  planCommand,
  readTabsText,
  safeUrl,
  siteSearchUrl,
  tabsBlock,
  type AgentPlan,
  type TabInfo,
} from '@/lib/browserAgent';
import { gatherRecall, recallAnswer, recallTimeline, type RecallItem, type Timeline } from '@/lib/recall';
import { clearMemory, loadMemory, loadMemoryOn, MEMORY_KEY, saveMemoryOn } from '@/lib/memory';
import { hasBrain, hasPermission, requestBrain } from '@/lib/permissions';
import type { BackendHealth } from '../hooks/useBackendHealth';
import { MiniSpinner, ResultView } from './Analyzer';
import { loadHubPrefs, PromptActions } from './SendToAi';
import { Toggle } from './primitives';

type Flash = (msg: string, ok?: boolean) => void;

type Outcome =
  | { kind: 'say'; text: string }
  | { kind: 'answer'; text: string; sources: RecallItem[] }
  | { kind: 'timeline'; topic: string; data: Timeline }
  | { kind: 'close'; say: string; tabs: TabInfo[] }
  | { kind: 'report'; title: string; text: string }
  | { kind: 'error'; text: string; needsBrain?: boolean };

const EXAMPLES = [
  'What was that AI video tool I saw last week?',
  'Show me everything I researched about Chrome extensions',
  'Summarize everything in these tabs',
  'Close everything except development-related tabs',
  'Find the email where they mentioned pricing',
  'Compare these three products',
  'Open my YouTube AI research tabs',
  'Ask Claude to explain transformers simply',
];

// ── Speech recognition (Chrome's Web Speech API) ───────────────────────────
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecCtor = new () => SpeechRec;
const SpeechRecognitionImpl: SpeechRecCtor | undefined =
  (window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition;

function speak(text: string): void {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 280));
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* no TTS voice available */
  }
}

/**
 * Ask tab — "Talk to your browser". One input (typed or spoken) is planned
 * into an action: recall from memory/history, build a research timeline,
 * focus / close / summarize / compare tabs, search a site, or hand off to
 * another AI.
 */
export function AskBrowser({ health, flash, voiceSignal }: { health: BackendHealth; flash: Flash; voiceSignal: number }) {
  const [input, setInput] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [brain, setBrain] = useState(false);
  const [memOn, setMemOn] = useState(false);
  const [memCount, setMemCount] = useState(0);
  const [speakReplies, setSpeakReplies] = useState(true);

  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef('');
  const viaVoice = useRef(false);
  const online = health.state === 'online';

  useEffect(() => {
    void (async () => {
      setBrain(await hasBrain());
      setMemOn(await loadMemoryOn());
      setMemCount((await loadMemory()).length);
    })();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[MEMORY_KEY]) setMemCount(((changes[MEMORY_KEY].newValue as unknown[]) ?? []).length);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const reply = (o: Outcome) => {
    setOutcome(o);
    if (!viaVoice.current || !speakReplies) return;
    if (o.kind === 'say' || o.kind === 'answer') speak(o.text);
    else if (o.kind === 'close') speak(o.say);
    else if (o.kind === 'timeline') speak(o.data.summary || 'Here is your timeline.');
    else if (o.kind === 'error') speak(o.text);
  };

  // ── Execute a request ──
  const run = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (!online) return flash('Add your OpenRouter API key in Settings.', false);
    setOutcome(null);
    setBusy('Thinking…');
    try {
      const canTabs = await hasPermission('tabs');
      const tabs = canTabs ? await listTabs() : [];
      const plan = await planCommand(text, tabs);
      if ('error' in plan) return reply({ kind: 'error', text: plan.error });
      await execute(plan, text, tabs, canTabs);
    } finally {
      setBusy(null);
    }
  };
  // The speech callback outlives renders — always call the latest `run`.
  const runRef = useRef(run);
  runRef.current = run;

  async function execute(plan: AgentPlan, text: string, tabs: TabInfo[], canTabs: boolean): Promise<void> {
    const needTabs = ['focus_tabs', 'close_tabs', 'summarize_tabs', 'compare_tabs'].includes(plan.action);
    if (needTabs && !canTabs) {
      return reply({ kind: 'error', text: 'Turn on Browser Brain so I can see your tabs.', needsBrain: true });
    }

    switch (plan.action) {
      case 'recall': {
        setBusy(plan.mode === 'timeline' ? 'Building your timeline…' : 'Searching your memory…');
        const items = await gatherRecall(plan.keywords.length ? plan.keywords : text.split(/\s+/), plan.daysBack);
        if (!items.length) {
          const tip = (await hasPermission('history')) || memOn
            ? 'Try a longer time range or different words.'
            : 'Turn on Browser Brain (history) or Memory so I have something to search.';
          return reply({ kind: 'error', text: `I couldn’t find anything matching that. ${tip}`, needsBrain: !brain });
        }
        if (plan.reopen) {
          const urls = items.filter((it) => it.url).slice(0, 5);
          for (const [i, it] of urls.entries()) await chrome.tabs.create({ url: it.url, active: i === 0 });
          return reply({ kind: 'answer', text: plan.say || `Reopened ${urls.length} page${urls.length === 1 ? '' : 's'}.`, sources: urls });
        }
        if (plan.mode === 'timeline') {
          const data = await recallTimeline(text, items);
          return reply('error' in data ? { kind: 'error', text: data.error } : { kind: 'timeline', topic: text, data });
        }
        const ans = await recallAnswer(text, items);
        return reply('error' in ans ? { kind: 'error', text: ans.error } : { kind: 'answer', text: ans.answer, sources: ans.sources });
      }

      case 'focus_tabs': {
        const picked = tabs.filter((t) => plan.tabIds.includes(t.id));
        if (!picked.length) return reply({ kind: 'error', text: 'None of your open tabs match that.' });
        const first = picked[0];
        await chrome.windows.update(first.windowId, { focused: true });
        const sameWindow = picked.filter((t) => t.windowId === first.windowId);
        const all = await chrome.tabs.query({ windowId: first.windowId });
        const indices = sameWindow.map((t) => all.find((x) => x.id === t.id)?.index).filter((i): i is number => i !== undefined);
        await chrome.tabs.highlight({ windowId: first.windowId, tabs: indices });
        await chrome.tabs.update(first.id, { active: true });
        return reply({ kind: 'say', text: plan.say || `Brought up ${picked.length} tab${picked.length === 1 ? '' : 's'}.` });
      }

      case 'close_tabs': {
        const toClose = tabs.filter((t) => plan.tabIds.includes(t.id));
        if (!toClose.length) return reply({ kind: 'say', text: 'Nothing to close — everything looks relevant.' });
        return reply({ kind: 'close', say: plan.say || `Close ${toClose.length} tabs?`, tabs: toClose });
      }

      case 'summarize_tabs':
      case 'compare_tabs': {
        const set = defaultTabSet(tabs, plan.tabIds);
        setBusy(`Reading ${set.length} tab${set.length === 1 ? '' : 's'}…`);
        const texts = await readTabsText(set);
        if (!texts.length) {
          return reply({ kind: 'error', text: 'I couldn’t read those tabs — they may be Chrome pages or need Browser Brain access.', needsBrain: !brain });
        }
        setBusy(plan.action === 'compare_tabs' ? 'Comparing…' : 'Summarizing…');
        const res = await requestAi(plan.action === 'compare_tabs' ? 'tabs-compare' : 'tabs-summarize', tabsBlock(texts));
        if (!res.ok || !res.text) return reply({ kind: 'error', text: res.error || 'That didn’t work.' });
        return reply({ kind: 'report', title: plan.action === 'compare_tabs' ? `Compared ${texts.length} tabs` : `Summary of ${texts.length} tabs`, text: res.text });
      }

      case 'site_search': {
        const url = siteSearchUrl(plan.site, plan.query || text);
        await chrome.tabs.create({ url });
        return reply({ kind: 'say', text: plan.say || `Searching ${plan.site || 'the web'} for “${plan.query}”.` });
      }

      case 'navigate': {
        const url = safeUrl(plan.url);
        if (!url) return reply({ kind: 'error', text: 'I couldn’t work out which site to open.' });
        await chrome.tabs.create({ url });
        return reply({ kind: 'say', text: plan.say || `Opening ${new URL(url).hostname}.` });
      }

      case 'send_to_ai': {
        const hub = hubById(plan.target) ?? hubById('chatgpt');
        const { autoSend } = await loadHubPrefs();
        await sendToAi([hub?.id ?? 'chatgpt'], plan.prompt || text, autoSend);
        return reply({ kind: 'say', text: plan.say || `Sending that to ${hub?.name}.` });
      }

      case 'screenshot_prompt': {
        const r = await requestCapture('prompts');
        if (!r.ok && r.needsPermission) return reply({ kind: 'error', text: 'Screen capture from here needs Browser Brain.', needsBrain: true });
        return reply({ kind: 'say', text: plan.say || 'Drag on the page to pick what to turn into a prompt — results show in the Vision tab.' });
      }

      case 'answer':
      default:
        return reply({ kind: 'say', text: plan.say || 'I’m not sure how to help with that.' });
    }
  }

  // ── Voice ──
  const stopListening = () => recRef.current?.stop();

  const startListening = async () => {
    if (!SpeechRecognitionImpl) return flash('Voice input isn’t available in this browser.', false);
    // Chrome can't show a mic prompt inside the side panel — grant it once in a tab.
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (perm.state !== 'granted') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
        return flash('Allow the microphone in the new tab, then try again.');
      }
    } catch {
      /* permissions API unavailable — just try */
    }
    recRef.current?.abort();
    const rec = new SpeechRecognitionImpl();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = '';
    rec.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      finalRef.current = fin;
      setInterim(fin + mid);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        void chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        flash(`Voice error: ${e.error}`, false);
      }
    };
    rec.onend = () => {
      setListening(false);
      const said = finalRef.current.trim();
      setInterim('');
      if (said) {
        setInput(said);
        viaVoice.current = true;
        void runRef.current(said);
      }
    };
    recRef.current = rec;
    setListening(true);
    setOutcome(null);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  // Alt+Space / "Talk to your browser" from the menu bumps voiceSignal.
  useEffect(() => {
    if (voiceSignal > 0) {
      if (listening) stopListening();
      else void startListening();
    }
  }, [voiceSignal]);

  const submitTyped = () => {
    viaVoice.current = false;
    void run(input);
  };

  const enableBrain = async () => {
    const ok = await requestBrain();
    setBrain(ok);
    flash(ok ? 'Browser Brain enabled ✓' : 'Permission not granted', ok);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Command bar */}
      <div className="p-card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={listening ? interim : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitTyped();
              }
            }}
            placeholder={listening ? 'Listening…' : 'Ask your browser anything…'}
            rows={2}
            readOnly={listening}
            className="p-input pf-scroll"
            style={{ resize: 'none' }}
          />
          <button type="button"
            className={`pk-mic ${listening ? 'pk-mic-on' : ''}`}
            title={listening ? 'Stop listening' : 'Talk (Alt+Space)'}
            aria-label={listening ? 'Stop listening' : 'Start voice command'}
            onClick={() => (listening ? stopListening() : void startListening())}>
            <MicIcon />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--p-text-3)' }}>
            {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MiniSpinner />{busy}</span>
              : listening ? 'Speak now — I’ll act when you pause'
              : <>Enter to run · <b style={{ color: 'var(--p-text-2)' }}>Alt+Space</b> to talk from any page</>}
          </span>
          <button type="button" className="p-btn p-btn-primary p-btn-xs" disabled={!input.trim() || Boolean(busy)} onClick={submitTyped}>
            Run
          </button>
        </div>
      </div>

      {/* Examples */}
      {!outcome && !busy && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="pk-chip"
              onClick={() => { setInput(ex); viaVoice.current = false; void run(ex); }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {outcome && <OutcomeView outcome={outcome} flash={flash} onEnableBrain={() => void enableBrain()} onDone={(o) => setOutcome(o)} />}

      {/* Brain + memory */}
      <div className="p-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row title="Browser Brain" sub={brain ? 'History, tabs and page reading are on' : 'Lets me search history, see tabs and read pages'}>
          {brain
            ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--p-success)' }}>On ✓</span>
            : <button type="button" className="p-btn p-btn-primary p-btn-xs" onClick={() => void enableBrain()}>Enable</button>}
        </Row>
        <Row title="Memory" sub={memOn ? `${memCount} page${memCount === 1 ? '' : 's'} remembered · stored only on this device` : 'Remember pages you read so I can recall them later'}>
          <Toggle on={memOn} onChange={(v) => { setMemOn(v); void saveMemoryOn(v); flash(v ? 'Memory on — I’ll remember pages you read' : 'Memory paused'); }} />
        </Row>
        <Row title="Speak replies" sub="Read answers aloud after a voice command">
          <Toggle on={speakReplies} onChange={setSpeakReplies} />
        </Row>
        {memCount > 0 && (
          <button type="button" className="p-btn p-btn-ghost p-btn-xs" style={{ alignSelf: 'flex-start' }}
            onClick={async () => { await clearMemory(); flash('Memory cleared'); }}>
            Clear memory
          </button>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--p-text-3)', lineHeight: 1.5 }}>
          Memory skips incognito, sign-in, banking and payment pages. Only the few snippets relevant to a question are
          sent to the AI model when you ask.
        </p>
      </div>
    </div>
  );
}

// ── Outcome rendering ───────────────────────────────────────────────────────
function OutcomeView({
  outcome: o, flash, onEnableBrain, onDone,
}: { outcome: Outcome; flash: Flash; onEnableBrain: () => void; onDone: (o: Outcome) => void }) {
  if (o.kind === 'error') {
    return (
      <div className="p-animate-in" style={{ padding: '12px 14px', background: 'var(--p-surface-2)', borderRadius: 14, border: '1px solid var(--p-border)' }}>
        <p style={{ fontSize: 12.5, color: 'var(--p-text-1)', lineHeight: 1.55 }}>{o.text}</p>
        {o.needsBrain && (
          <button type="button" className="p-btn p-btn-primary p-btn-xs" style={{ marginTop: 8 }} onClick={onEnableBrain}>
            Enable Browser Brain
          </button>
        )}
      </div>
    );
  }

  if (o.kind === 'say') {
    return (
      <div className="p-card p-animate-in" style={{ padding: 14 }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--p-text-1)', whiteSpace: 'pre-wrap' }}>{o.text}</p>
      </div>
    );
  }

  if (o.kind === 'answer') {
    return (
      <div className="p-card p-animate-in" style={{ padding: 14 }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--p-text-1)', whiteSpace: 'pre-wrap' }}>{o.text}</p>
        {o.sources.length > 0 && (
          <>
            <div className="p-section-div"><span className="p-section-div-label">Sources</span><div className="p-section-div-line" /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {o.sources.map((s) => <SourceRow key={`${s.n}-${s.url}`} item={s} />)}
            </div>
          </>
        )}
      </div>
    );
  }

  if (o.kind === 'timeline') {
    return (
      <div className="p-card p-animate-in" style={{ padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Research timeline</div>
        {o.data.summary && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--p-text-2)', marginBottom: 12 }}>{o.data.summary}</p>}
        <div className="pk-timeline">
          {o.data.events.map((e, i) => (
            <div key={i} className="pk-tl-event">
              <div className="pk-tl-dot" />
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--p-text-3)', letterSpacing: '0.03em' }}>{fmtDay(e.date)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginTop: 1 }}>{e.title}</div>
              {e.note && <div style={{ fontSize: 12, color: 'var(--p-text-2)', lineHeight: 1.5, marginTop: 2 }}>{e.note}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {e.items.slice(0, 6).map((it) => <SourceRow key={`${i}-${it.n}`} item={it} compact />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (o.kind === 'close') {
    return <CloseConfirm say={o.say} tabs={o.tabs} flash={flash} onDone={onDone} />;
  }

  // report
  return (
    <div className="p-card p-animate-in" style={{ padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{o.title}</div>
      <div className="pf-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
        <ResultView text={o.text} />
      </div>
      <PromptActions text={o.text} label={o.title} flash={flash} />
    </div>
  );
}

function CloseConfirm({ say, tabs, flash, onDone }: { say: string; tabs: TabInfo[]; flash: Flash; onDone: (o: Outcome) => void }) {
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const closing = tabs.filter((t) => !keep.has(t.id));
  return (
    <div className="p-card p-animate-in" style={{ padding: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--p-text-1)', marginBottom: 10 }}>{say}</p>
      <div className="pf-scroll" style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tabs.map((t) => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', padding: '4px 2px' }}>
            <input type="checkbox" checked={!keep.has(t.id)}
              onChange={(e) => {
                const next = new Set(keep);
                if (e.target.checked) next.delete(t.id); else next.add(t.id);
                setKeep(next);
              }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--p-text-1)' }}>{t.title || t.url}</span>
            <span style={{ fontSize: 10.5, color: 'var(--p-text-3)', flexShrink: 0 }}>{t.host}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="p-btn p-btn-primary p-btn-sm" style={{ flex: 1 }} disabled={!closing.length}
          onClick={async () => {
            await chrome.tabs.remove(closing.map((t) => t.id));
            flash(`Closed ${closing.length} tab${closing.length === 1 ? '' : 's'} ✓`);
            onDone({ kind: 'say', text: `Closed ${closing.length} tab${closing.length === 1 ? '' : 's'}. Reopen with ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Shift+T if needed.` });
          }}>
          Close {closing.length} tab{closing.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={() => onDone({ kind: 'say', text: 'Okay, nothing closed.' })}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SourceRow({ item, compact }: { item: RecallItem; compact?: boolean }) {
  const clickable = Boolean(item.url);
  return (
    <button type="button" disabled={!clickable}
      onClick={() => clickable && void chrome.tabs.create({ url: item.url })}
      className="pk-source"
      style={{ padding: compact ? '5px 8px' : '8px 10px' }}>
      <span className="pk-source-avatar">{(item.host || '?').replace(/^www\./, '')[0]?.toUpperCase()}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--p-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
        {!compact && (
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--p-text-3)' }}>
            {item.host} · {new Date(item.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {item.source === 'prompt' ? ' · your prompt' : ''}
          </span>
        )}
      </span>
    </button>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--p-text-3)', lineHeight: 1.45 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function fmtDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  );
}
