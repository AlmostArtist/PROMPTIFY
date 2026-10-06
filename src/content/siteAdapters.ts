// Per-site detection of the prompt input. Selectors are ordered most- to
// least-specific, with a generic fallback that survives most DOM redesigns.

export interface SiteAdapter {
  id: string;
  name: string;
  /** Hostname suffixes this adapter handles. */
  hosts: string[];
  /** Candidate selectors for the main composer, tried in order. */
  selectors: string[];
  /** Selectors that match individual conversation messages (for session scrape). */
  messageSelectors?: string[];
}

const GENERIC_FALLBACK = [
  'div[contenteditable="true"][role="textbox"]',
  'textarea[data-testid]',
  'div[contenteditable="true"]',
  'textarea',
  '[role="textbox"]',
];

const ADAPTERS: SiteAdapter[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    selectors: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea#prompt-textarea'],
  },
  {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    selectors: ['div[contenteditable="true"].ProseMirror', 'div[enterkeyhint][contenteditable="true"]'],
    messageSelectors: ['[data-testid="user-message"]', 'div.font-claude-message'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    selectors: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]'],
    messageSelectors: ['.query-text', '.model-response-text', 'message-content'],
  },
  {
    id: 'grok',
    name: 'Grok',
    hosts: ['grok.com', 'x.com'],
    selectors: ['textarea[aria-label*="Grok" i]', 'textarea[placeholder*="Ask" i]', 'textarea'],
    messageSelectors: ['.message-bubble', '[data-testid="message"]'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    hosts: ['perplexity.ai'],
    selectors: ['div[contenteditable="true"]#ask-input', 'textarea[placeholder*="Ask" i]', 'textarea'],
    messageSelectors: ['.prose', '[class*="answer"]'],
  },
  {
    id: 'copilot',
    name: 'Copilot',
    hosts: ['copilot.microsoft.com'],
    selectors: ['textarea#userInput', 'textarea[data-testid="composer-input"]', 'textarea'],
    messageSelectors: ['[data-content="message"]', '[class*="message"]'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    selectors: ['textarea#chat-input', 'textarea[placeholder*="DeepSeek" i]', 'textarea'],
    messageSelectors: ['.ds-markdown', '[class*="message"]'],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    hosts: ['chat.qwen.ai'],
    selectors: ['textarea#chat-input', 'textarea'],
    messageSelectors: ['.markdown-content-container', '[class*="message"]'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    hosts: ['kimi.com'],
    selectors: ['div.chat-input-editor[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea'],
    messageSelectors: ['.segment-content', '[class*="message"]'],
  },
  {
    id: 'mistral',
    name: 'Le Chat',
    hosts: ['chat.mistral.ai'],
    selectors: ['div.ProseMirror[contenteditable="true"]', 'textarea'],
  },
  {
    id: 'metaai',
    name: 'Meta AI',
    hosts: ['meta.ai'],
    selectors: ['div[contenteditable="true"][role="textbox"]', 'textarea'],
  },
  {
    id: 'huggingchat',
    name: 'HuggingChat',
    hosts: ['huggingface.co'],
    selectors: ['textarea[placeholder*="Ask" i]', 'textarea'],
  },
];

/** Selectors for each site's send button (checked before the generic ones). */
const SEND_BUTTONS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt" i]',
  'button[aria-label="Send message" i]',
  'button[aria-label*="Send" i]',
  'button[aria-label*="Submit" i]',
  'button[type="submit"]',
];

/**
 * Click the composer's send button (the one closest to it), or fall back to
 * pressing Enter in the composer. Returns whether something was triggered.
 */
export function submitPrompt(input: HTMLElement): boolean {
  const box = input.getBoundingClientRect();
  for (const sel of SEND_BUTTONS) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(sel)).filter(
      (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && isVisible(b),
    );
    if (!buttons.length) continue;
    const dist = (b: HTMLElement) => {
      const r = b.getBoundingClientRect();
      return Math.hypot(r.left - box.right, r.top - box.bottom);
    };
    buttons.sort((a, b) => dist(a) - dist(b));
    buttons[0].click();
    return true;
  }
  input.focus();
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  input.dispatchEvent(new KeyboardEvent('keydown', opts));
  input.dispatchEvent(new KeyboardEvent('keyup', opts));
  return true;
}

export function getAdapter(host: string = location.hostname): SiteAdapter | null {
  const h = host.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.some((suffix) => h === suffix || h.endsWith(`.${suffix}`))) ?? null;
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 12) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

/** Of several candidates, prefer the largest one nearest the bottom (the composer). */
function pickBest(els: HTMLElement[]): HTMLElement {
  return els.reduce((best, el) => {
    const a = el.getBoundingClientRect();
    const b = best.getBoundingClientRect();
    const scoreA = a.width * a.height + a.bottom;
    const scoreB = b.width * b.height + b.bottom;
    return scoreA >= scoreB ? el : best;
  });
}

export interface ScrapedSession {
  text: string;
  count: number;
  site: string;
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const SESSION_CHAR_CAP = 16000;

/**
 * Best-effort scrape of the on-page conversation. Prefers ChatGPT's explicit
 * role attributes, then per-site message selectors, then the main region's text.
 */
export function scrapeSession(adapter: SiteAdapter | null): ScrapedSession {
  const site = adapter?.name ?? 'Unknown';

  // 1. Explicit roles (ChatGPT and similar).
  const roleEls = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]'));
  let messages = roleEls
    .map((el) => ({ role: el.getAttribute('data-message-author-role') || 'user', text: (el.innerText || '').trim() }))
    .filter((m) => m.text);

  // 2. Per-site message selectors.
  if (messages.length === 0 && adapter?.messageSelectors) {
    for (const sel of adapter.messageSelectors) {
      let els: HTMLElement[];
      try {
        els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(isVisible);
      } catch {
        continue;
      }
      if (els.length) {
        messages = els.map((el) => ({ role: '', text: (el.innerText || '').trim() })).filter((m) => m.text);
        break;
      }
    }
  }

  let text: string;
  let count = messages.length;
  if (messages.length > 0) {
    text = messages.map((m) => (m.role ? `**${cap(m.role)}:** ${m.text}` : m.text)).join('\n\n');
  } else {
    // 3. Fallback: the main conversation area's visible text.
    const main = (document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body) as HTMLElement | null;
    text = (main?.innerText || '').trim();
    count = 0;
  }

  // Keep the most recent context if the conversation is very long.
  if (text.length > SESSION_CHAR_CAP) {
    text = `…(earlier conversation trimmed)…\n\n${text.slice(-SESSION_CHAR_CAP)}`;
  }
  return { text, count, site };
}

/** Locate the active prompt input for the current site (or null). */
export function findPromptInput(adapter: SiteAdapter | null): HTMLElement | null {
  const selectors = [...(adapter?.selectors ?? []), ...GENERIC_FALLBACK];
  for (const sel of selectors) {
    let matches: HTMLElement[];
    try {
      matches = Array.from(document.querySelectorAll<HTMLElement>(sel));
    } catch {
      continue; // invalid selector on this browser — skip
    }
    const visible = matches.filter(isVisible);
    if (visible.length) return pickBest(visible);
  }
  return null;
}
