import { DEFAULT_CONFIG, type CustomTool, type PromptConfig, type Role, type SavedPrompt } from '@/engine/types';
import { DEFAULT_PROMPTS, DEFAULTS_VERSION } from '@/data/defaultPrompts';
import {
  DEFAULT_OPENROUTER_MODEL,
  type EnhanceSubMode,
  type EnhancerStrength,
  type HistoryEntry,
  type NewHistoryEntry,
  type NewAnalysis,
  type PromptAnalysis,
} from './messages';

const CONFIG_KEY = 'pf_config';
const ENABLED_KEY = 'pf_enabled';
const ENHANCER_KEY = 'pf_enhancer_v1';
const STATS_KEY = 'pf_stats';
const OPENROUTER_KEY_KEY = 'pf_openrouter_key';
const OPENROUTER_MODEL_KEY = 'pf_openrouter_model';
const HISTORY_KEY = 'pf_history';
const AUTOSAVE_KEY = 'pf_autosave';
const CUSTOM_TOOLS_KEY = 'pf_custom_tools';
const CUSTOM_ROLES_KEY = 'pf_custom_roles';
const SAVED_PROMPTS_KEY = 'pf_saved_prompts';
const PROMPTS_VERSION_KEY = 'pf_prompts_version';
const HUMAN_TONE_KEY = 'pf_human_tone';
const THEME_KEY = 'pf_theme';
const COACH_KEY = 'pf_coach';
const ANALYSES_KEY = 'pf_analyses';
const SELECTION_RAIL_KEY = 'pf_selection_rail';

const HISTORY_LIMIT = 500;
const ANALYSES_LIMIT = 50;
const CUSTOM_TOOLS_LIMIT = 20;
const CUSTOM_ROLES_LIMIT = 40;
const SAVED_PROMPTS_LIMIT = 100;

export interface Stats {
  forged: number;
  lastForgedAt: number | null;
}

const DEFAULT_STATS: Stats = { forged: 0, lastForgedAt: null };

async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await chrome.storage.local.get(key);
    return (res[key] as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadConfig(): Promise<PromptConfig> {
  const stored = await get<Partial<PromptConfig>>(CONFIG_KEY, {});
  // Merge so new fields added in updates get sane defaults.
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function saveConfig(config: PromptConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

// ── Enhancer preferences (strength + default add-ons) ─────────────
export interface EnhancerPrefs { strength: EnhancerStrength; subModes: EnhanceSubMode[] }
export const DEFAULT_ENHANCER: EnhancerPrefs = { strength: 'balanced', subModes: [] };
const STRENGTHS: EnhancerStrength[] = ['concise', 'balanced', 'detailed', 'structured'];
const SUBMODES: EnhanceSubMode[] = ['formal', 'eli5', 'power', 'translate-en'];

function normalizeEnhancer(raw: unknown): EnhancerPrefs {
  const r = (raw ?? {}) as Partial<EnhancerPrefs>;
  const strength = STRENGTHS.includes(r.strength as EnhancerStrength) ? (r.strength as EnhancerStrength) : DEFAULT_ENHANCER.strength;
  const subModes = Array.isArray(r.subModes) ? r.subModes.filter((m): m is EnhanceSubMode => SUBMODES.includes(m as EnhanceSubMode)) : [];
  return { strength, subModes: [...new Set(subModes)] };
}

export async function loadEnhancer(): Promise<EnhancerPrefs> {
  return normalizeEnhancer(await get<unknown>(ENHANCER_KEY, DEFAULT_ENHANCER));
}

export async function saveEnhancer(prefs: EnhancerPrefs): Promise<void> {
  await chrome.storage.local.set({ [ENHANCER_KEY]: normalizeEnhancer(prefs) });
}

/** Subscribe to enhancer-pref changes across contexts (panel ⇄ in-page toolbar). */
export function subscribeEnhancer(cb: (prefs: EnhancerPrefs) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[ENHANCER_KEY]) cb(normalizeEnhancer(changes[ENHANCER_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadEnabled(): Promise<boolean> {
  return get<boolean>(ENABLED_KEY, true);
}

export async function saveEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
}

export async function loadStats(): Promise<Stats> {
  return get<Stats>(STATS_KEY, DEFAULT_STATS);
}

// ── OpenRouter (cloud AI) ─────────────────────────────────────────
// The user supplies their own OpenRouter API key; every AI feature runs
// through it. No key → the AI tools stay offline until one is saved.
export async function loadOpenRouterKey(): Promise<string> {
  return get<string>(OPENROUTER_KEY_KEY, '');
}

export async function saveOpenRouterKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [OPENROUTER_KEY_KEY]: key.trim() });
}

export async function loadOpenRouterModel(): Promise<string> {
  return get<string>(OPENROUTER_MODEL_KEY, DEFAULT_OPENROUTER_MODEL);
}

export async function saveOpenRouterModel(model: string): Promise<void> {
  const trimmed = model.trim();
  await chrome.storage.local.set({ [OPENROUTER_MODEL_KEY]: trimmed || DEFAULT_OPENROUTER_MODEL });
}

// ── Enhanced-prompt history ──────────────────────────────────────
export async function loadHistory(): Promise<HistoryEntry[]> {
  return get<HistoryEntry[]>(HISTORY_KEY, []);
}

export async function addHistoryEntry(entry: NewHistoryEntry): Promise<HistoryEntry[]> {
  const history = await loadHistory();
  const full: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
  };
  const next = [full, ...history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function loadAutoSave(): Promise<boolean> {
  return get<boolean>(AUTOSAVE_KEY, true);
}

export async function saveAutoSave(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [AUTOSAVE_KEY]: on });
}

export async function bumpForged(): Promise<Stats> {
  const stats = await loadStats();
  const next: Stats = { forged: stats.forged + 1, lastForgedAt: Date.now() };
  await chrome.storage.local.set({ [STATS_KEY]: next });
  return next;
}

type ChangeHandler = (changes: { enabled?: boolean; config?: PromptConfig }) => void;

/** Subscribe to cross-context changes (e.g. popup toggles enabled, content reacts). */
export function onStorageChanged(handler: ChangeHandler): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local') return;
    const payload: { enabled?: boolean; config?: PromptConfig } = {};
    if (changes[ENABLED_KEY]) payload.enabled = changes[ENABLED_KEY].newValue as boolean;
    if (changes[CONFIG_KEY]) payload.config = changes[CONFIG_KEY].newValue as PromptConfig;
    if ('enabled' in payload || 'config' in payload) handler(payload);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ── Custom tools ──────────────────────────────────────────────────
export async function loadCustomTools(): Promise<CustomTool[]> {
  return get<CustomTool[]>(CUSTOM_TOOLS_KEY, []);
}

export async function saveCustomTools(tools: CustomTool[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_TOOLS_KEY]: tools });
}

export async function addCustomTool(tool: CustomTool): Promise<CustomTool[]> {
  const tools = await loadCustomTools();
  const next = [...tools, tool].slice(0, CUSTOM_TOOLS_LIMIT);
  await saveCustomTools(next);
  return next;
}

export async function removeCustomTool(id: string): Promise<CustomTool[]> {
  const tools = await loadCustomTools();
  const next = tools.filter((t) => t.id !== id);
  await saveCustomTools(next);
  return next;
}

// ── Custom roles (AI-created) ─────────────────────────────────────
export async function loadCustomRoles(): Promise<Role[]> {
  return get<Role[]>(CUSTOM_ROLES_KEY, []);
}

export async function saveCustomRoles(roles: Role[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_ROLES_KEY]: roles });
}

export async function addCustomRole(role: Role): Promise<Role[]> {
  const roles = await loadCustomRoles();
  const next = [role, ...roles.filter((r) => r.id !== role.id)].slice(0, CUSTOM_ROLES_LIMIT);
  await saveCustomRoles(next);
  return next;
}

export async function removeCustomRole(id: string): Promise<Role[]> {
  const roles = await loadCustomRoles();
  const next = roles.filter((r) => r.id !== id);
  await saveCustomRoles(next);
  return next;
}

// ── Saved prompts (// mention) ──────────────────────────────────────
export async function loadSavedPrompts(): Promise<SavedPrompt[]> {
  return get<SavedPrompt[]>(SAVED_PROMPTS_KEY, []);
}

export async function saveSavedPrompts(prompts: SavedPrompt[]): Promise<void> {
  await chrome.storage.local.set({ [SAVED_PROMPTS_KEY]: prompts });
}

export async function addSavedPrompt(prompt: SavedPrompt): Promise<SavedPrompt[]> {
  const all = await loadSavedPrompts();
  const next = [prompt, ...all].slice(0, SAVED_PROMPTS_LIMIT);
  await saveSavedPrompts(next);
  return next;
}

export async function removeSavedPrompt(id: string): Promise<SavedPrompt[]> {
  const all = await loadSavedPrompts();
  const next = all.filter((p) => p.id !== id);
  await saveSavedPrompts(next);
  return next;
}

export async function updateSavedPrompt(id: string, patch: Partial<Pick<SavedPrompt, 'label' | 'content'>>): Promise<SavedPrompt[]> {
  const all = await loadSavedPrompts();
  const next = all.map((p) => (p.id === id ? { ...p, ...patch } : p));
  await saveSavedPrompts(next);
  return next;
}

/**
 * Seed (and upgrade) the starter prompts. Runs once per DEFAULTS_VERSION bump:
 * upserts the default-* prompts to the latest content, preserves user-created
 * prompts, and keeps the defaults at the top. Returns the current prompt list.
 */
export async function ensureDefaultPrompts(): Promise<SavedPrompt[]> {
  const existing = await loadSavedPrompts();
  const version = await get<number>(PROMPTS_VERSION_KEY, 0);
  if (version >= DEFAULTS_VERSION) return existing;

  const now = Date.now();
  const prevById = new Map(existing.map((p) => [p.id, p]));
  const defaults: SavedPrompt[] = DEFAULT_PROMPTS.map((d, i) => ({ ...d, ts: prevById.get(d.id)?.ts ?? now - i }));
  const defaultIds = new Set(DEFAULT_PROMPTS.map((d) => d.id));
  const userPrompts = existing.filter((p) => !defaultIds.has(p.id));

  const next = [...defaults, ...userPrompts].slice(0, SAVED_PROMPTS_LIMIT);
  await saveSavedPrompts(next);
  await chrome.storage.local.set({ [PROMPTS_VERSION_KEY]: DEFAULTS_VERSION });
  return next;
}

// ── Human-tone toggle (prepends the human-voice prompt) ─────────────
export async function loadHumanTone(): Promise<boolean> {
  return get<boolean>(HUMAN_TONE_KEY, false);
}

export async function saveHumanTone(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [HUMAN_TONE_KEY]: on });
}

// ── Theme preference ─────────────────────────────────────────────
export async function loadTheme(): Promise<'dark' | 'light'> {
  return get<'dark' | 'light'>(THEME_KEY, 'dark');
}

export async function saveTheme(theme: 'dark' | 'light'): Promise<void> {
  await chrome.storage.local.set({ [THEME_KEY]: theme });
}

// ── Selection rail (text-selection actions on any webpage) ───────
export async function loadSelectionRail(): Promise<boolean> {
  return get<boolean>(SELECTION_RAIL_KEY, true);
}

export async function saveSelectionRail(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [SELECTION_RAIL_KEY]: on });
}

// ── Prompt Coach (analysis on enhance) ───────────────────────────
export async function loadCoach(): Promise<boolean> {
  return get<boolean>(COACH_KEY, true);
}

export async function saveCoach(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [COACH_KEY]: on });
}

export async function loadAnalyses(): Promise<PromptAnalysis[]> {
  return get<PromptAnalysis[]>(ANALYSES_KEY, []);
}

export async function addAnalysis(entry: NewAnalysis): Promise<PromptAnalysis[]> {
  const all = await loadAnalyses();
  const full: PromptAnalysis = {
    ...entry,
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
  };
  const next = [full, ...all].slice(0, ANALYSES_LIMIT);
  await chrome.storage.local.set({ [ANALYSES_KEY]: next });
  return next;
}

export async function clearAnalyses(): Promise<void> {
  await chrome.storage.local.set({ [ANALYSES_KEY]: [] });
}

/** Subscribe to analysis-list changes across contexts (content script ⇄ panel). */
export function subscribeAnalyses(cb: (list: PromptAnalysis[]) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[ANALYSES_KEY]) {
      cb((changes[ANALYSES_KEY].newValue as PromptAnalysis[]) ?? []);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
