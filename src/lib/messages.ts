// Typed bridge between the UI (content script / popup) and the background
// service worker. The SW is the only context with host permission for
// openrouter.ai, so all AI calls are proxied through it — this avoids the host
// page's CSP rules and keeps the API key out of page contexts.

import type { NewMemoryPage } from './memory';
import type { CatalogModel } from './models';
import type { VisionJob, VisionMode } from './vision';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Selectable models, shown to the user under PROMPTIFY's own branding. */
export interface ModelPreset {
  /** The real OpenRouter model id sent to the API. */
  id: string;
  /** The branded name shown in the UI. */
  label: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: 'google/gemma-4-31b-it:free',                           label: 'K2Xai Pro' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',   label: 'K2Xai MAX' },
];

export const DEFAULT_OPENROUTER_MODEL = MODEL_PRESETS[0].id;

/** Map an OpenRouter model id to its branded label (falls back to the id). */
export function modelLabel(id: string | undefined): string {
  if (!id) return 'ready';
  return MODEL_PRESETS.find((m) => m.id === id)?.label ?? id;
}

export type AiTask =
  // Content Studio (Analyze tab)
  | 'content-summarize'
  | 'content-key-points'
  | 'content-critique'
  | 'content-explain'
  | 'content-expand'
  | 'content-simplify'
  | 'content-translate'
  | 'content-variations'
  // Quick tools
  | 'enhance'
  // Prompt Enhancer popover variants (Cmd/Ctrl+↑)
  | 'enhance-concise'
  | 'enhance-detailed'
  | 'enhance-structured'
  | 'enhance-translate'
  // Tone Shifter popover (Cmd/Ctrl+↓)
  | 'tone-professional'
  | 'tone-friendly'
  | 'tone-assertive'
  | 'tone-diplomatic'
  | 'tone-casual'
  | 'tone-technical'
  // Translation & English popover (Cmd/Ctrl+→)
  | 'fix-english-grammar'
  | 'improve'
  | 'prompt-coach'
  // Selection rail (any webpage)
  | 'ai-search'
  | 'humanize'
  | 'translate-english'
  | 'code-review'
  | 'debug'
  | 'image-prompt'
  | 'seo-optimize'
  | 'shorten'
  | 'brainstorm'
  | 'professional'
  | 'stepify'
  | 'expand'
  | 'variations'
  | 'outline'
  | 'critique'
  | 'summarize'
  | 'analyze'
  | 'action-items'
  | 'tldr'
  | 'key-topics'
  | 'create-role'
  // Universal right-click (text / code / product)
  | 'explain-text'
  | 'fact-check'
  | 'code-explain'
  | 'code-optimize'
  | 'code-convert'
  | 'code-document'
  | 'code-tests'
  | 'product-compare'
  | 'product-reviews'
  | 'product-alternatives'
  // Vision (image input)
  | 'vision-prompts'
  | 'prompt-dna'
  | 'vision-image-prompt'
  | 'vision-video-prompt'
  | 'vision-ui-animation'
  | 'image-describe'
  | 'image-analyze'
  | 'image-remix'
  // Browser Brain (Ask tab)
  | 'agent-plan'
  | 'recall-answer'
  | 'recall-timeline'
  | 'tabs-summarize'
  | 'tabs-compare'
  | 'custom';

/**
 * Optional sub-mode chips that layer extra requirements onto the Prompt
 * Enhancer variants (combinable). Their detailed instructions live in
 * `aiTasks.ts` (`ENHANCE_SUBMODES`) so all prompt copy stays backend-side.
 */
export type EnhanceSubMode = 'formal' | 'eli5' | 'power' | 'translate-en';

/** How aggressively the toolbar Enhance button rewrites a prompt. */
export type EnhancerStrength = 'concise' | 'balanced' | 'detailed' | 'structured';

/** Maps the chosen Enhancer strength to the actual rewrite task. */
export const ENHANCER_TASK: Record<EnhancerStrength, AiTask> = {
  concise: 'enhance-concise',
  balanced: 'enhance',
  detailed: 'enhance-detailed',
  structured: 'enhance-structured',
};

export const ENHANCER_STRENGTHS: { id: EnhancerStrength; label: string; blurb: string }[] = [
  { id: 'concise',    label: 'Concise',    blurb: 'A tight, high-signal prompt — a few sharp sentences.' },
  { id: 'balanced',   label: 'Balanced',   blurb: 'Expert role, numbered requirements, output format. The default.' },
  { id: 'detailed',   label: 'Detailed',   blurb: 'Thorough — adds context, edge cases and a quality bar.' },
  { id: 'structured', label: 'Structured', blurb: 'Labelled sections: Role · Context · Task · Requirements · Output.' },
];

export interface HistoryEntry {
  id: string;
  ts: number;
  site: string;
  tool: string;
  original: string;
  enhanced: string;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'ts'>;

/** A Prompt Coach analysis of one enhance (original vs enhanced), for learning. */
export interface PromptAnalysis {
  id: string;
  ts: number;
  site: string;
  original: string;
  enhanced: string;
  /** Quality score of the ORIGINAL prompt, 0–100. */
  score: number;
  /** One-line overall verdict on the original. */
  verdict: string;
  /** Specific weaknesses in the original prompt. */
  mistakes: string[];
  /** What the enhanced version added or fixed. */
  improvements: string[];
  /** Reusable prompt-engineering lessons. */
  tips: string[];
}

export type NewAnalysis = Omit<PromptAnalysis, 'id' | 'ts'>;

export type BgRequest =
  | { type: 'cliConnection'; action: 'status' | 'login' | 'logout' | 'telemetry'; provider?: 'codex' | 'claude' }
  | { type: 'health' }
  | { type: 'news'; force?: boolean }
  | { type: 'ai'; task: AiTask; prompt: string; customInstruction?: string; subModes?: EnhanceSubMode[] }
  | { type: 'openSidePanel'; page?: 'settings' | 'connections' | 'home' | 'ask' | 'news' }
  | { type: 'recordHistory'; entry: NewHistoryEntry }
  | { type: 'exportHistory' }
  | { type: 'getSavedPrompts' }
  | { type: 'savePrompt'; label: string; content: string }
  // Vision: analyse an image (data URL or http URL) — result mirrored to the session job.
  | { type: 'vision'; mode: VisionMode; image: string; source?: { title?: string; url?: string } }
  // Vision: drag-select a region on the active tab, capture it, then analyse.
  | { type: 'captureForVision'; mode: VisionMode }
  // AI Hub: open one or more assistants with the prompt typed in.
  | { type: 'sendToAi'; hubIds: string[]; text: string; autoSend: boolean }
  // Content script on an AI site asks whether a handoff is waiting for its tab.
  | { type: 'claimHandoff' }
  | { type: 'memoryRecord'; page: NewMemoryPage }
  | { type: 'listModels'; force?: boolean }
  // Quick tool usage rings: % of each signed-in CLI account's limits (no identity data).
  | { type: 'usageSnapshot'; force?: boolean }
  | { type: 'panelState' }
  | { type: 'quickCapture' }
  // Selection rail tells the SW what was right-clicked so the menu can adapt.
  | { type: 'menuContext'; code: boolean; product: boolean };

export interface Handoff {
  text: string;
  autoSend: boolean;
}

export interface CaptureResult {
  ok: boolean;
  error?: string;
  /** Capturing from the panel needs the all-sites permission (Browser Brain). */
  needsPermission?: boolean;
}

/** Start a vision job; resolves with the finished job (also mirrored to storage). */
export async function requestVision(
  mode: VisionMode,
  image: string,
  source?: { title?: string; url?: string },
): Promise<VisionJob | null> {
  try {
    return (await chrome.runtime.sendMessage({ type: 'vision', mode, image, source } satisfies BgRequest)) as VisionJob;
  } catch {
    return null;
  }
}

export async function requestCapture(mode: VisionMode): Promise<CaptureResult> {
  try {
    return (await chrome.runtime.sendMessage({ type: 'captureForVision', mode } satisfies BgRequest)) as CaptureResult;
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function sendToAi(hubIds: string[], text: string, autoSend: boolean): Promise<boolean> {
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'sendToAi', hubIds, text, autoSend } satisfies BgRequest)) as {
      ok?: boolean;
    };
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

export async function listModels(force = false): Promise<CatalogModel[]> {
  try {
    return ((await chrome.runtime.sendMessage({ type: 'listModels', force } satisfies BgRequest)) as CatalogModel[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Save a selection as a reusable prompt (used by the selection rail on any page).
 * Proxied through the background worker so it works from every content script.
 */
export async function savePromptViaMessage(label: string, content: string): Promise<boolean> {
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'savePrompt', label, content } satisfies BgRequest)) as {
      ok?: boolean;
    };
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

/** Save an enhanced prompt to history (and auto-export the .md if enabled). */
export function recordHistory(entry: NewHistoryEntry): void {
  void chrome.runtime.sendMessage({ type: 'recordHistory', entry } satisfies BgRequest).catch(() => undefined);
}

/** Write the full history to a single Markdown file in Downloads. */
export function exportHistory(): void {
  void chrome.runtime.sendMessage({ type: 'exportHistory' } satisfies BgRequest).catch(() => undefined);
}

/** Fetch saved prompts from storage (used by the content script for // autocomplete). */
export async function getSavedPromptsViaMessage(): Promise<import('@/engine/types').SavedPrompt[]> {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'getSavedPrompts' } satisfies BgRequest);
    return (r as import('@/engine/types').SavedPrompt[]) ?? [];
  } catch {
    return [];
  }
}

/** Ask the background worker to open the side panel for the current tab. */
export function openSidePanel(): void {
  void chrome.runtime.sendMessage({ type: 'openSidePanel' } satisfies BgRequest).catch(() => undefined);
}

/**
 * Read the visible text of the active tab by injecting a tiny script into it.
 * Requires the `scripting` + `activeTab` permissions; returns null if the page can't be read.
 */
export async function grabActiveTabText(maxChars = 14000): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim(),
    });
    const text = (injection?.result as string | undefined) ?? '';
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

export interface HealthResult {
  ok: boolean;
  provider?: string;
  model?: string;
  models?: string[];
  error?: string;
  hint?: string;
}

export interface AiResult {
  ok: boolean;
  task?: AiTask;
  model?: string;
  text?: string;
  error?: string;
  hint?: string;
}

export async function requestHealth(): Promise<HealthResult> {
  try {
    return (await chrome.runtime.sendMessage({ type: 'health' } satisfies BgRequest)) as HealthResult;
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function requestAi(
  task: AiTask,
  prompt: string,
  customInstruction?: string,
  subModes?: EnhanceSubMode[],
): Promise<AiResult> {
  try {
    return (await chrome.runtime.sendMessage({ type: 'ai', task, prompt, customInstruction, subModes } satisfies BgRequest)) as AiResult;
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg || 'Could not reach the extension background worker.';
}

// ── Side panel ⇄ active tab's content script ─────────────────────
export type TabCommand =
  | { type: 'pf-getPrompt' }
  | { type: 'pf-setPrompt'; text: string }
  | { type: 'pf-glow'; on: boolean }
  | { type: 'pf-burst' }
  | { type: 'pf-getSession' }
  // Right-click menu → run an AI task on the selection and show the in-page popover.
  | {
      type: 'pf-runAi';
      task: AiTask;
      title: string;
      text: string;
      /** Use the page's own text (e.g. "Summarize this page", product reviews). */
      usePageText?: boolean;
      /** Prefix the text with the page's product name (product actions). */
      product?: boolean;
      /** Extra link buttons shown under the result. */
      links?: { label: string; url: string }[];
    };

export interface SessionData {
  text: string;
  count: number;
  site: string;
}

/** Scrape the current chat conversation from the active tab (best-effort). */
export async function tabGetSession(tabId: number): Promise<SessionData | null> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, { type: 'pf-getSession' } satisfies TabCommand)) as SessionData;
    return r ?? null;
  } catch {
    return null;
  }
}

/** Toggle the in-page progress border on the active tab (best-effort). */
export async function tabSetGlow(tabId: number, on: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'pf-glow', on } satisfies TabCommand);
  } catch {
    /* tab has no content script — ignore */
  }
}

/** Fire the completion sparkle burst on the active tab (best-effort). */
export async function tabBurst(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'pf-burst' } satisfies TabCommand);
  } catch {
    /* tab has no content script — ignore */
  }
}

export async function tabGetPrompt(tabId: number): Promise<string | null> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, { type: 'pf-getPrompt' } satisfies TabCommand)) as {
      text: string | null;
    };
    return r?.text ?? null;
  } catch {
    return null;
  }
}

export async function tabSetPrompt(tabId: number, text: string): Promise<boolean> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, { type: 'pf-setPrompt', text } satisfies TabCommand)) as {
      ok: boolean;
    };
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

// ── Usage rings (quick tool) ─────────────────────────────────────
export interface UsageRing {
  provider: 'codex' | 'claude';
  /** % of the shortest reported window (usually 5-hour) already used. */
  used: number;
  label: string;
  resetsAt: number | null;
  /** % of the weekly window used, when reported. */
  weekly?: number;
}
export interface UsageSnapshot {
  ts: number;
  rings: UsageRing[];
  /** Which provider answers requests right now. */
  active?: 'openrouter' | 'codex' | 'claude';
}

export async function requestUsageSnapshot(force = false): Promise<UsageSnapshot | null> {
  try {
    return ((await chrome.runtime.sendMessage({ type: 'usageSnapshot', force } satisfies BgRequest)) as UsageSnapshot) ?? null;
  } catch {
    return null;
  }
}
