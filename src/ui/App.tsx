import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, type PromptConfig } from '@/engine/types';
import { findPromptInput, type SiteAdapter } from '@/content/siteAdapters';
import { readPrompt, streamWrite } from '@/content/inject';
import { addAnalysis, bumpForged, DEFAULT_ENHANCER, loadCoach, loadConfig, loadCustomRoles, loadEnabled, loadEnhancer, onStorageChanged, subscribeEnhancer, type EnhancerPrefs } from '@/lib/storage';
import { ENHANCER_TASK, openSidePanel, recordHistory, requestAi, type AiTask, type EnhanceSubMode } from '@/lib/messages';
import { registerCustomRoles } from '@/data/roles';
import { useBackendHealth } from './hooks/useBackendHealth';
import { useThemePreferences } from './hooks/useThemePreferences';
import { PromptBarFX } from './PromptBarFX';
import { EnhanceCelebration } from './EnhanceCelebration';
import Toolbar, { type ForgeStatus } from './Toolbar';
import QuickActionPopover, { type QuickActionKind } from './components/QuickActionPopover';

/** Friendly history-label for each quick-action task. */
const TASK_LABELS: Partial<Record<AiTask, string>> = {
  'enhance-concise': 'Enhance · Concise',
  'enhance-detailed': 'Enhance · Detailed',
  'enhance-structured': 'Enhance · Structured',
  'enhance-translate': 'Enhance · Translate to English',
  'tone-professional': 'Tone · Professional',
  'tone-friendly': 'Tone · Friendly',
  'tone-assertive': 'Tone · Assertive',
  'tone-diplomatic': 'Tone · Diplomatic',
  'tone-casual': 'Tone · Casual',
  'tone-technical': 'Tone · Technical',
  'translate-english': 'Language · Translate to English',
  'fix-english-grammar': 'Language · Fix English grammar',
};

interface PopoverState {
  kind: QuickActionKind;
  rect: DOMRect;
}

/** Is `el` something we can read/rewrite a draft inside? */
function isEditable(el: Element | null): el is HTMLElement {
  return (
    !!el &&
    ((el as HTMLElement).isContentEditable ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLInputElement)
  );
}

interface ParsedAnalysis {
  score: number;
  verdict: string;
  mistakes: string[];
  improvements: string[];
  tips: string[];
}

/** Tolerantly parse the coach model's JSON (handles code fences / stray text). */
function parseAnalysis(text: string): ParsedAnalysis | null {
  try {
    let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    const o = JSON.parse(t) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
      verdict: String(o.verdict ?? '').trim(),
      mistakes: arr(o.mistakes),
      improvements: arr(o.improvements),
      tips: arr(o.tips),
    };
  } catch {
    return null;
  }
}

export default function App({ adapter }: { adapter: SiteAdapter | null }) {
  const [enabled, setEnabled] = useState(true);
  // config is kept in sync with side-panel changes (onStorageChanged) even
  // though the toolbar no longer reads it directly.
  const [, setConfig] = useState<PromptConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ForgeStatus | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [externalGlow, setExternalGlow] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const health = useBackendHealth();
  const appearance = useThemePreferences();
  const theme = appearance.dark ? 'dark' : 'light';

  const statusTimer = useRef<number | undefined>(undefined);
  const lastWritten = useRef<string | null>(null);
  // The exact editable the user was typing in when a popover opened, so the
  // rewrite targets that element even after focus moves to the popover.
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [en, cfg, customRoles] = await Promise.all([loadEnabled(), loadConfig(), loadCustomRoles()]);
      if (!alive) return;
      registerCustomRoles(customRoles);
      setEnabled(en);
      setConfig(cfg);
      setReady(true);
    })();
    // Stay in sync with edits made from the side panel.
    const unsub = onStorageChanged(({ enabled: en, config: cfg }) => {
      if (en !== undefined) setEnabled(en);
      if (cfg !== undefined) setConfig(cfg);
    });
    return () => {
      alive = false;
      unsub();
      window.clearTimeout(statusTimer.current);
    };
  }, []);

  // The side panel drives these on this tab while its AI tools run.
  useEffect(() => {
    const onGlow = (e: Event) => setExternalGlow(Boolean((e as CustomEvent).detail?.on));
    const onBurst = () => setBurstKey((k) => k + 1);
    window.addEventListener('pf-glow', onGlow as EventListener);
    window.addEventListener('pf-burst', onBurst);
    return () => {
      window.removeEventListener('pf-glow', onGlow as EventListener);
      window.removeEventListener('pf-burst', onBurst);
    };
  }, []);

  const flash = useCallback((kind: ForgeStatus['kind'], message: string) => {
    setStatus({ kind, message });
    window.clearTimeout(statusTimer.current);
    if (kind !== 'busy') statusTimer.current = window.setTimeout(() => setStatus(null), 2800);
  }, []);

  const inputEl = useCallback(() => findPromptInput(adapter), [adapter]);

  // Prompt Coach: after enhancing, analyse original-vs-enhanced and store it so
  // the side panel's Analysis tab can teach the user. Runs only when enabled and
  // never blocks the enhance UX (fire-and-forget).
  const runCoach = useCallback(async (original: string, enhanced: string) => {
    try {
      if (!(await loadCoach())) return;
      const res = await requestAi('prompt-coach', `ORIGINAL PROMPT:\n${original}\n\nENHANCED PROMPT:\n${enhanced}`);
      if (!res.ok || !res.text) return;
      const parsed = parseAnalysis(res.text);
      if (!parsed) return;
      await addAnalysis({ site: adapter?.name ?? 'Unknown', original, enhanced, ...parsed });
    } catch {
      /* coaching is best-effort — never surface its failures */
    }
  }, [adapter]);

  // Shared runner for every in-place rewrite (Enhance button + both popovers).
  // Reads the draft, calls the loaded model, then types the result back into the
  // prompt box with a streaming effect.
  const runTask = useCallback(
    async (
      task: AiTask,
      opts?: { subModes?: EnhanceSubMode[]; tool?: string; coach?: boolean; el?: HTMLElement | null },
    ) => {
      const el = opts?.el?.isConnected ? opts.el : inputEl();
      if (!el) return flash('warn', 'Couldn’t find the prompt box on this page.');
      const raw = readPrompt(el).trim();
      if (!raw) return flash('warn', 'Type a prompt first, then try again.');
      if (health.state !== 'online') {
        health.refresh();
        return flash('warn', 'Add your OpenRouter API key in the panel to enable AI.');
      }
      setEnhancing(true);
      flash('busy', 'Rewriting with AI…');
      const res = await requestAi(task, raw, undefined, opts?.subModes);
      if (!res.ok || !res.text) {
        setEnhancing(false);
        return flash('warn', res.error || 'Rewrite failed.');
      }
      await streamWrite(el, res.text); // typewriter reveal in place
      setEnhancing(false);
      lastWritten.current = res.text;
      void bumpForged();
      recordHistory({ site: adapter?.name ?? 'Unknown', tool: opts?.tool ?? 'Rewrite', original: raw, enhanced: res.text });
      setBurstKey((k) => k + 1);
      flash('ok', 'Done ✓');
      if (opts?.coach) void runCoach(raw, res.text);
    },
    [inputEl, adapter, health, flash, runCoach],
  );

  // The toolbar Enhance button follows the user's chosen strength + default
  // add-ons (set in the panel's Enhancer tab), kept live in a ref.
  const enhancerRef = useRef<EnhancerPrefs>(DEFAULT_ENHANCER);
  useEffect(() => {
    void loadEnhancer().then((p) => { enhancerRef.current = p; });
    return subscribeEnhancer((p) => { enhancerRef.current = p; });
  }, []);

  const onEnhance = useCallback(() => {
    const { strength, subModes } = enhancerRef.current;
    void runTask(ENHANCER_TASK[strength], { subModes, tool: 'Enhance', coach: true });
  }, [runTask]);

  const onEnhanceTranslate = useCallback(
    () => runTask('enhance-translate', { tool: 'Enhance · Translate to English', coach: true }),
    [runTask],
  );

  // Run a quick-action chosen from a popover, dismissing the popover first.
  const onPopoverRun = useCallback(
    (task: AiTask, subModes?: EnhanceSubMode[]) => {
      const el = targetRef.current;
      setPopover(null);
      void runTask(task, { subModes, tool: TASK_LABELS[task] ?? 'Rewrite', coach: task.startsWith('enhance-'), el });
    },
    [runTask],
  );

  // Keyboard shortcuts: Cmd/Ctrl+↑ opens the Prompt Enhancer, Cmd/Ctrl+↓ the
  // Tone Shifter, and Cmd/Ctrl+→ Translation & English. We trigger off the *focused* editable (the composer the user is
  // actually typing in) rather than re-deriving it, and only while an editable is
  // focused — so we never hijack the browser's scroll-to-top/bottom elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowRight') return;
      const el = document.activeElement;
      if (!isEditable(el)) return;
      if (!readPrompt(el).trim()) return;
      e.preventDefault();
      e.stopPropagation();
      targetRef.current = el;
      setPopover({
        kind: e.key === 'ArrowUp' ? 'enhance' : e.key === 'ArrowDown' ? 'tone' : 'translate',
        rect: el.getBoundingClientRect(),
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!ready || !enabled) return null;

  const glowing = enhancing || externalGlow;

  return (
    <div className={`pf-theme-${theme}`} style={appearance.tokens} data-theme-controls="true" data-reduced-motion={appearance.reducedMotion}>
      {!appearance.reducedMotion && <PromptBarFX active={glowing} burstKey={burstKey} />}
      {!appearance.reducedMotion && <EnhanceCelebration burstKey={burstKey} />}
      <Toolbar
        onEnhance={onEnhance}
        onEnhanceTranslate={onEnhanceTranslate}
        enhancing={enhancing}
        status={status}
        health={health}
        onOpenPanel={openSidePanel}
        findInput={inputEl}
      />
      {popover && (
        <QuickActionPopover
          kind={popover.kind}
          theme={theme}
          anchorRect={popover.rect}
          busy={enhancing}
          onRun={onPopoverRun}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
