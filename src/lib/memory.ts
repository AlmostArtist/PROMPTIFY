// Personal memory — an opt-in, local-only index of pages the user has read.
// Chrome's history only knows titles + URLs; memory adds each page's
// description and a short excerpt so "that AI video tool I saw last week" can
// match pages whose title never says "AI video". Nothing leaves the browser
// except the few snippets sent to the model when the user asks a question.

export interface MemoryPage {
  url: string;
  title: string;
  host: string;
  /** meta / og description. */
  desc: string;
  /** Headings + opening text, trimmed. */
  excerpt: string;
  /** First and last time seen. */
  first: number;
  ts: number;
  visits: number;
}

export type NewMemoryPage = Omit<MemoryPage, 'first' | 'ts' | 'visits'>;

export const MEMORY_KEY = 'pf_memory';
export const MEMORY_ON_KEY = 'pf_memory_on';
const MEMORY_LIMIT = 2500;

export async function loadMemoryOn(): Promise<boolean> {
  try {
    return ((await chrome.storage.local.get(MEMORY_ON_KEY))[MEMORY_ON_KEY] as boolean) === true;
  } catch {
    return false;
  }
}

export async function saveMemoryOn(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [MEMORY_ON_KEY]: on });
}

export async function loadMemory(): Promise<MemoryPage[]> {
  try {
    return ((await chrome.storage.local.get(MEMORY_KEY))[MEMORY_KEY] as MemoryPage[]) ?? [];
  } catch {
    return [];
  }
}

export async function clearMemory(): Promise<void> {
  await chrome.storage.local.set({ [MEMORY_KEY]: [] });
}

/** Normalise a URL for de-duplication (drop the hash and tracking params). */
export function memoryKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|si$|feature$)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Serialise writes — several tabs can report pages at the same moment.
let queue: Promise<unknown> = Promise.resolve();

export function recordMemoryPage(page: NewMemoryPage): Promise<void> {
  const run = async () => {
    const all = await loadMemory();
    const key = memoryKey(page.url);
    const now = Date.now();
    const i = all.findIndex((p) => p.url === key);
    if (i !== -1) {
      const prev = all[i];
      all.splice(i, 1);
      all.unshift({
        ...prev,
        title: page.title || prev.title,
        desc: page.desc || prev.desc,
        excerpt: page.excerpt.length > prev.excerpt.length ? page.excerpt : prev.excerpt,
        // Count a revisit at most once per 30 minutes.
        visits: now - prev.ts > 30 * 60 * 1000 ? prev.visits + 1 : prev.visits,
        ts: now,
      });
    } else {
      all.unshift({ ...page, url: key, first: now, ts: now, visits: 1 });
    }
    await chrome.storage.local.set({ [MEMORY_KEY]: all.slice(0, MEMORY_LIMIT) });
  };
  queue = queue.then(run, run);
  return queue as Promise<void>;
}
