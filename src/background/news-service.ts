import { createNewsService, EMPTY_NEWS, NEWS_KEY, type NewsCache } from '@/lib/news';
export const refreshNews = createNewsService({
  load: async () => ((await chrome.storage.local.get(NEWS_KEY))[NEWS_KEY] as NewsCache) ?? EMPTY_NEWS,
  save: value => chrome.storage.local.set({ [NEWS_KEY]: value }),
  fetch: (...args) => fetch(...args),
});
const ALARM = 'pk-news-hourly';
async function ensureAlarm() { if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: 60 }); }
void ensureAlarm().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); void refreshNews().catch(() => undefined); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); void refreshNews().catch(() => undefined); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void refreshNews().catch(() => undefined); });
