// Recall — "What was that AI video tool I saw last week?"
// Gathers candidates from three local sources (opt-in page memory, Chrome
// history, and the user's own prompt history), ranks them with the planner's
// expanded keywords, then lets the model answer or build a timeline using
// ONLY those numbered items. Ranking happens locally; only the top ~60
// snippets ever reach the model.
import { requestAi } from './messages';
import { loadHistory } from './storage';
import { loadMemory, memoryKey } from './memory';
import { hasPermission } from './permissions';
import { numList, parseJsonLoose, str } from './json';

export interface RecallItem {
  n: number;
  url: string;
  title: string;
  host: string;
  ts: number;
  snippet: string;
  source: 'memory' | 'history' | 'prompt';
  visits: number;
  score: number;
}

const DAY = 24 * 60 * 60 * 1000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Split keywords into lowercase search terms (phrases + their words). */
function toTerms(keywords: string[]): string[] {
  const terms = new Set<string>();
  for (const k of keywords) {
    const t = k.toLowerCase().trim();
    if (t.length < 2) continue;
    terms.add(t);
    for (const w of t.split(/[\s/._-]+/)) if (w.length > 2) terms.add(w);
  }
  return [...terms];
}

export async function gatherRecall(keywords: string[], daysBack: number, limit = 60): Promise<RecallItem[]> {
  const since = Date.now() - Math.max(1, Math.min(daysBack || 30, 365)) * DAY;
  const byUrl = new Map<string, Omit<RecallItem, 'n' | 'score'>>();

  // 1. Page memory (richest: has description + excerpt).
  for (const p of await loadMemory()) {
    if (p.ts < since) continue;
    byUrl.set(p.url, {
      url: p.url, title: p.title, host: p.host, ts: p.ts, visits: p.visits, source: 'memory',
      snippet: [p.desc, p.excerpt].filter(Boolean).join(' — '),
    });
  }

  // 2. Chrome history (only if the user granted it).
  if (await hasPermission('history')) {
    const seen = new Set<string>();
    const batches = await Promise.all([
      chrome.history.search({ text: '', startTime: since, maxResults: 5000 }),
      ...keywords.slice(0, 6).map((k) => chrome.history.search({ text: k, startTime: since, maxResults: 300 })),
    ]);
    for (const h of batches.flat()) {
      if (!h.url || seen.has(h.url) || !/^https?:/i.test(h.url)) continue;
      seen.add(h.url);
      const key = memoryKey(h.url);
      const prev = byUrl.get(key);
      if (prev) {
        prev.visits = Math.max(prev.visits, h.visitCount ?? 1);
        prev.ts = Math.max(prev.ts, h.lastVisitTime ?? 0);
      } else {
        byUrl.set(key, {
          url: h.url, title: h.title || h.url, host: hostOf(h.url), ts: h.lastVisitTime ?? since,
          visits: h.visitCount ?? 1, source: 'history', snippet: '',
        });
      }
    }
  }

  // 3. Prompts the user enhanced — their "saved AI context".
  for (const e of await loadHistory()) {
    if (e.ts < since) continue;
    byUrl.set(`prompt:${e.id}`, {
      url: '', title: `Prompt on ${e.site}: ${e.original.slice(0, 80)}`, host: e.site, ts: e.ts, visits: 1,
      source: 'prompt', snippet: e.enhanced.slice(0, 300),
    });
  }

  const terms = toTerms(keywords);
  const span = Date.now() - since;
  const scored: RecallItem[] = [];
  for (const it of byUrl.values()) {
    const title = it.title.toLowerCase();
    const where = `${it.host} ${it.url}`.toLowerCase();
    const body = it.snippet.toLowerCase();
    let hits = 0;
    for (const t of terms) {
      if (title.includes(t)) hits += 3;
      else if (where.includes(t)) hits += 2;
      else if (body.includes(t)) hits += 1;
    }
    if (terms.length && hits === 0) continue;
    const recency = Math.max(0, 1 - (Date.now() - it.ts) / span);
    scored.push({ ...it, n: 0, score: hits + Math.min(it.visits, 10) * 0.1 + recency * 0.5 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((it, i) => ({ ...it, n: i + 1 }));
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function itemsBlock(items: RecallItem[]): string {
  return items
    .map((it) => {
      const snip = it.snippet ? ` — ${it.snippet.replace(/\s+/g, ' ').slice(0, 220)}` : '';
      return `[${it.n}] ${fmtDate(it.ts)} · ${it.title.slice(0, 120)} · ${it.host}${snip}`;
    })
    .join('\n');
}

export interface RecallAnswer {
  answer: string;
  sources: RecallItem[];
}

export async function recallAnswer(question: string, items: RecallItem[]): Promise<RecallAnswer | { error: string }> {
  const res = await requestAi('recall-answer', `QUESTION: ${question}\n\nITEMS:\n${itemsBlock(items)}`);
  if (!res.ok || !res.text) return { error: res.error || 'Recall failed.' };
  const o = parseJsonLoose(res.text);
  const answer = str(o?.answer) || res.text.trim();
  const byN = new Map(items.map((it) => [it.n, it]));
  const sources = numList(o?.sources).map((n) => byN.get(n)).filter((x): x is RecallItem => Boolean(x));
  return { answer, sources: sources.length ? sources : items.slice(0, 4) };
}

export interface TimelineEvent {
  date: string;
  title: string;
  note: string;
  items: RecallItem[];
}

export interface Timeline {
  summary: string;
  events: TimelineEvent[];
}

export async function recallTimeline(topic: string, items: RecallItem[]): Promise<Timeline | { error: string }> {
  // Feed the model chronologically so the timeline reads naturally.
  const chrono = [...items].sort((a, b) => a.ts - b.ts);
  const res = await requestAi('recall-timeline', `TOPIC: ${topic}\n\nITEMS:\n${itemsBlock(chrono)}`);
  if (!res.ok || !res.text) return { error: res.error || 'Timeline failed.' };
  const o = parseJsonLoose<{ summary?: unknown; events?: unknown }>(res.text);
  const byN = new Map(items.map((it) => [it.n, it]));
  const events: TimelineEvent[] = Array.isArray(o?.events)
    ? (o.events as Record<string, unknown>[])
        .map((e) => ({
          date: str(e.date),
          title: str(e.title),
          note: str(e.note),
          items: numList(e.items).map((n) => byN.get(n)).filter((x): x is RecallItem => Boolean(x)),
        }))
        .filter((e) => e.title || e.items.length)
    : [];
  if (!events.length) {
    // Model didn't return usable JSON — fall back to a plain day-grouped list.
    const byDay = new Map<string, RecallItem[]>();
    for (const it of chrono) {
      const d = fmtDate(it.ts);
      byDay.set(d, [...(byDay.get(d) ?? []), it]);
    }
    return {
      summary: str(o?.summary),
      events: [...byDay].map(([date, list]) => ({ date, title: `${list.length} page${list.length === 1 ? '' : 's'}`, note: '', items: list })),
    };
  }
  return { summary: str(o?.summary), events };
}
