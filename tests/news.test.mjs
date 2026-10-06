import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2021}}).outputText;
const url = js => 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
const model = url(compile('../src/lib/news-model.ts'));
const {NEWS_SOURCES}=await import(model);
const source = compile('../src/lib/news.ts').replaceAll("'./news-model'",JSON.stringify(model)).replaceAll("'fast-xml-parser'",JSON.stringify(import.meta.resolve('fast-xml-parser')));
const {parseNewsFeed,deduplicateNews,safeNewsURL,createNewsService,EMPTY_NEWS,NEWS_INTERVAL,NEWS_COOLDOWN,newsNeedsRefresh}=await import(url(source));
const rss = (title='AI research update',link='https://example.com/story?utm_source=rss') => `<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>A research report.</p><script>bad()</script>]]></description><media:content url="https://example.com/image.jpg" /></item></channel></rss>`;
test('RSS parsing strips markup, rejects unsafe URLs and deduplicates titles/URLs',()=>{
 const rows=parseNewsFeed(rss(),'Publisher');assert.equal(rows.length,1);assert.equal(rows[0].summary,'A research report.');assert.equal(rows[0].url,'https://example.com/story');assert.equal(rows[0].category,'Research');assert.equal(rows[0].thumbnail,'https://example.com/image.jpg');
 assert.equal(safeNewsURL('javascript:alert(1)'),undefined);assert.equal(parseNewsFeed(rss('Title','javascript:alert(1)'),'Publisher').length,0);
 assert.equal(deduplicateNews([...rows,...rows]).length,1);
 assert.throws(()=>parseNewsFeed('<!DOCTYPE rss><rss/>','Source'));assert.throws(()=>parseNewsFeed('<html/>','Source'));
});
test('news cache enforces hourly automatic refresh and manual cooldown',()=>{
 const now=Date.now(),cache={...EMPTY_NEWS,attemptedAt:now,refreshedAt:now};
 assert.equal(newsNeedsRefresh(cache,true,now+100),false);
 assert.equal(newsNeedsRefresh(cache,true,now+NEWS_COOLDOWN),true);
 assert.equal(newsNeedsRefresh(cache,false,now+NEWS_COOLDOWN),false);
 assert.equal(newsNeedsRefresh(cache,false,now+NEWS_INTERVAL),true);
});
test('refresh coalesces concurrent requests, retains cached stories on failure, retries and clears errors',async()=>{
 let cache={...EMPTY_NEWS},now=Date.now(),calls=0,fail=false;
 const refresh=createNewsService({load:async()=>cache,save:async c=>{cache=c},now:()=>now,fetch:async()=>{calls++;if(fail)throw Error('offline');return new Response(rss(),{status:200});}});
 await Promise.all([refresh(),refresh(true),refresh()]);assert.equal(calls,NEWS_SOURCES.length);assert.equal(cache.stories.length,1);assert.ok(cache.refreshedAt);
 await refresh(true);assert.equal(calls,NEWS_SOURCES.length);
 const before=cache.refreshedAt;now+=NEWS_INTERVAL;fail=true;await refresh();assert.equal(cache.stories.length,1);assert.equal(cache.refreshedAt,before);assert.match(cache.error,/Could not refresh/);
 now+=NEWS_COOLDOWN;fail=false;await refresh(true);assert.equal(cache.error,undefined);assert.ok(cache.refreshedAt>before);
});
test('successful empty feed stays empty',async()=>{
 let cache={...EMPTY_NEWS};
 const empty=createNewsService({load:async()=>cache,save:async c=>{cache=c},fetch:async()=>new Response('<rss><channel></channel></rss>')});
 await empty();assert.equal(cache.stories.length,0);assert.ok(cache.refreshedAt);assert.equal(cache.error,undefined);
});

test('partial failure keeps cached entries only for the failed publisher', async()=>{
 const now=Date.now();let cache={stories:[...parseNewsFeed(rss('Older story','https://example.com/old'),'MIT News'),...parseNewsFeed(rss('Replaced story','https://example.com/replaced'),'TechCrunch')],attemptedAt:0,refreshedAt:1};
 const refresh=createNewsService({load:async()=>cache,save:async c=>{cache=c},now:()=>now,fetch:async url=>{if(String(url).includes('mit.edu'))throw Error('offline');return new Response(rss('New AI story','https://example.com/new'));}});
 await refresh();assert.equal(cache.stories.length,2);assert.ok(cache.stories.some(s=>s.url.endsWith('/old')));assert.ok(!cache.stories.some(s=>s.url.endsWith('/replaced')));assert.match(cache.error,/MIT News/);
});
