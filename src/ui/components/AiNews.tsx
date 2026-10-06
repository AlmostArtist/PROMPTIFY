import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_NEWS, NEWS_CATEGORIES, NEWS_INTERVAL, NEWS_KEY, NEWS_COOLDOWN, type NewsCache } from '@/lib/news-model';

export function AiNews() {
  const [cache, setCache] = useState<NewsCache>(EMPTY_NEWS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const running = useRef(false), mounted = useRef(true);
  const refresh = useCallback(async (force = false) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'news', force }) as NewsCache | undefined;
      if (!result || !Array.isArray(result.stories)) throw new Error('News service unavailable. Reload the extension and retry.');
      if (mounted.current) setCache(result);
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load news.'); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setNow(Date.now()); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let changed = false;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes[NEWS_KEY]?.newValue) { changed = true; setCache(changes[NEWS_KEY].newValue); } };
    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get(NEWS_KEY).then(data => { if (mounted.current && !changed && data[NEWS_KEY]) setCache(data[NEWS_KEY]); }).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(() => { setNow(Date.now()); }, 10000);
    const hourly = window.setInterval(() => { void refresh(); }, NEWS_INTERVAL);
    return () => { mounted.current = false; clearInterval(timer); clearInterval(hourly); chrome.storage.onChanged.removeListener(listener); };
  }, [refresh]);
  const stale = !!cache.refreshedAt && (now - cache.refreshedAt >= NEWS_INTERVAL || !!cache.error || !!error);
  const cooling = now - cache.attemptedAt < NEWS_COOLDOWN;
  const stories = cache.stories.filter(s => (category === 'All' || s.category === category) && `${s.title} ${s.source} ${s.summary}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="pk-news" aria-labelledby="news-title">
    <header className="pk-news-heading"><div><span className="tc-eyebrow">The daily briefing</span><h2 id="news-title">AI News</h2><p>Ideas, releases & research. Straight from the source.</p></div><button className="p-btn p-btn-ghost" disabled={busy || cooling} onClick={() => void refresh(true)} title={cooling ? 'Refresh available one minute after the last attempt' : 'Check publisher feeds'}>{busy ? 'Updating…' : 'Refresh'}</button></header>
    <div className="pk-news-status" role="status"><span>{stale ? 'Cached · ' : ''}{cache.refreshedAt ? `Updated ${new Date(cache.refreshedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Not yet refreshed'}</span><span>Hourly updates{cooling ? ' · refresh on cooldown' : ''}</span></div>
    {(error || cache.error) && <div className="pk-news-error" role="alert"><p>{error || cache.error}</p><button className="p-btn p-btn-ghost" disabled={busy || cooling} onClick={() => void refresh(true)}>Retry</button></div>}
    <input className="p-input" type="search" aria-label="Search AI news" placeholder="Search headlines or sources…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="pk-news-filters" role="group" aria-label="News topic">{['All', ...NEWS_CATEGORIES].map(topic => <button key={topic} aria-pressed={category === topic} onClick={() => setCategory(topic)}>{topic}</button>)}</div>
    {busy && !cache.stories.length && <div className="pk-news-loading" role="status">Checking publisher feeds…<div /><div /><div /></div>}
    {!busy && !stories.length && <div className="pk-news-empty"><h3>{cache.stories.length ? 'No matching stories' : 'Your briefing is on its way'}</h3><p>{cache.stories.length ? 'Try another topic or search.' : 'Refresh to check for published AI stories.'}</p></div>}
    <div className="pk-news-list">{stories.map(story => <article className={`pk-news-card${story.release ? ' pk-news-card-release' : ''}`} key={story.id}>
      {story.thumbnail && <img src={story.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; }} />}
      <div className="pk-news-meta"><span>{story.source}</span><span>{story.category}</span><time dateTime={new Date(story.publishedAt).toISOString()}>{new Date(story.publishedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
      {story.release && <span className="pk-news-badge">◆ {story.model ? `${story.model} release` : 'New model release'}</span>}
      <h3><a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}<span className="tc-sr-only"> (opens original article in a new tab)</span><span aria-hidden="true"> ↗</span></a></h3>
      {story.summary && <p>{story.summary}{story.summary.length === 280 ? '…' : ''}</p>}
    </article>)}</div>
    <footer className="pk-news-attribution">Publisher RSS · Hugging Face, Replicate, OpenAI, Google AI, TechCrunch & MIT News · Categories and model-release badges assigned from headline keywords. No generated news.</footer>
  </section>;
}
