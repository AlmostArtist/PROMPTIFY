// Vision jobs: one image → AI analysis. Jobs are started from the right-click
// menu, the keyboard shortcut, or the Vision tab, run in the service worker,
// and are mirrored into chrome.storage.session so the side panel can render
// progress and results even if it opened after the job began.
import { str } from './json';

export type VisionMode = 'prompts' | 'dna' | 'image' | 'video' | 'ui-anim' | 'describe' | 'analyze' | 'remix';

export const VISION_MODES: { id: VisionMode; label: string; blurb: string }[] = [
  { id: 'prompts',  label: 'Perfect Prompt', blurb: 'Image + video + UI prompts' },
  { id: 'dna',      label: 'Prompt DNA',     blurb: 'Reverse-engineer the recipe' },
  { id: 'image',    label: 'Image Prompt',   blurb: 'Ready-to-paste image prompt' },
  { id: 'video',    label: 'Video Prompt',   blurb: 'Cinematic text-to-video shot' },
  { id: 'ui-anim',  label: 'UI Animation',   blurb: 'Motion & interaction spec' },
  { id: 'describe', label: 'Describe',       blurb: 'Plain-language description' },
  { id: 'analyze',  label: 'Analyze',        blurb: 'Design, quality & details' },
  { id: 'remix',    label: 'Edit / Remix',   blurb: '3 edit-ready variations' },
];

/** Modes whose output is a single plain-text prompt (not structured JSON). */
export const PLAIN_VISION_MODES = new Set<VisionMode>(['image', 'video', 'ui-anim', 'describe', 'analyze', 'remix']);

export interface VisionJob {
  id: string;
  mode: VisionMode;
  status: 'picking' | 'working' | 'done' | 'error';
  /** JPEG data URL (or a remote URL if the image couldn't be fetched). */
  image?: string;
  source?: { title?: string; url?: string };
  /** Raw model output (JSON text for prompts/dna, prose otherwise). */
  text?: string;
  model?: string;
  provider?: 'codex' | 'claude' | 'openrouter';
  error?: string;
  hint?: string;
  ts: number;
}

export const VISION_JOB_KEY = 'pf_vision_job';

export async function readVisionJob(): Promise<VisionJob | null> {
  try {
    return ((await chrome.storage.session.get(VISION_JOB_KEY))[VISION_JOB_KEY] as VisionJob) ?? null;
  } catch {
    return null;
  }
}

export async function writeVisionJob(job: VisionJob): Promise<void> {
  await chrome.storage.session.set({ [VISION_JOB_KEY]: job });
}

export function subscribeVisionJob(cb: (job: VisionJob | null) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'session' && changes[VISION_JOB_KEY]) cb((changes[VISION_JOB_KEY].newValue as VisionJob) ?? null);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ── "Perfect Prompt" result ─────────────────────────────────────────
export interface PerfectPrompts {
  type: string;
  summary: string;
  image: string;
  negative: string;
  video: string;
  ui: string;
}

export function parsePerfectPrompts(o: Record<string, unknown> | null): PerfectPrompts | null {
  if (!o) return null;
  const r: PerfectPrompts = {
    type: str(o.detected_type),
    summary: str(o.summary),
    image: str(o.image_prompt),
    negative: str(o.negative_prompt),
    video: str(o.video_prompt),
    ui: str(o.ui_prompt),
  };
  return r.image || r.video || r.ui ? r : null;
}

// ── Recent results (Vision tab "Recent" strip) ──────────────────────
export interface VisionHistoryItem {
  id: string;
  mode: VisionMode;
  ts: number;
  thumb: string;
  text: string;
  source?: { title?: string; url?: string };
}

const VISION_HISTORY_KEY = 'pf_vision_history';
const VISION_HISTORY_LIMIT = 12;

export async function loadVisionHistory(): Promise<VisionHistoryItem[]> {
  try {
    return ((await chrome.storage.local.get(VISION_HISTORY_KEY))[VISION_HISTORY_KEY] as VisionHistoryItem[]) ?? [];
  } catch {
    return [];
  }
}

export async function addVisionHistory(item: VisionHistoryItem): Promise<void> {
  const all = await loadVisionHistory();
  const next = [item, ...all.filter((x) => x.id !== item.id)].slice(0, VISION_HISTORY_LIMIT);
  await chrome.storage.local.set({ [VISION_HISTORY_KEY]: next });
}

export async function clearVisionHistory(): Promise<void> {
  await chrome.storage.local.set({ [VISION_HISTORY_KEY]: [] });
}
