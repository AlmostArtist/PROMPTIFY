import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { NEWS_SOURCES, NEWS_INTERVAL, NEWS_COOLDOWN, classifyNews, detectRelease, type NewsCache, type NewsCategory, type NewsStory } from './news-model';
export * from './news-model';
const list = <T>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
export function safeNewsURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return; url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); return url.href; } catch { return; }
}
export function plainNewsText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => { const code = n.startsWith('x') ? parseInt(n.slice(1), 16) : Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key] || '')).replace(/\s+/g, ' ').trim();
}
export function parseNewsFeed(xml: string, source: string, hint?: NewsCategory): NewsStory[] {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid publisher feed');
  const data = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(xml);
  if (!data.rss || !Object.prototype.hasOwnProperty.call(data.rss, 'channel')) throw new Error('Publisher did not return RSS');
  return list<Record<string, any>>(data.rss.channel?.item).flatMap(item => {
    const url = safeNewsURL(plainNewsText(item.link)), title = plainNewsText(item.title), publishedAt = Date.parse(item.pubDate);
    if (!url || !title || !Number.isFinite(publishedAt) || publishedAt > Date.now() + 86400000) return [];
    const summary = plainNewsText(item.description).slice(0, 280);
    const words = `${title} ${summary}`;
    const category = classifyNews(words, hint);
    const { release, model } = detectRelease(words);
    const image = list<Record<string, any>>(item['media:content']).find(i => typeof i === 'object' && i['@_url']) ?? item['media:thumbnail'] ?? item.enclosure;
    const thumbnail = safeNewsURL(image?.['@_url']);
    return [{ id: url, title, url, source, publishedAt, summary, category, ...(release ? { release } : {}), ...(model ? { model } : {}), ...(thumbnail ? { thumbnail } : {}) }];
  });
}
export function deduplicateNews(stories: NewsStory[]): NewsStory[] {
  const urls = new Set<string>(), titles = new Set<string>();
  return [...stories].sort((a, b) => b.publishedAt - a.publishedAt).filter(story => {
    const title = story.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (urls.has(story.url) || titles.has(title)) return false;
    urls.add(story.url); titles.add(title); return true;
  }).slice(0, 60);
}
export function newsNeedsRefresh(cache: NewsCache, force = false, now = Date.now()) {
  return now - cache.attemptedAt >= NEWS_COOLDOWN && (force || !cache.refreshedAt || now - cache.refreshedAt >= NEWS_INTERVAL);
}
export function createNewsService(deps: { load: () => Promise<NewsCache>; save: (value: NewsCache) => Promise<void>; fetch: typeof fetch; now?: () => number }) {
  let pending: Promise<NewsCache> | null = null;
  const now = deps.now ?? Date.now;
  return function refresh(force = false): Promise<NewsCache> {
    if (pending) return pending;
    pending = (async () => {
      const old = await deps.load();
      if (!newsNeedsRefresh(old, force, now())) return old;
      const attemptedAt = now();
      // Persist attempt before networking so worker restarts cannot bypass cooldown.
      await deps.save({ ...old, attemptedAt });
      const results = await Promise.allSettled(NEWS_SOURCES.map(async source => {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await deps.fetch(source.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Empty response');
          let size = 0, xml = ''; const decoder = new TextDecoder();
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('Feed too large'); } xml += decoder.decode(value, { stream: true }); }
          xml += decoder.decode(); return parseNewsFeed(xml, source.name, source.hint);
        } finally { clearTimeout(timer); }
      }));
      const failed = NEWS_SOURCES.filter((_, i) => results[i].status === 'rejected').map(s => s.name);
      const fresh = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const allFailed = failed.length === NEWS_SOURCES.length;
      const next: NewsCache = {
        stories: allFailed ? old.stories : deduplicateNews([...fresh, ...old.stories.filter(s => failed.includes(s.source))]),
        refreshedAt: allFailed ? old.refreshedAt : now(), attemptedAt,
        ...(failed.length ? { error: `Could not refresh ${failed.join(' and ')}. ${old.stories.length ? 'Showing available cached stories.' : 'Retry when your connection is available.'}` } : {}),
      };
      await deps.save(next); return next;
    })().finally(() => { pending = null; });
    return pending;
  };
}
