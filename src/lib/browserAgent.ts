// Talk to your browser — turns one spoken / typed request into one action.
// A single planning call sees the request plus the open tabs (id | title |
// site) and returns JSON; the Ask tab then executes it. Destructive actions
// (closing tabs) are always shown for confirmation first.
import { requestAi } from './messages';
import { numList, parseJsonLoose, str, strList } from './json';

export type AgentAction =
  | 'recall'
  | 'focus_tabs'
  | 'close_tabs'
  | 'summarize_tabs'
  | 'compare_tabs'
  | 'site_search'
  | 'navigate'
  | 'send_to_ai'
  | 'screenshot_prompt'
  | 'answer';

const ACTIONS: AgentAction[] = [
  'recall', 'focus_tabs', 'close_tabs', 'summarize_tabs', 'compare_tabs',
  'site_search', 'navigate', 'send_to_ai', 'screenshot_prompt', 'answer',
];

export interface AgentPlan {
  action: AgentAction;
  say: string;
  tabIds: number[];
  keywords: string[];
  daysBack: number;
  mode: 'answer' | 'timeline';
  reopen: boolean;
  site: string;
  query: string;
  url: string;
  target: string;
  prompt: string;
}

export interface TabInfo {
  id: number;
  windowId: number;
  title: string;
  url: string;
  host: string;
  active: boolean;
  highlighted: boolean;
  discarded: boolean;
}

/** Open http(s) tabs across all windows. Titles/URLs need the `tabs` permission. */
export async function listTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id !== undefined && t.url && /^https?:/i.test(t.url))
    .map((t) => {
      let host = '';
      try {
        host = new URL(t.url as string).hostname.replace(/^www\./, '');
      } catch {
        /* keep empty */
      }
      return {
        id: t.id as number,
        windowId: t.windowId,
        title: t.title ?? '',
        url: t.url as string,
        host,
        active: t.active,
        highlighted: t.highlighted,
        discarded: Boolean(t.discarded),
      };
    });
}

export async function planCommand(utterance: string, tabs: TabInfo[]): Promise<AgentPlan | { error: string }> {
  const now = new Date();
  const tabLines = tabs
    .slice(0, 80)
    .map((t) => `${t.id} | ${t.title.replace(/\s+/g, ' ').slice(0, 90)} | ${t.host}${t.active ? ' | (current)' : ''}`)
    .join('\n');
  const input =
    `TODAY: ${now.toDateString()}\n\n` +
    `OPEN TABS (id | title | site):\n${tabLines || '(not available)'}\n\n` +
    `REQUEST: "${utterance.trim()}"`;

  const res = await requestAi('agent-plan', input);
  if (!res.ok || !res.text) return { error: res.error || 'Could not understand that.' };
  const o = parseJsonLoose(res.text);
  if (!o) return { error: 'The model returned an unreadable plan — try rephrasing.' };

  const action = ACTIONS.includes(o.action as AgentAction) ? (o.action as AgentAction) : 'answer';
  const valid = new Set(tabs.map((t) => t.id));
  return {
    action,
    say: str(o.say),
    tabIds: numList(o.tab_ids).filter((id) => valid.has(id)),
    keywords: strList(o.keywords),
    daysBack: Number(o.days_back) > 0 ? Number(o.days_back) : 30,
    mode: o.mode === 'timeline' ? 'timeline' : 'answer',
    reopen: o.reopen === true,
    site: str(o.site).toLowerCase(),
    query: str(o.query),
    url: str(o.url),
    target: str(o.target).toLowerCase(),
    prompt: str(o.prompt),
  };
}

const enc = encodeURIComponent;

export function siteSearchUrl(site: string, query: string): string {
  const q = enc(query);
  switch (site) {
    case 'gmail':     return `https://mail.google.com/mail/u/0/#search/${q}`;
    case 'youtube':   return `https://www.youtube.com/results?search_query=${q}`;
    case 'github':    return `https://github.com/search?q=${q}&type=repositories`;
    case 'reddit':    return `https://www.reddit.com/search/?q=${q}`;
    case 'x':
    case 'twitter':   return `https://x.com/search?q=${q}`;
    case 'amazon':    return `https://www.amazon.com/s?k=${q}`;
    case 'drive':     return `https://drive.google.com/drive/search?q=${q}`;
    case 'maps':      return `https://www.google.com/maps/search/${q}`;
    case 'wikipedia': return `https://en.wikipedia.org/w/index.php?search=${q}`;
    case 'notion':    return `https://www.google.com/search?q=${enc(`site:notion.so ${query}`)}`;
    default:          return `https://www.google.com/search?q=${q}`;
  }
}

/** Only allow plain web URLs from the planner. */
export function safeUrl(url: string): string | null {
  // Reject other schemes (chrome:, javascript:, file:, data:) — but not "host:port".
  const scheme = url.trim().match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1]) && !/^[^:/]+:\d/.test(url.trim())) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface TabText {
  tab: TabInfo;
  text: string;
}

/** Read visible text from tabs (needs the all-sites permission). Unreadable tabs are skipped. */
export async function readTabsText(tabs: TabInfo[], perTab = 3500): Promise<TabText[]> {
  const out: TabText[] = [];
  for (const tab of tabs.slice(0, 8)) {
    if (tab.discarded) continue;
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const root = (document.querySelector('main, article, [role="main"]') as HTMLElement | null) ?? document.body;
          return (root?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
        },
      });
      const text = String(inj?.result ?? '').slice(0, perTab);
      if (text) out.push({ tab, text });
    } catch {
      /* restricted page or no permission — skip it */
    }
  }
  return out;
}

export function tabsBlock(items: TabText[]): string {
  return items
    .map((x, i) => `=== TAB ${i + 1}: ${x.tab.title} (${x.tab.host}) ===\n${x.text}\n=== END TAB ${i + 1} ===`)
    .join('\n\n');
}

/** Which tabs a summarize/compare should use when the planner didn't pick any. */
export function defaultTabSet(tabs: TabInfo[], picked: number[]): TabInfo[] {
  if (picked.length) return tabs.filter((t) => picked.includes(t.id));
  const current = tabs.find((t) => t.active);
  const sameWindow = tabs.filter((t) => t.windowId === current?.windowId);
  const highlighted = sameWindow.filter((t) => t.highlighted);
  return (highlighted.length > 1 ? highlighted : sameWindow).slice(0, 8);
}
