// Personal memory capture. When the user has switched Memory on (it's off by
// default), each page they actually spend a few seconds on is summarised into
// a tiny local record — title, description, headings and opening text — so the
// Ask tab can later answer "what was that tool I saw last week?".
//
// Never captured: incognito tabs, pages with a password field, sign-in /
// banking / payment pages, and anything while the tab is in the background.
import type { BgRequest } from '@/lib/messages';
import { MEMORY_ON_KEY, type NewMemoryPage } from '@/lib/memory';

const DWELL_MS = 4000;
const EXCERPT_CHARS = 700;
const BLOCKED_HOST =
  /^(accounts\.|login\.|signin\.|auth\.|sso\.|id\.)|(^|\.)(paypal|stripe|razorpay|paytm|phonepe)\.com$|bank/i;
const BLOCKED_PATH = /\/(login|signin|sign-in|signup|sign-up|checkout|payment|billing|password|account\/security)\b/i;

let on = false;
/** The URL the dwell timer was last started for (SPA navigation detection). */
let seenUrl = '';
let timer: number | undefined;
let poll: number | undefined;

function init(): void {
  if (window.top !== window.self) return;
  if (chrome.extension?.inIncognitoContext) return;

  void chrome.storage?.local
    ?.get(MEMORY_ON_KEY)
    .then((r) => setOn(r?.[MEMORY_ON_KEY] === true))
    .catch(() => undefined);

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes[MEMORY_ON_KEY]) setOn(changes[MEMORY_ON_KEY].newValue === true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
}

function setOn(next: boolean): void {
  on = next;
  window.clearInterval(poll);
  window.clearTimeout(timer);
  if (!on) return;
  schedule();
  // SPAs (YouTube, X, GitHub…) change URL without a page load.
  poll = window.setInterval(() => {
    if (location.href !== seenUrl) schedule();
  }, 2000);
}

function schedule(): void {
  window.clearTimeout(timer);
  if (!on || document.visibilityState !== 'visible') return;
  const url = location.href;
  seenUrl = url;
  timer = window.setTimeout(() => {
    if (location.href === url && document.visibilityState === 'visible') capture();
  }, DWELL_MS);
}

function meta(sel: string): string {
  return (document.querySelector<HTMLMetaElement>(sel)?.content ?? '').trim();
}

function capture(): void {
  if (!/^https?:$/.test(location.protocol)) return;
  if (BLOCKED_HOST.test(location.hostname) || BLOCKED_PATH.test(location.pathname)) return;
  if (document.querySelector('input[type="password"]')) return;

  const title = (document.title || '').trim();
  if (!title) return;

  const desc = (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 300);
  const headings = Array.from(document.querySelectorAll('h1, h2'))
    .map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 2 && t.length < 120)
    .slice(0, 6)
    .join(' · ');
  const root = (document.querySelector('article, main, [role="main"]') as HTMLElement | null) ?? document.body;
  const body = (root?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const excerpt = `${headings ? `${headings} — ` : ''}${body}`.slice(0, EXCERPT_CHARS);

  const page: NewMemoryPage = { url: location.href, title, host: location.hostname.replace(/^www\./, ''), desc, excerpt };
  void chrome.runtime.sendMessage({ type: 'memoryRecord', page } satisfies BgRequest).catch(() => undefined);
}

init();
