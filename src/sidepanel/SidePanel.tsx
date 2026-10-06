import { ThemeControls } from '@/ui/components/ThemeControls';
import { useThemePreferences } from '@/ui/hooks/useThemePreferences';
import { ToolIcon } from '@/ui/icons/ToolIcon';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROLES, registerCustomRoles } from '@/data/roles';
import { getAdapter } from '@/content/siteAdapters';
import {
  clearHistory,
  loadCustomRoles,
  loadEnabled,
  loadHistory,
  loadOpenRouterKey,
  loadOpenRouterModel,
  loadSelectionRail,
  loadStats,
  saveEnabled,
  saveOpenRouterKey,
  saveOpenRouterModel,
  saveSelectionRail,
  type Stats,
} from '@/lib/storage';
import {
  exportHistory,
  modelLabel,
  MODEL_PRESETS,
  recordHistory,
  tabBurst,
  tabGetPrompt,
  tabSetGlow,
  tabSetPrompt,
  type HistoryEntry,
} from '@/lib/messages';
import { EnhancerSettings } from '@/ui/components/EnhancerSettings';
import { AiTools } from '@/ui/components/AiTools';
import { AskBrowser } from '@/ui/components/AskBrowser';
import { VisionStudio } from '@/ui/components/VisionStudio';
import { AiNews } from '@/ui/components/AiNews';
import { listModels } from '@/lib/messages';
import type { CatalogModel } from '@/lib/models';
import { AI_HUBS } from '@/lib/aiHubs';
import { subscribeVisionJob } from '@/lib/vision';
import { PromptCoach } from '@/ui/components/PromptCoach';
import { SavedPrompts, savePromptFromHistory } from '@/ui/components/SavedPrompts';
import { Toggle } from '@/ui/components/primitives';
import { useBackendHealth } from '@/ui/hooks/useBackendHealth';
import { Connections } from '@/ui/components/Connections';
import { Workspace } from '@/ui/components/Workspace';
import { RoboEyes, type RoboEyesMood } from '@/ui/RoboEyes';
import { RobotControls } from '@/ui/components/RobotControls';

type Tab = 'home' | 'connections' | 'analysis' | 'ask' | 'vision' | 'news' | 'enhancer' | 'tools' | 'prompts' | 'history' | 'settings';


const SITES = AI_HUBS.map((h) => h.name);
const TABS: { id: Tab; label: string }[] = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'home', label: 'Write' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'tools', label: 'Tools' },
  { id: 'history', label: 'History' },
  { id: 'ask', label: 'Ask' },
  { id: 'vision', label: 'Vision' },
  { id: 'news', label: 'AI News' },
  { id: 'enhancer', label: 'Enhancer' },
  { id: 'connections', label: 'Connect' },
];

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function activeSiteName(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const host = tab?.url ? new URL(tab.url).hostname : '';
    return getAdapter(host)?.name ?? 'Unknown';
  } catch { return 'Unknown'; }
}

export default function SidePanel() {
  const [tab, setTab] = useState<Tab>(() => { const hash = window.location.hash.slice(1); return ['settings', 'connections', 'news', 'ask', 'home'].includes(hash) ? hash as Tab : 'analysis'; });
  const appearance = useThemePreferences();
  const [enabled, setEnabled] = useState(true);
  const [selRail, setSelRail] = useState(true);
  const [apiKey, setApiKey]   = useState('');
  const [model, setModel]     = useState('');
  const [showKey, setShowKey] = useState(false);
  const [stats, setStats]     = useState<Stats>({ forged: 0, lastForgedAt: null });
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [voiceSignal, setVoiceSignal] = useState(0);
  const [freeModels, setFreeModels] = useState<CatalogModel[]>([]);

  const health   = useBackendHealth();
  const toastRef = useRef<number | undefined>(undefined);


  // Right-click / Alt+Shift+S vision jobs and Alt+Space voice requests jump to their tab.
  useEffect(() => {
    let lastJob = '';
    const unsubVision = subscribeVisionJob((job) => {
      if (job && job.id !== lastJob && (job.status === 'picking' || job.status === 'working')) {
        lastJob = job.id;
        setTab('vision');
      }
    });
    const onVoice = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.pf_voice_request?.newValue) {
        setTab('ask');
        setVoiceSignal((n) => n + 1);
      }
    };
    chrome.storage.onChanged.addListener(onVoice);
    // Opened by the shortcut itself? Pick up a request made just before we mounted.
    void chrome.storage.session.get('pf_voice_request').then((r) => {
      if (Date.now() - ((r.pf_voice_request as number) ?? 0) < 6000) {
        setTab('ask');
        setVoiceSignal((n) => n + 1);
      }
    });
    void chrome.storage.session.get('pf_vision_job').then((r) => {
      const job = r.pf_vision_job as { status?: string; ts?: number } | undefined;
      if (job && Date.now() - (job.ts ?? 0) < 10_000 && (job.status === 'picking' || job.status === 'working')) setTab('vision');
    });
    return () => { unsubVision(); chrome.storage.onChanged.removeListener(onVoice); };
  }, []);

  useEffect(() => {
    const navigate = (value: unknown) => { if (typeof value === 'string' && ['settings', 'connections', 'news', 'ask', 'home', 'tools', 'vision', 'prompts', 'analysis'].includes(value)) setTab(value as Tab); };
    void chrome.storage.session.get('pk_quick_route').then(data => { if (Date.now() - (data.pk_quick_route?.ts ?? 0) < 5000) navigate(data.pk_quick_route?.page); });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'session') navigate(changes.pk_quick_route?.newValue?.page); };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => { if (tab === 'settings') void listModels().then(setFreeModels); }, [tab]);

  // Tell the worker this window's panel is open, so the web-page quick tool
  // hides while it is. Reconnects if the worker restarts.
  useEffect(() => {
    let port: chrome.runtime.Port | undefined;
    let retry: number | undefined;
    let closed = false;
    const connect = async () => {
      const win = await chrome.windows.getCurrent().catch(() => undefined);
      if (closed || win?.id === undefined) return;
      port = chrome.runtime.connect({ name: `pk-panel:${win.id}` });
      port.onDisconnect.addListener(() => { if (!closed) retry = window.setTimeout(() => void connect(), 1000); });
    };
    void connect();
    return () => { closed = true; clearTimeout(retry); port?.disconnect(); };
  }, []);

  const refreshHistory = useCallback(async () => { setHistory(await loadHistory()); }, []);

  useEffect(() => {
    void (async () => {
      const [en, key, mdl, st, roles, sr] = await Promise.all([
        loadEnabled(), loadOpenRouterKey(), loadOpenRouterModel(),
        loadStats(), loadCustomRoles(), loadSelectionRail(),
      ]);
      setEnabled(en); setApiKey(key); setModel(mdl); setStats(st); setSelRail(sr);
      registerCustomRoles(roles);
      await refreshHistory();
    })();
  }, [refreshHistory]);

  useEffect(() => { if (tab === 'history') void refreshHistory(); }, [tab, refreshHistory]);

  const toggleTheme = () => appearance.update({ appearance: appearance.dark ? 'light' : 'dark' });

  const saveHistoryEntry = useCallback(async (tool: string, original: string, enhanced: string) => {
    recordHistory({ site: await activeSiteName(), tool, original, enhanced });
    window.setTimeout(() => void refreshHistory(), 400);
  }, [refreshHistory]);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const getPrompt = useCallback(async () => { const id = await activeTabId(); return id ? tabGetPrompt(id) : null; }, []);
  const setPrompt = useCallback(async (text: string) => { const id = await activeTabId(); return id ? tabSetPrompt(id, text) : false; }, []);
  const setGlow   = useCallback(async (on: boolean) => { const id = await activeTabId(); if (id) await tabSetGlow(id, on); }, []);
  const burstTab  = useCallback(async () => { const id = await activeTabId(); if (id) await tabBurst(id); }, []);

  const insertFromHistory = useCallback(async (text: string) => {
    const ok = await setPrompt(text);
    if (ok) { void burstTab(); flash('Inserted ✓'); }
    else flash('Focus an AI chat tab first', false);
  }, [setPrompt, burstTab, flash]);

  const groupedHistory = useMemo(() => {
    const m = new Map<string, HistoryEntry[]>();
    for (const e of history) {
      if (historyQuery && !`${e.original} ${e.enhanced} ${e.tool} ${e.site}`.toLowerCase().includes(historyQuery.toLowerCase())) continue;
      const k = e.site || 'Other';
      const arr = m.get(k); if (arr) arr.push(e); else m.set(k, [e]);
    }
    return [...m.entries()];
  }, [history, historyQuery]);

  const isDark = appearance.dark;
  const statusColor = health.state === 'online' ? '#22C55E' : health.state === 'checking' ? '#EAB308' : '#EF4444';
  const brandMood: RoboEyesMood = health.state === 'online' ? 'happy' : health.state === 'checking' ? 'thinking' : 'sleepy';

  return (
    <div
      className={`pf-root pk-panel ${isDark ? 'pf-theme-dark' : 'pf-theme-light'}`}
      style={appearance.tokens}
      data-theme-controls="true"
      data-preset={appearance.preferences.preset}
      data-layout={appearance.preferences.layout}
      data-density={appearance.preferences.density}
      data-reduced-motion={appearance.reducedMotion}
      data-page={tab}
    >
      <header className="pk-header">
        <button className="pk-brand" onClick={() => { setTab('analysis'); }} aria-label="PROMPTIFY workspace">
          <span className="pk-brand-robot" aria-hidden="true">
            <RoboEyes size={36} mood={brandMood} variant="visor" trackPointer reducedMotion={appearance.reducedMotion} />
          </span>
          <span><strong>PROMPTIFY</strong><small>Prompt workspace</small></span>
        </button>
        <button className="pk-icon-button" disabled={!appearance.ready} onClick={() => void toggleTheme()} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? '☀' : '◐'}</button>
        <button className="pk-icon-button" aria-label="Settings" aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => { setTab('settings'); }}>⚙</button>
      </header>
      <nav className="pk-navigation" aria-label="Tools">
        {TABS.map(({ id, label }) => <button key={id} data-tool={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><span className="pk-nav-icon"><ToolIcon name={id} /></span><span>{label}</span></button>)}
      </nav>
      <main className="pf-scroll pk-main" key={tab}>
        {tab === 'home' && <Workspace health={health} history={history} getPrompt={getPrompt} setPrompt={setPrompt} onSaved={saveHistoryEntry} onNavigate={setTab} flash={flash} />}
        {tab === 'connections' && <div className="p-animate-in"><SectionHeading sub="Models · limits · tokens">Connections</SectionHeading><Connections onChange={health.refresh} onSettings={() => setTab('settings')} flash={flash} /></div>}

        {/* ANALYSIS */}
        {tab === 'analysis' && (
          <div className="p-animate-in">
            <SectionHeading sub="Scores, trends & recommendations">Analysis</SectionHeading>
            <PromptCoach flash={(m, ok) => flash(m, ok)} />
          </div>
        )}

        {/* ASK — talk to your browser */}
        {tab === 'ask' && (
          <div className="p-animate-in">
            <SectionHeading sub="Recall · search · voice control">Ask your browser</SectionHeading>
            <AskBrowser health={health} flash={flash} voiceSignal={voiceSignal} />
          </div>
        )}

        {/* VISION — screenshot → prompt, Prompt DNA */}
        {tab === 'vision' && (
          <div className="p-animate-in">
            <SectionHeading sub="Screenshot analysis & prompt DNA">Vision</SectionHeading>
            <VisionStudio health={health} flash={flash} onConnections={() => setTab('connections')} />
          </div>
        )}

        {tab === 'news' && <AiNews />}

        {/* ENHANCER SETTINGS */}
        {tab === 'enhancer' && (
          <div className="p-animate-in">
            <SectionHeading sub="Tune the Enhance button, add-ons & features">Enhancer</SectionHeading>
            <EnhancerSettings flash={flash} />
          </div>
        )}

        {/* TOOLS */}
        {tab === 'tools' && (
          <div className="p-animate-in">
            <SectionHeading sub="Run AI on text in your focused tab">AI Tools</SectionHeading>
            <AiTools
              health={health} getPrompt={getPrompt} setPrompt={setPrompt}
              isDark={isDark}
              applyRoles={() => undefined}
              onBusyChange={(b) => void setGlow(b)}
              onSaved={(tool, orig, enh) => { void saveHistoryEntry(tool, orig, enh); void burstTab(); }}
            />
          </div>
        )}

        {/* PROMPTS */}
        {tab === 'prompts' && (
          <div className="p-animate-in">
            <SectionHeading>Saved Prompts</SectionHeading>
            <SavedPrompts setPrompt={setPrompt} onBurst={() => void burstTab()} flash={(m) => flash(m)} />
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="p-animate-in">
            <SectionHeading sub="Saved activity">History</SectionHeading>
            <input className="p-input pk-search" type="search" aria-label="Search history" placeholder="Search prompts, tools or sites…" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} />
            {history.length > 0 && groupedHistory.length === 0 && <p className="pk-muted">No prompts match your search.</p>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" className="p-btn p-btn-primary p-btn-sm"
                style={{ flex: 1 }}
                onClick={() => { exportHistory(); flash('Exported → .md ✓'); }}>
                Export .md
              </button>
              <button type="button" className="p-btn p-btn-ghost p-btn-sm"
                onClick={async () => { await clearHistory(); await refreshHistory(); flash('History cleared'); }}>
                Clear
              </button>
            </div>

            {history.length === 0 ? (
              <div className="p-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-text-2)', marginBottom: 4 }}>No history yet</div>
                <div style={{ fontSize: 12, color: 'var(--p-text-3)' }}>Use any tool to start logging</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {groupedHistory.map(([site, list]) => (
                  <div key={site}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-text-2)' }}>{site}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--p-sky-c)',
                        background: 'var(--p-sky)', borderRadius: 999, padding: '1px 7px',
                      }}>{list.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {list.map((e) => (
                        <HistoryCard key={e.id} entry={e}
                          onInsert={() => void insertFromHistory(e.enhanced)}
                          onCopy={() => { void navigator.clipboard?.writeText(e.enhanced); flash('Copied ✓'); }}
                          onSave={() => {
                            const label = e.enhanced.slice(0, 40).replace(/\n/g, ' ').trim() || 'Untitled';
                            void savePromptFromHistory(label, e.enhanced).then(() => flash('Saved ★'));
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div className="p-animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <RobotControls />
            <ThemeControls />
            <button className="pk-connect-banner" onClick={() => setTab('connections')}><span>Manage ChatGPT &amp; Claude connections</span><span aria-hidden="true">→</span></button>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <StatCard bg="var(--p-mint)" color="var(--p-mint-c)" label="Enhanced" value={stats.forged} />
              <StatCard bg="var(--p-sky)"  color="var(--p-sky-c)"  label="AI Roles"  value={ROLES.length} suffix="+" />
              <StatCard bg="var(--p-pink)" color="var(--p-pink-c)" label="AI Sites"  value={SITES.length} />
            </div>

            {/* Rail toggle */}
            <div className="p-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 2 }}>
                    Toolbar button
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--p-text-3)' }}>
                    Show the robot button on AI sites
                  </div>
                </div>
                <Toggle on={enabled} onChange={(v) => { setEnabled(v); void saveEnabled(v); }} />
              </div>
            </div>

            {/* Selection rail toggle */}
            <div className="p-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', marginBottom: 2 }}>
                    Selection rail
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--p-text-3)' }}>
                    Select text on any site → AI search, humanize, translate, save
                  </div>
                </div>
                <Toggle on={selRail} onChange={(v) => { setSelRail(v); void saveSelectionRail(v); }} />
              </div>
            </div>

            {/* API config */}
            <div className="p-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {health.state === 'online' ? `${health.info?.provider === 'openrouter' ? 'OpenRouter' : 'CLI'} connected` : health.state === 'checking' ? 'Checking connection…' : 'Not connected'}
                </span>
                <button type="button" onClick={health.refresh}
                  style={{ fontSize: 11, fontWeight: 500, color: 'var(--p-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  Recheck
                </button>
              </div>

              <p style={{ fontSize: 11, color: 'var(--p-text-3)', marginBottom: 10, lineHeight: 1.5 }}>
                Get a free key at{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
                  style={{ color: 'var(--p-sky-c)', textDecoration: 'none', fontWeight: 500 }}>
                  openrouter.ai/keys
                </a>
              </p>

              <div className="p-label" style={{ marginBottom: 6 }}>API Key</div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                <input type={showKey ? 'text' : 'password'} value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-…" spellCheck={false} autoComplete="off"
                  className="p-input" style={{ flex: 1, resize: 'none', height: 36, padding: '0 13px' }} />
                <button type="button" className="p-btn p-btn-ghost p-btn-sm"
                  onClick={() => setShowKey((s) => !s)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="p-label" style={{ marginBottom: 8 }}>Model</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
                {MODEL_PRESETS.map((m) => (
                  <button key={m.id} type="button"
                    onClick={() => setModel(m.id)}
                    className={`p-btn ${model === m.id ? 'p-btn-primary' : 'p-btn-ghost'} p-btn-sm`}
                    style={{ width: '100%' }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {freeModels.length > 0 && (
                <>
                  <div className="p-label" style={{ marginBottom: 6 }}>Or any free model</div>
                  <select value={MODEL_PRESETS.some((m) => m.id === model) ? '' : model}
                    onChange={(e) => { if (e.target.value) setModel(e.target.value); }}
                    className="p-input" style={{ height: 36, padding: '0 10px', marginBottom: 12, resize: 'none' }}>
                    <option value="">— choose —</option>
                    {freeModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.vision ? '👁 ' : ''}{m.name}</option>
                    ))}
                  </select>
                </>
              )}

              <button type="button" className="p-btn p-btn-primary"
                style={{ width: '100%' }}
                onClick={async () => {
                  const cleanKey = apiKey.trim();
                  await Promise.all([saveOpenRouterKey(cleanKey), saveOpenRouterModel(model)]);
                  setApiKey(cleanKey); flash('Settings saved. Checking connection…'); health.refresh();
                }}>
                Save &amp; Connect
              </button>
            </div>

            {/* Shortcuts */}
            <div className="p-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="p-label">Shortcuts</span>
                <button type="button" className="p-btn p-btn-ghost p-btn-xs"
                  onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
                  Change
                </button>
              </div>
              {[
                ['Talk to your browser', 'Alt + Space'],
                ['Screenshot → Perfect Prompt', 'Alt + Shift + S'],
                ['AI on anything', 'Right-click → PROMPTIFY AI'],
              ].map(([label, keys]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: 'var(--p-text-2)' }}>
                  <span>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--p-text-1)' }}>{keys}</span>
                </div>
              ))}
            </div>

            {/* Works on */}
            <div className="p-card" style={{ padding: '14px 16px' }}>
              <div className="p-label" style={{ marginBottom: 10 }}>Works on</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SITES.map((s) => (
                  <span key={s} style={{
                    fontSize: 12, fontWeight: 500, padding: '4px 11px',
                    borderRadius: 999, background: 'var(--p-surface-2)',
                    color: 'var(--p-text-2)', border: '1px solid var(--p-border)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--p-text-3)', paddingBottom: 4 }}>
              PROMPTIFY · Your prompt workspace
            </div>
          </div>
        )}
      </main>
      <footer className="pk-footer"><button onClick={() => setTab('connections')}><span className="pk-health-dot" data-state={health.state} />{health.state === 'online' ? modelLabel(health.info?.model) : health.state === 'checking' ? 'Checking connection…' : 'Connect an AI account'}</button><span>PROMPTIFY</span></footer>

      {/* ── TOAST ───────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, pointerEvents: 'none' }}>
          <div role="status" className="p-toast-in" style={{
            background: toast.ok ? 'var(--grad-primary)' : 'linear-gradient(135deg,#FF8EA0,#F0557A)',
            color: toast.ok ? 'var(--p-primary-fg)' : '#fff',
            borderRadius: 999, fontSize: 12, fontWeight: 650,
            padding: '9px 18px', whiteSpace: 'nowrap',
            boxShadow: '0 14px 28px -12px rgba(110,72,200,0.6), inset 0 1px 1px rgba(255,255,255,0.4)',
          }}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function SectionHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="pk-section-heading">
      <h2>
        {children}
      </h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function StatCard({ bg, color, label, value, suffix = '' }: { bg: string; color: string; label: string; value: number; suffix?: string }) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--p-text-1)', lineHeight: 1.1 }}>
        {value}{suffix}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );
}

function HistoryCard({
  entry: e, onInsert, onCopy, onSave,
}: { entry: HistoryEntry; onInsert: () => void; onCopy: () => void; onSave: () => void }) {
  return (
    <div
      className="p-card p-card-lift"
      role="button" tabIndex={0}
      onClick={onInsert}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onInsert(); } }}
      style={{ padding: '14px', cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--p-sky-c)',
          background: 'var(--p-sky)', borderRadius: 999, padding: '2px 9px',
          textTransform: 'capitalize',
        }}>
          {e.tool}
        </span>
        <span style={{ fontSize: 11, color: 'var(--p-text-3)' }}>
          {new Date(e.ts).toLocaleDateString()}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--p-text-3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 6 }}>
        {e.original}
      </p>
      <p style={{ fontSize: 13, color: 'var(--p-text-1)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
        {e.enhanced}
      </p>
      <div style={{ display: 'flex', gap: 7, marginTop: 12, alignItems: 'center' }}>
        <button type="button"
          onClick={(ev) => { ev.stopPropagation(); onCopy(); }}
          className="p-btn p-btn-ghost p-btn-xs">
          Copy
        </button>
        <button type="button"
          onClick={(ev) => { ev.stopPropagation(); onSave(); }}
          className="p-btn p-btn-ghost p-btn-xs">
          Save ★
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: 'var(--p-text-3)' }}>
          Insert →
        </span>
      </div>
    </div>
  );
}
