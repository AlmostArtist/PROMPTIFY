import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { grabActiveTabText, requestAi, requestCapture, recordHistory, requestUsageSnapshot, type AiTask, type UsageRing, type UsageSnapshot } from '@/lib/messages';
import { loadAiProvider, saveAiProvider, PROVIDER_LABELS, type AiProvider } from '@/lib/connections';
import { RING_COLORS } from '@/lib/theme';
import { useThemePreferences } from '../hooks/useThemePreferences';
import type { BackendHealth } from '../hooks/useBackendHealth';
import { ToolIcon } from '../icons/ToolIcon';
import { RoboEyes, type RoboEyesMood } from '../RoboEyes';
import { StructuredText } from './StructuredText';

type Route = 'settings' | 'connections' | 'home' | 'ask' | 'news' | 'tools' | 'vision' | 'prompts' | 'analysis';

/*
 * Quick tool — a themed capsule docked flush to the screen edge, "melting" out
 * of it through two concave fillets, with live usage rings.
 * On hover the capsule itself grows leftward into a
 * medium tool (no separate popup): usage rows, labelled actions, and an
 * inline page summary.
 *
 * Everything is inline-styled (no stylesheet): this renders on arbitrary web
 * pages, and strict style-src CSPs (ChatGPT, Claude…) block injected CSS.
 */
const FILLET = 18;
const DOCK_W = 48;
const MAX_OPEN_W = 292;

type BatteryStatus = {
  level: number;
  charging: boolean;
  addEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
  removeEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
};

const ACTION_TINT: Record<string, string> = {
  shot: '113, 139, 255',
  sum: '78, 190, 214',
  points: '173, 126, 229',
  explain: '104, 193, 151',
  ask: '105, 150, 255',
  tools: '177, 124, 218',
  write: '78, 184, 196',
  prompts: '220, 139, 103',
  settings: '149, 158, 176',
};

const NAME: Record<UsageRing['provider'], string> = { codex: 'ChatGPT', claude: 'Claude' };
const GLYPH: Record<UsageRing['provider'] | 'openrouter', string> = { codex: '◎', claude: '✳', openrouter: '↗' };

function resetIn(at: number | null): string {
  if (!at) return 'reset time not reported';
  const minutes = Math.ceil((at - Date.now()) / 60000);
  if (minutes <= 0) return 'resetting now';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `resets in ${h ? `${h}h ` : ''}${m}m`;
}

function durationText(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Circular usage meter. Animates its stroke from empty on first paint. */
function Ring({ value, color, textColor, trackColor, size = 34, stroke = 3.5, children, animate }: {
  value: number; color: string; textColor: string; trackColor: string; size?: number; stroke?: number; children?: ReactNode; animate: boolean;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) { setShown(value); return; }
    // A timer (not rAF) so rings also fill in tabs opened in the background.
    const id = window.setTimeout(() => setShown(value), 40);
    return () => clearTimeout(id);
  }, [value, animate]);
  const pct = Math.max(0, Math.min(100, shown));
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: animate ? 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' : 'none' }} />
      </svg>
      <span style={{ position: 'relative', color: textColor, fontSize: size * 0.36, lineHeight: 1 }}>{children}</span>
    </span>
  );
}

/** Concave corner that blends the capsule into the screen edge. */
function Fillet({ at, color }: { at: 'top' | 'bottom'; color: string }) {
  return <span aria-hidden="true" style={{
    position: 'absolute', right: 0, width: FILLET, height: FILLET, [at === 'top' ? 'bottom' : 'top']: '100%', pointerEvents: 'none',
    background: `radial-gradient(circle at 0 ${at === 'top' ? '0' : '100%'}, transparent ${FILLET - 0.5}px, ${color} ${FILLET}px)`,
  }} />;
}

export function ContextRail({ health, onNavigate, onCapture, readPage, web = false, hidden = false }: {
  health: BackendHealth;
  onNavigate: (route: Route) => void;
  /** Start a screenshot → prompt capture. Defaults to the panel's capture flow. */
  onCapture?: () => void;
  readPage?: () => Promise<string | null>;
  web?: boolean;
  /** Slide the dock away (e.g. while the side panel is open). */
  hidden?: boolean;
}) {
  const theme = useThemePreferences();
  const motion = !theme.reducedMotion;
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openrouter');
  const [mode, setMode] = useState<'brief' | 'detailed'>('brief');
  const [quality, setQuality] = useState<'quick' | 'balanced' | 'deep'>('balanced');
  const [busy, setBusy] = useState(false), [switching, setSwitching] = useState(false);
  const [summary, setSummary] = useState(''), [message, setMessage] = useState('');
  const [resultTitle, setResultTitle] = useState('Page summary');
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [clockMode, setClockMode] = useState<'clock' | 'timer' | 'alarm' | 'stopwatch'>('clock');
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(5 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [alarmAt, setAlarmAt] = useState<number | null>(null);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [arrived, setArrived] = useState(!motion);
  const [hot, setHot] = useState<string | null>(null);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 600px)').matches);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [railHeight, setRailHeight] = useState({ collapsed: 190, expanded: 330 });
  const root = useRef<HTMLElement>(null), hoverTimer = useRef<number>(), clockMenuTimer = useRef<number>();
  const body = useRef<HTMLDivElement>(null);
  const collapsedBody = useRef<HTMLDivElement>(null);
  const workspaceBody = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const running = useRef(false);

  useEffect(() => {
    const mq = matchMedia('(max-width: 600px)');
    const change = () => { setMobile(mq.matches); setViewportWidth(window.innerWidth); };
    mq.addEventListener('change', change);
    window.addEventListener('resize', change);
    void loadAiProvider().then(setProvider);
    void chrome.storage.local.get(['pk_summary_mode', 'pk_quick_quality']).then(data => {
      if (data.pk_summary_mode === 'detailed') setMode('detailed');
      if (data.pk_quick_quality === 'quick' || data.pk_quick_quality === 'deep') setQuality(data.pk_quick_quality);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.pf_ai_provider) { const value = changes.pf_ai_provider.newValue; if (['openrouter', 'codex', 'claude'].includes(value)) setProvider(value); health.refresh(); }
      if (changes.pk_summary_mode) setMode(changes.pk_summary_mode.newValue === 'detailed' ? 'detailed' : 'brief');
      if (changes.pk_quick_quality) {
        const value = changes.pk_quick_quality.newValue;
        setQuality(value === 'quick' || value === 'deep' ? value : 'balanced');
      }
      if (changes.pf_usage_snapshot?.newValue) setUsage(prev => ({ ...(changes.pf_usage_snapshot.newValue as UsageSnapshot), active: prev?.active }));
    };
    chrome.storage.onChanged.addListener(listener);
    const arrive = window.setTimeout(() => setArrived(true), 60);
    return () => { mq.removeEventListener('change', change); window.removeEventListener('resize', change); chrome.storage.onChanged.removeListener(listener); clearTimeout(hoverTimer.current); clearTimeout(clockMenuTimer.current); clearTimeout(arrive); };
  }, [health.refresh]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1_000);
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryStatus> }).getBattery;
    let manager: BatteryStatus | undefined;
    let active = true;
    const updateBattery = () => {
      if (active && manager) setBattery({ level: Math.round(manager.level * 100), charging: manager.charging });
    };
    if (getBattery) {
      void getBattery.call(navigator).then(result => {
        if (!active) return;
        manager = result;
        updateBattery();
        manager.addEventListener('levelchange', updateBattery);
        manager.addEventListener('chargingchange', updateBattery);
      }).catch(() => undefined);
    }
    return () => {
      active = false;
      clearInterval(tick);
      manager?.removeEventListener('levelchange', updateBattery);
      manager?.removeEventListener('chargingchange', updateBattery);
    };
  }, []);

  useEffect(() => {
    if (!timerRunning && !stopwatchRunning) return;
    const tick = window.setInterval(() => {
      if (timerRunning) setTimerSeconds(value => {
        if (value <= 1) { setTimerRunning(false); return 0; }
        return value - 1;
      });
      if (stopwatchRunning) setStopwatchSeconds(value => value + 1);
    }, 1_000);
    return () => clearInterval(tick);
  }, [timerRunning, stopwatchRunning]);

  useEffect(() => {
    if (alarmAt && now.getTime() >= alarmAt) {
      setAlarmRinging(true);
      setAlarmAt(null);
    }
  }, [alarmAt, now]);

  // Live usage rings: paint the last known values at once (also in background
  // tabs), then ask the worker for a fresh read only while the page is visible.
  useEffect(() => {
    void chrome.storage.local.get('pf_usage_snapshot').then(d => { const cached = d.pf_usage_snapshot as UsageSnapshot | undefined; if (cached) setUsage(prev => prev ?? cached); }).catch(() => undefined);
    const load = () => { if (document.visibilityState === 'visible') void requestUsageSnapshot().then(s => { if (s) setUsage(s); }); };
    load();
    const poll = window.setInterval(load, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', load);
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', load); };
  }, []);

  // Both rail states stay mounted and are measured independently. This lets
  // width, height, content and corner radius interpolate as one continuous
  // object instead of replacing one layout with another after a width jump.
  useLayoutEffect(() => {
    const update = () => {
      const collapsed = Math.ceil(collapsedBody.current?.getBoundingClientRect().height || 190);
      const expanded = Math.ceil(body.current?.getBoundingClientRect().height || 330);
      setRailHeight(current => current.collapsed === collapsed && current.expanded === expanded
        ? current
        : { collapsed, expanded });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    if (collapsedBody.current) observer.observe(collapsedBody.current);
    if (body.current) observer.observe(body.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (hidden) { setOpen(false); setPinned(false); setClockMenuOpen(false); } }, [hidden]);
  useEffect(() => {
    if (collapsedBody.current) collapsedBody.current.inert = open;
    if (body.current) body.current.inert = !open;
  }, [open]);
  useEffect(() => { if (workspaceBody.current) workspaceBody.current.inert = !workspaceOpen; }, [workspaceOpen]);
  useEffect(() => { if (open) setClockMenuOpen(false); }, [open]);
  useEffect(() => { if (pinned) clearTimeout(hoverTimer.current); }, [pinned]);
  const collapse = (restoreFocus = false) => {
    clearTimeout(hoverTimer.current); setOpen(false); setPinned(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };
  const expand = () => { setOpen(true); health.refresh(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!event.composedPath().includes(root.current as EventTarget)) collapse(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const runPageTool = async (task: AiTask, title: string, request: string) => {
    if (running.current) return;
    running.current = true; setBusy(true); setSummary(''); setResultTitle(title); setMessage('Reading this page…'); setPinned(true); setOpen(true);
    try {
      const text = await (readPage ?? grabActiveTabText)();
      if (!text?.trim()) throw new Error('This page can’t be read. Try a normal web page.');
      setMessage(`${title} with ${PROVIDER_LABELS[provider]}…`);
      const qualityInstruction = {
        quick: 'QUALITY: Quick. Return the essential answer only, normally no more than 3 compact points.',
        balanced: 'QUALITY: Balanced. Be concise but include the context needed to make each point useful.',
        deep: 'QUALITY: Deep. Check the material carefully, include important nuance, risks, exceptions and concrete next actions.',
      }[quality];
      const result = await requestAi(task, `${request}\n${qualityInstruction}\nUse one clearly separated bullet per idea when the result is a list.\n\nPAGE CONTENT:\n${text.slice(0, 14000)}`);
      if (!result.ok || !result.text) throw new Error(result.error || 'No result received. Check your connection and retry.');
      setSummary(result.text); setMessage('');
      recordHistory({ site: 'Quick tools', tool: title, original: text.slice(0, 14000), enhanced: result.text });
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Summary failed. Please retry.'); }
    finally { running.current = false; setBusy(false); }
  };

  const summarize = () => runPageTool(
    'content-summarize',
    'Page summary',
    `Requested format: ${mode === 'brief' ? '3 concise bullet points' : 'Detailed summary with headings and key takeaways'}.`,
  );

  const capture = () => {
    collapse();
    if (onCapture) onCapture();
    else void requestCapture('prompts');
  };
  const go = (route: Route) => { collapse(); onNavigate(route); };

  const rings = usage?.rings ?? [];
  const activeRing = rings.find(ring => ring.provider === usage?.active) ?? (rings.length === 1 ? rings[0] : undefined);
  const online = health.state === 'online';
  const tokens = theme.tokens;
  const dark = theme.dark;
  const ink = tokens['--p-surface'];
  const TILE = tokens['--p-surface-2'];
  const LINE = tokens['--p-border'];
  const TEXT = tokens['--p-text-1'];
  const DIM = tokens['--p-text-2'];
  const FAINT = tokens['--p-text-3'];
  const PRIMARY = tokens['--p-primary'];
  const PRIMARY_FG = tokens['--p-primary-fg'];
  const ringTrack = tokens['--ring-track'];
  const clockAccent = dark ? 'rgb(151,173,255)' : 'rgb(54,78,154)';
  const clockLabelColor = dark ? 'rgba(188,201,255,.72)' : 'rgb(73,91,148)';
  const batteryAccent = dark ? 'rgb(116,207,172)' : 'rgb(31,112,80)';
  const softOverlay = dark ? 'rgba(255,255,255,.035)' : 'rgba(17,32,43,.035)';
  const strongerOverlay = dark ? 'rgba(255,255,255,.065)' : 'rgba(17,32,43,.065)';
  const insetHighlight = dark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.72)';
  const expandedWidth = Math.min(MAX_OPEN_W, Math.max(DOCK_W, viewportWidth - 12));
  const ease = motion ? 'cubic-bezier(.2,.8,.2,1)' : 'linear';
  const hover = (id: string) => ({ onPointerEnter: () => setHot(id), onPointerLeave: () => setHot(h => (h === id ? null : h)), onFocus: () => setHot(id), onBlur: () => setHot(h => (h === id ? null : h)) });
  const tile = (id: string): CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, minHeight: 48, padding: '7px 9px',
    borderRadius: 14, border: `1px solid rgba(${ACTION_TINT[id] ?? '126, 139, 166'}, ${hot === id ? .34 : .16})`, cursor: 'pointer', font: 'inherit', textAlign: 'left',
    background: `radial-gradient(circle at 88% 8%, rgba(${ACTION_TINT[id] ?? '126, 139, 166'}, ${hot === id ? (dark ? .28 : .16) : (dark ? .17 : .09)}) 0, transparent 52%), ${hot === id ? strongerOverlay : softOverlay}`,
    color: TEXT, boxShadow: hot === id ? `inset 0 1px ${insetHighlight}, 0 9px 24px -18px rgba(${ACTION_TINT[id] ?? '126, 139, 166'}, ${dark ? .9 : .38})` : `inset 0 1px ${insetHighlight}`,
    transform: hot === id && motion ? 'translateY(-1px) scale(1.012)' : 'none',
    transition: motion ? `background 180ms, border-color 180ms, box-shadow 220ms, transform 220ms ${ease}` : 'none',
  });
  const iconTile = (id: string): CSSProperties => ({
    width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 10,
    color: `rgb(${ACTION_TINT[id] ?? '176, 185, 210'})`, background: `rgba(${ACTION_TINT[id] ?? '126, 139, 166'}, .12)`,
    boxShadow: `inset 0 1px ${insetHighlight}`,
  });
  const select: CSSProperties = { minHeight: 28, padding: '0 10px', borderRadius: 11, border: `1px solid ${LINE}`, background: TILE, color: TEXT, font: 'inherit', fontSize: 11.5, cursor: 'pointer' };
  const statusColor = online ? RING_COLORS.codex : health.state === 'checking' ? RING_COLORS.openrouter : RING_COLORS.claude;
  const hotMood: RoboEyesMood = hot?.includes('shot')
    ? 'surprised'
    : hot?.includes('ask')
      ? 'curious'
      : hot === 'sum'
        ? 'thinking'
        : hot === 'tools'
          ? 'mischievous'
          : hot === 'write'
            ? 'excited'
            : hot === 'prompts'
              ? 'love'
              : 'curious';
  const eyesMood: RoboEyesMood = busy
    ? 'thinking'
    : health.state === 'checking'
      ? 'thinking'
      : !online
        ? 'sleepy'
      : hot
        ? hotMood
        : open
          ? 'happy'
          : 'neutral';
  const timeText = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now);
  const alarmText = alarmAt ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(alarmAt)) : 'ALARM';
  const clockValue = clockMode === 'timer'
    ? durationText(timerSeconds)
    : clockMode === 'stopwatch'
      ? durationText(stopwatchSeconds)
      : clockMode === 'alarm'
        ? (alarmRinging ? 'ALARM' : alarmText)
        : timeText;
  const clockLabel = clockMode === 'timer'
    ? `Timer ${durationText(timerSeconds)}, ${timerRunning ? 'running' : 'paused'}`
    : clockMode === 'stopwatch'
      ? `Stopwatch ${durationText(stopwatchSeconds)}, ${stopwatchRunning ? 'running' : 'paused'}`
      : clockMode === 'alarm'
        ? (alarmRinging ? 'Alarm ringing' : `Alarm set for ${alarmText}`)
        : `Current time ${timeText}`;
  const closeClockMenuSoon = () => {
    clearTimeout(clockMenuTimer.current);
    clockMenuTimer.current = window.setTimeout(() => setClockMenuOpen(false), 220);
  };
  const openClockMenu = () => {
    clearTimeout(hoverTimer.current);
    clearTimeout(clockMenuTimer.current);
    setClockMenuOpen(true);
  };
  const chooseClockTool = (next: 'clock' | 'timer' | 'alarm' | 'stopwatch') => {
    setAlarmRinging(false);
    setClockMode(next);
    if (next === 'clock') { setTimerRunning(false); setStopwatchRunning(false); }
    if (next === 'timer') { setTimerSeconds(5 * 60); setTimerRunning(true); setStopwatchRunning(false); }
    if (next === 'stopwatch') { setStopwatchSeconds(0); setStopwatchRunning(true); setTimerRunning(false); }
    if (next === 'alarm') { setAlarmAt(Date.now() + 60 * 60 * 1000); setTimerRunning(false); setStopwatchRunning(false); }
    setClockMenuOpen(false);
  };
  const activateClockDisplay = () => {
    if (clockMode === 'timer') setTimerRunning(value => !value);
    else if (clockMode === 'stopwatch') setStopwatchRunning(value => !value);
    else if (clockMode === 'alarm' && alarmRinging) { setAlarmRinging(false); setClockMode('clock'); }
    else setClockMenuOpen(value => !value);
  };

  const actions: { id: string; group: 'page' | 'workspace'; icon: string; label: string; hint: string; run: () => void; disabled?: boolean }[] = [
    { id: 'shot', group: 'page', icon: 'vision', label: 'Screenshot', hint: 'Capture area', run: capture },
    { id: 'sum', group: 'page', icon: 'summary', label: busy ? 'Working…' : 'Summarize', hint: 'This page', run: () => void summarize(), disabled: busy || !online },
    { id: 'points', group: 'page', icon: 'points', label: 'Key points', hint: 'Main ideas', run: () => void runPageTool('content-key-points', 'Key points', 'Extract the useful facts, decisions and actions. One concise item per bullet.'), disabled: busy || !online },
    { id: 'explain', group: 'page', icon: 'explain', label: 'Explain', hint: 'Plain language', run: () => void runPageTool('content-explain', 'Plain-language explanation', 'Explain the important content in plain language with short, clearly separated points.'), disabled: busy || !online },
    { id: 'ask', group: 'workspace', icon: 'ask', label: 'Ask', hint: 'Your browser', run: () => go('ask') },
    { id: 'tools', group: 'workspace', icon: 'tools', label: 'AI tools', hint: 'Rewrite · debug', run: () => go('tools') },
    { id: 'write', group: 'workspace', icon: 'home', label: 'Write', hint: 'Enhance', run: () => go('home') },
    { id: 'prompts', group: 'workspace', icon: 'prompts', label: 'Prompts', hint: 'Library', run: () => go('prompts') },
    { id: 'settings', group: 'workspace', icon: 'settings', label: 'Settings', hint: 'Manage', run: () => go('settings') },
  ];

  // ── Collapsed: active usage plus compact device utilities ──
  const collapsed = (
    <div ref={collapsedBody} data-rail-state="collapsed" aria-hidden={open} style={{
      position: 'absolute', inset: '0 0 auto auto', width: DOCK_W, display: 'grid', justifyItems: 'center', gap: 8, padding: '18px 0 14px',
      boxSizing: 'border-box', opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto',
      transform: open ? 'translateX(10px) scale(.9)' : 'none', transformOrigin: 'right center',
      transition: motion ? `opacity 150ms ease, transform 300ms ${ease}` : 'none',
    }}>
      <span title="Quick tools" style={{ height: 22, display: 'grid', placeItems: 'center' }}>
        <RoboEyes size={30} mood={eyesMood} variant="eyes-only" color={TEXT} trackPointer={!busy} reducedMotion={!motion} />
      </span>
      {activeRing ? (
        <span title={`${NAME[activeRing.provider]} · ${activeRing.label}: ${activeRing.used}% used · ${resetIn(activeRing.resetsAt)}${activeRing.weekly !== undefined ? ` · weekly ${activeRing.weekly}%` : ''}`}
          style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: '2px 0' }}>
          <Ring value={activeRing.used} color={RING_COLORS[activeRing.provider]} textColor={TEXT} trackColor={ringTrack} animate={motion}>{GLYPH[activeRing.provider]}</Ring>
          <span style={{ fontSize: 10.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: TEXT }}>{activeRing.used}%</span>
        </span>
      ) : (
        <span title={`${PROVIDER_LABELS[provider]} · ${health.state}`} style={{ display: 'grid', justifyItems: 'center', gap: 5, padding: '4px 0' }}>
          <Ring value={online ? 100 : 0} color={provider === 'openrouter' ? RING_COLORS.openrouter : RING_COLORS[provider]} textColor={TEXT} trackColor={ringTrack} animate={motion}>{GLYPH[provider]}</Ring>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: online ? TEXT : DIM }}>{online ? 'Live' : 'Off'}</span>
        </span>
      )}
      <button type="button" data-time-utility aria-label={clockLabel} title={`${clockLabel} · hover for clock tools`}
        onPointerEnter={openClockMenu} onPointerLeave={closeClockMenuSoon} onFocus={openClockMenu} onBlur={closeClockMenuSoon} onClick={activateClockDisplay} style={{
        width: 38, minHeight: 31, display: 'grid', placeItems: 'center', padding: '5px 1px', boxSizing: 'border-box', cursor: 'pointer', font: 'inherit',
        borderRadius: 11, border: '1px solid rgba(106,146,255,.17)', color: clockAccent,
        background: `radial-gradient(circle at 80% 0%, rgba(106,146,255,${dark ? .22 : .14}), transparent 62%), ${softOverlay}`,
      }}>
        <strong data-clock-value style={{ color: alarmRinging ? tokens['--p-error'] : TEXT, fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace', fontSize: clockValue.length > 5 ? 7.4 : 9, lineHeight: 1, fontWeight: 720, letterSpacing: '-.06em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{clockValue}</strong>
        <span style={{ color: clockLabelColor, fontSize: 6.5, lineHeight: 1, letterSpacing: '.08em', textTransform: 'uppercase' }}>{clockMode === 'stopwatch' ? 'watch' : clockMode}</span>
      </button>
      {clockMenuOpen && <div data-clock-menu role="menu" aria-label="Clock tools" onPointerEnter={openClockMenu} onPointerLeave={closeClockMenuSoon} style={{
        position: 'absolute', right: 44, top: 103, width: 134, display: 'grid', gap: 4, padding: 6, boxSizing: 'border-box', zIndex: 3,
        borderRadius: 15, border: `1px solid ${LINE}`, background: ink, boxShadow: tokens['--p-shadow-lg'],
        transformOrigin: 'right top', animation: motion ? 'none' : undefined,
      }}>
        {[{ mode: 'timer' as const, label: 'Timer', meta: '5 minutes' }, { mode: 'alarm' as const, label: 'Alarm', meta: '+1 hour' }, { mode: 'stopwatch' as const, label: 'Stopwatch', meta: 'Count up' }].map(item => (
          <button key={item.mode} type="button" role="menuitem" onClick={() => chooseClockTool(item.mode)} style={{
            minHeight: 35, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, padding: '0 9px', border: 0, borderRadius: 10,
            background: clockMode === item.mode ? `radial-gradient(circle at 90% 0%, rgba(115,143,255,${dark ? .28 : .15}), transparent 64%), ${strongerOverlay}` : 'transparent',
            color: TEXT, cursor: 'pointer', font: 'inherit', textAlign: 'left',
          }}><span style={{ fontSize: 11, fontWeight: 650 }}>{item.label}</span><span style={{ fontSize: 8.5, color: DIM }}>{item.meta}</span></button>
        ))}
        {clockMode !== 'clock' && <button type="button" role="menuitem" onClick={() => chooseClockTool('clock')} style={{ minHeight: 28, border: 0, borderTop: `1px solid ${LINE}`, background: 'transparent', color: DIM, cursor: 'pointer', font: 'inherit', fontSize: 9.5 }}>Back to clock</button>}
      </div>}
      <span aria-label={battery ? `Battery ${battery.level} percent${battery.charging ? ', charging' : ''}` : 'Battery level unavailable'} title={battery ? `${battery.level}%${battery.charging ? ' · charging' : ''}` : 'Battery unavailable'} style={{
        width: 36, minHeight: 31, display: 'grid', placeItems: 'center', gap: 1, padding: '3px 0', boxSizing: 'border-box',
        borderRadius: 11, border: '1px solid rgba(92,196,157,.16)', color: batteryAccent,
        background: `radial-gradient(circle at 80% 0%, rgba(92,196,157,${dark ? .2 : .13}), transparent 62%), ${softOverlay}`,
      }}>
        <span style={{ height: 14, display: 'grid', placeItems: 'center', transform: 'scale(.72)' }}><ToolIcon name="battery" /></span>
        <strong style={{ color: TEXT, fontSize: 8.5, lineHeight: 1, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{battery ? `${battery.level}%` : '—'}</strong>
      </span>
    </div>
  );

  // ── Expanded: the same capsule, grown into a medium tool ──
  const expanded = (
    <div ref={body} id={web ? 'pk-web-quick-tools' : 'pk-panel-quick-tools'} data-rail-state="expanded" aria-hidden={!open} style={{
      position: 'absolute', inset: '0 0 auto auto', width: expandedWidth, boxSizing: 'border-box', padding: '14px 12px 16px 14px',
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, maxHeight: mobile ? 'min(84dvh, 650px)' : 'min(86dvh, 720px)', overflowY: 'auto', overscrollBehavior: 'contain',
      opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
      transform: open ? 'none' : 'translateX(18px) scale(.96)', transformOrigin: 'right center',
      transition: motion ? `opacity 220ms ${open ? '90ms' : '0ms'} ease, transform 390ms ${ease}` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RoboEyes size={31} mood={eyesMood} variant="eyes-only" color={TEXT} trackPointer={!busy} reducedMotion={!motion} />
        <strong style={{ fontSize: 13.5, letterSpacing: '-.01em', flex: 1 }}>Quick tools</strong>
        <span title={online ? 'AI connected' : 'Connection required'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: DIM }}>
          <i style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />{online ? 'Live' : health.state === 'checking' ? '…' : 'Off'}
        </span>
        <button type="button" aria-label="Collapse quick tools" onClick={() => collapse(true)} {...hover('close')} style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0, borderRadius: 10, border: `1px solid ${LINE}`,
          background: hot === 'close' ? `radial-gradient(circle at 80% 5%, rgba(126,139,255,${dark ? .25 : .14}), transparent 62%), ${strongerOverlay}` : 'transparent', color: hot === 'close' ? TEXT : DIM, cursor: 'pointer', font: 'inherit', fontSize: 18, lineHeight: 1,
          transition: motion ? 'background 160ms, color 160ms' : 'none',
        }}>×</button>
      </div>

      {rings.length > 0 && <section aria-label="AI usage" style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: FAINT, paddingLeft: 2 }}>AI usage</span>
        {rings.map(r => (
          <button key={r.provider} type="button" onClick={() => go('connections')} {...hover(`u-${r.provider}`)}
            title={`${r.label} · ${resetIn(r.resetsAt)}${r.weekly !== undefined ? ` · weekly ${r.weekly}%` : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 9px 5px 6px', borderRadius: 13, border: `1px solid ${LINE}`, background: hot === `u-${r.provider}` ? `radial-gradient(circle at 92% 5%, rgba(126,139,255,${dark ? .17 : .1}), transparent 58%), ${strongerOverlay}` : softOverlay, color: TEXT, cursor: 'pointer', font: 'inherit', textAlign: 'left', transition: motion ? 'background 180ms, transform 220ms' : 'none', transform: hot === `u-${r.provider}` ? 'translateY(-1px)' : 'none' }}>
            <Ring value={r.used} color={RING_COLORS[r.provider]} textColor={TEXT} trackColor={ringTrack} size={26} stroke={3} animate={motion}>{GLYPH[r.provider]}</Ring>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{NAME[r.provider]} · {r.label}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resetIn(r.resetsAt)}{r.weekly !== undefined ? ` · week ${r.weekly}%` : ''}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{r.used}%</span>
          </button>
        ))}
      </section>}

      <section style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: FAINT, paddingLeft: 2 }}>On this page</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        {actions.filter(action => action.group === 'page').map(a => (
          <button key={a.id} type="button" style={{ ...tile(a.id), opacity: a.disabled ? .5 : 1 }} {...hover(a.id)} onClick={a.run}
            disabled={a.disabled} aria-label={`${a.label}: ${a.hint}`}>
            <span style={iconTile(a.id)}><ToolIcon name={a.icon} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 650, lineHeight: 1.2 }}>{a.label}</span>
              <span style={{ display: 'block', fontSize: 10, opacity: .62, marginTop: 2, lineHeight: 1.2 }}>{a.hint}</span>
            </span>
          </button>
        ))}
        </div>
      </section>

      <section aria-label="Workspace tools" style={{ display: 'grid', borderTop: `1px solid ${LINE}`, borderBottom: workspaceOpen ? `1px solid ${LINE}` : '1px solid transparent', padding: '4px 0', transition: motion ? 'border-color 220ms ease' : 'none' }}>
        <button type="button" aria-expanded={workspaceOpen} aria-controls="pk-quick-workspace" onClick={() => setWorkspaceOpen(value => !value)} {...hover('workspace-toggle')} style={{
          minHeight: 38, width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px', border: 0, borderRadius: 10,
          background: hot === 'workspace-toggle' ? `radial-gradient(circle at 90% 0%, rgba(126,139,255,${dark ? .18 : .1}), transparent 58%), ${softOverlay}` : 'transparent', color: TEXT, cursor: 'pointer', font: 'inherit', textAlign: 'left',
          transition: motion ? 'background 160ms' : 'none',
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 680 }}>Workspace</span>
            <span style={{ display: 'block', marginTop: 1, fontSize: 10, color: DIM }}>5 tools · opens below</span>
          </span>
          <span aria-hidden="true" style={{ color: DIM, fontSize: 16, transform: `rotate(${workspaceOpen ? 90 : 0}deg)`, transition: motion ? `transform 260ms ${ease}` : 'none' }}>›</span>
        </button>
        <div style={{
          display: 'grid', gridTemplateRows: workspaceOpen ? '1fr' : '0fr', opacity: workspaceOpen ? 1 : 0,
          visibility: workspaceOpen ? 'visible' : 'hidden', pointerEvents: workspaceOpen ? 'auto' : 'none',
          transition: motion
            ? `grid-template-rows 340ms ${ease}, opacity 220ms ease, visibility 0s linear ${workspaceOpen ? '0ms' : '340ms'}`
            : 'none',
        }}>
          <div ref={workspaceBody} id="pk-quick-workspace" aria-hidden={!workspaceOpen} style={{ minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, padding: '4px 0 7px' }}>
              {actions.filter(action => action.group === 'workspace').map(a => (
                <button key={a.id} type="button" tabIndex={workspaceOpen ? 0 : -1} style={{ ...tile(a.id), opacity: a.disabled ? .5 : 1 }} {...hover(a.id)} onClick={a.run}
                  disabled={a.disabled} aria-label={`${a.label}: ${a.hint}`}>
                  <span style={iconTile(a.id)}><ToolIcon name={a.icon} /></span>
                  <span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 650, lineHeight: 1.2 }}>{a.label}</span>
                    <span style={{ display: 'block', fontSize: 10, opacity: .62, marginTop: 2, lineHeight: 1.2 }}>{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {(message || summary) && <section aria-label={resultTitle} style={{ display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 11.5, color: TEXT }}>{resultTitle}</strong>
        {message && <p role="status" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: DIM }}>{message}</p>}
        {summary && <>
          <div style={{ maxHeight: 190, overflowY: 'auto', padding: 10, borderRadius: 14, background: TILE, border: `1px solid ${LINE}`, overflowWrap: 'anywhere' }}><StructuredText text={summary} compact /></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={{ flex: 1, minHeight: 32, borderRadius: 11, border: 0, background: PRIMARY, color: PRIMARY_FG, font: 'inherit', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}
              onClick={async () => { try { await navigator.clipboard.writeText(summary); setMessage('Copied'); } catch { setMessage('Copy failed — select the text instead.'); } }}>Copy</button>
            <button type="button" style={{ minHeight: 32, padding: '0 12px', borderRadius: 11, border: `1px solid ${LINE}`, background: 'transparent', color: TEXT, font: 'inherit', fontSize: 12, cursor: 'pointer' }}
              onClick={() => { setSummary(''); setMessage(''); setPinned(false); }}>Clear</button>
          </div>
        </>}
      </section>}

      <section aria-label="Quick tool preferences" style={{ display: 'grid', gap: 8, padding: 9, borderRadius: 14, border: `1px solid ${LINE}`, background: softOverlay }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <select aria-label="AI connection" disabled={busy || switching} value={provider} style={{ ...select, flex: 1, minWidth: 0 }}
            onChange={async e => { const next = e.target.value as AiProvider; setSwitching(true); try { await saveAiProvider(next); setProvider(next); health.refresh(); } catch { setMessage('Could not change connection.'); } finally { setSwitching(false); } }}>
            {Object.entries(PROVIDER_LABELS).map(([id, name]) => <option value={id} key={id} style={{ background: ink, color: TEXT }}>{name}</option>)}
          </select>
          <select aria-label="Summary length" disabled={busy} value={mode} style={{ ...select, width: 88 }}
            onChange={async e => { const next = e.target.value as typeof mode; try { await chrome.storage.local.set({ pk_summary_mode: next }); setMode(next); } catch { /* keep current */ } }}>
            <option value="brief" style={{ background: ink, color: TEXT }}>Brief</option>
            <option value="detailed" style={{ background: ink, color: TEXT }}>Detailed</option>
          </select>
        </div>
        <fieldset aria-label="Result quality" style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 5 }}>
        <legend style={{ padding: 0, marginBottom: 2, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: FAINT }}>Result quality</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: 3, borderRadius: 11, background: TILE, border: `1px solid ${LINE}` }}>
          {(['quick', 'balanced', 'deep'] as const).map(option => <button key={option} type="button" aria-pressed={quality === option}
            onClick={() => { setQuality(option); void chrome.storage.local.set({ pk_quick_quality: option }); }}
            style={{ minHeight: 27, padding: '0 4px', border: 0, borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 10.5, fontWeight: quality === option ? 700 : 520, textTransform: 'capitalize', color: quality === option ? PRIMARY_FG : DIM, background: quality === option ? PRIMARY : 'transparent', boxShadow: quality === option ? tokens['--p-shadow-sm'] : 'none', transition: motion ? `background 180ms ${ease}, color 180ms ${ease}, transform 180ms ${ease}` : 'none', transform: quality === option ? 'scale(1)' : 'scale(.98)' }}>{option}</button>)}
        </div>
        </fieldset>
      </section>
    </div>
  );

  return <aside ref={root} aria-label="Quick tools" data-context-rail data-open={open} aria-hidden={hidden || undefined}
    style={{
      position: web ? 'fixed' : 'absolute', right: 0, zIndex: web ? 2147483644 : 20,
      top: '50%',
      transform: `translateY(-50%) translateX(${arrived && !hidden ? 0 : DOCK_W + 40}px)`,
      opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : 'auto',
      transition: motion ? `transform 520ms ${ease}, opacity 260ms` : 'none',
      ...tokens,
      colorScheme: dark ? 'dark' : 'light',
      fontFamily: tokens['--theme-font'], fontSize: tokens['--theme-size'], color: TEXT,
    }}
    onPointerEnter={e => {
      clearTimeout(hoverTimer.current);
      if ((e.target as Element).closest?.('[data-time-utility], [data-clock-menu]')) return;
      if (e.pointerType === 'mouse' && matchMedia('(hover: hover)').matches) hoverTimer.current = window.setTimeout(expand, 220);
    }}
    onPointerLeave={() => { clearTimeout(hoverTimer.current); setHot(null); if (!pinned) hoverTimer.current = window.setTimeout(() => { if (!root.current?.matches(':hover')) setOpen(false); }, 320); }}
    onFocusCapture={e => { const target = e.target as HTMLElement; target.style.outline = `2px solid ${tokens['--theme-accent-text']}`; target.style.outlineOffset = '2px'; }}
    onBlurCapture={e => { (e.target as HTMLElement).style.outline = ''; }}
    onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); collapse(true); } }}>
    <div style={{ position: 'relative' }}>
      <Fillet at="top" color={ink} />
      <Fillet at="bottom" color={ink} />
      {/* The capsule grows leftward from the edge; content is right-aligned and revealed as it widens. */}
      <div data-rail-morph style={{
        position: 'relative', boxSizing: 'border-box', width: open ? expandedWidth : DOCK_W, height: open ? railHeight.expanded : railHeight.collapsed,
        overflow: open ? 'hidden' : 'visible', background: ink,
        borderRadius: `${open ? 22 : DOCK_W / 2}px 0 0 ${open ? 22 : DOCK_W / 2}px`,
        boxShadow: tokens['--p-shadow-lg'], border: `1px solid ${LINE}`, borderRight: 0,
        transition: motion ? `width 420ms ${ease}, height 420ms ${ease}, border-radius 420ms ${ease}, box-shadow 420ms` : 'none',
      }}>
        {collapsed}
        {expanded}
      </div>
      {/* Tap / keyboard handle: opens the capsule without hover. */}
      {!open && <button ref={trigger} type="button" aria-label="Expand quick tools" aria-expanded={false}
        onClick={expand} style={{ position: 'absolute', left: 6, top: 7, width: 16, height: 5, border: 0, padding: 0, borderRadius: 3, background: DIM, opacity: .45, cursor: 'pointer' }} />}
    </div>
  </aside>;
}
