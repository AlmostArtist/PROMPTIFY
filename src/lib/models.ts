// Live catalog of OpenRouter's free models. Free model ids churn constantly —
// a hardcoded fallback list goes stale within weeks — so the service worker
// asks OpenRouter which `:free` models exist right now (no key needed) and
// caches the answer. Vision-capable models are flagged for the image features.
import { OPENROUTER_BASE_URL } from './messages';

export interface CatalogModel {
  id: string;
  name: string;
  vision: boolean;
  context: number;
}

const CACHE_KEY = 'pf_model_catalog';
const CACHE_TTL = 6 * 60 * 60 * 1000;

/**
 * Preferred order when falling back. Anything not listed still gets used,
 * just after these. Ids that disappear from the catalog are skipped.
 */
const PREFERRED = [
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'thinkingmachines/inkling:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];

/** Used only if the catalog can't be fetched at all. */
const OFFLINE_TEXT = ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'nvidia/nemotron-3-super-120b-a12b:free'];
const OFFLINE_VISION = ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'google/gemma-4-26b-a4b-it:free'];

/** Classifiers / guard models answer "safe/unsafe", not prompts — never route to them. */
const NOT_A_CHAT_MODEL = /safety|guard|moderation|embed|rerank/i;

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
}

export async function getFreeModels(force = false): Promise<CatalogModel[]> {
  if (!force) {
    try {
      const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as
        | { ts: number; models: CatalogModel[] }
        | undefined;
      if (cached && Date.now() - cached.ts < CACHE_TTL && cached.models.length) return cached.models;
    } catch {
      /* fall through to a fresh fetch */
    }
  }
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = ((await res.json()) as { data?: RawModel[] }).data ?? [];
    const models: CatalogModel[] = data
      .filter((m) => m.id.endsWith(':free') && !NOT_A_CHAT_MODEL.test(m.id))
      .map((m) => ({
        id: m.id,
        name: (m.name ?? m.id).replace(/\s*\(free\)\s*$/i, ''),
        vision: Boolean(m.architecture?.input_modalities?.includes('image')),
        context: m.context_length ?? 0,
      }));
    models.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
    if (models.length) await chrome.storage.local.set({ [CACHE_KEY]: { ts: Date.now(), models } });
    return models;
  } catch {
    return [];
  }
}

function rank(id: string): number {
  const i = PREFERRED.indexOf(id);
  return i === -1 ? PREFERRED.length : i;
}

/** Ordered list of models to try: the user's pick first, then live fallbacks. */
export async function candidateModels(userModel: string, needVision: boolean): Promise<string[]> {
  const catalog = await getFreeModels();
  let pool: string[];
  if (catalog.length) {
    pool = catalog.filter((m) => !needVision || m.vision).map((m) => m.id);
  } else {
    pool = needVision ? OFFLINE_VISION : OFFLINE_TEXT;
  }
  // A paid / custom model id isn't in the free catalog — still honour it, but
  // for images only when we can't tell (it may well support vision).
  const userIsKnownTextOnly = catalog.some((m) => m.id === userModel && !m.vision);
  const head = needVision && userIsKnownTextOnly ? [] : [userModel];
  // Cap the chain so a dead network doesn't take minutes to give up.
  return [...new Set([...head, ...pool])].filter(Boolean).slice(0, 5);
}
