import { bindDOMTheme, initializeDOMTheme, reducedThemeMotion } from '@/lib/themeDOM';
// Text-selection action rail. On ANY webpage, selecting text pops a vertical,
// minimal black-and-yellow rail on the right edge with quick actions: get a
// simple AI answer about it, AI-humanize it, translate it to English, or save
// it as a reusable prompt.
//
// CSP note: like the rest of this extension's in-page UI (Toolbar / PromptBarFX),
// EVERYTHING here is built with raw DOM nodes + inline styles, and animated via
// the Web Animations API — NOT CSS classes or <style> tags. Strict `style-src`
// CSP on sites like ChatGPT/Claude blocks injected stylesheets, so inline CSSOM
// is the only approach that renders reliably everywhere.

import { requestAi, savePromptViaMessage, type AiTask, type TabCommand } from '@/lib/messages';
import { captureEditableTarget, insertIntoTarget, type EditableTarget } from './inject';

const RAIL_ID = 'promptify-selection-rail';
const POPOVER_ID = 'promptify-selection-popover';
const TOGGLE_KEY = 'pf_selection_rail';
const MIN_CHARS = 3;
const MAX_CHARS = 8000;

// CSS variables are assigned inline on each root, including under strict CSP.
const C = {
  surface: 'var(--p-surface)', surface2: 'var(--p-surface-2)', accent: 'var(--p-primary)',
  accentSolid: 'var(--p-primary)', accentInk: 'var(--p-primary-fg)', text: 'var(--p-text-1)',
  textDim: 'var(--p-text-2)', border: 'var(--p-border)', shadow: 'var(--p-shadow-md)',
};

const Z = '2147483646';
// The selection pill matches the quick-tool capsule: ink black in every theme.
const INK = '#0b0b0c';
const IVORY = '#f2f0ec';
const GAP = 10;

let enabled = true;
let railEl: HTMLDivElement | null = null;
let popoverEl: HTMLDivElement | null = null;
let selectedText = '';
// When the selection sits inside a writable box (WhatsApp/LinkedIn/Gmail/X/a
// textarea), we snapshot it here so AI output can be inserted back in place.
let editableTarget: EditableTarget | null = null;

// ── Lifecycle ───────────────────────────────────────────────────────
function init(): void {
  // Top frame only — avoids a rail per iframe.
  if (window.top !== window.self) return;
  initializeDOMTheme();

  void chrome.storage?.local
    ?.get(TOGGLE_KEY)
    .then((r) => {
      enabled = r?.[TOGGLE_KEY] !== false; // default on
    })
    .catch(() => undefined);

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes[TOGGLE_KEY]) {
      enabled = changes[TOGGLE_KEY].newValue !== false;
      if (!enabled) teardown();
    }
  });

  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', () => { if (railEl) hideRail(); }, { passive: true, capture: true });
  // Keep the right-click menu's Code / Product groups in sync with this page.
  document.addEventListener('contextmenu', () => reportMenuContext(true), true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reportMenuContext(true);
  });
  window.addEventListener('focus', () => reportMenuContext(true));

  // Right-click menu actions arrive from the service worker.
  chrome.runtime.onMessage.addListener((message: TabCommand | { type: 'pf-ping' }, _sender, sendResponse) => {
    if (message?.type === 'pf-ping') {
      sendResponse({ ok: true });
    } else if (message?.type === 'pf-runAi') {
      void runFromMenu(message);
      sendResponse({ ok: true });
    }
  });
}

// ── Context awareness for the universal right-click menu ──────────
let lastReported = '';

function reportMenuContext(force = false): void {
  const state = { code: selectionLooksLikeCode(), product: isProductPage() };
  const key = `${state.code}|${state.product}`;
  if (!force && key === lastReported) return;
  lastReported = key;
  void chrome.runtime.sendMessage({ type: 'menuContext', ...state }).catch(() => undefined);
}

const CODE_CONTAINER =
  'pre, code, .highlight, .blob-code, .cm-content, .cm-editor, .monaco-editor, .CodeMirror, [class*="language-"], [class*="hljs"]';

function selectionLooksLikeCode(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  const node = sel.anchorNode;
  const host = node instanceof Element ? node : node?.parentElement;
  if (host?.closest(CODE_CONTAINER)) return true;
  const t = sel.toString();
  const signals = [
    /[{};]\s*$/m,
    /\b(function|const|let|var|def|class|import|return|public|private|fn|func|#include|SELECT|FROM|WHERE)\b/,
    /=>|::|->|\)\s*\{|\w+\(.*\)\s*;/,
    /^( {2,}|\t)\S/m,
  ];
  return signals.filter((r) => r.test(t)).length >= 2;
}

let productCache: { url: string; product: boolean } | null = null;
const SHOP_HOSTS =
  /(^|\.)(amazon|flipkart|myntra|ebay|walmart|bestbuy|etsy|target|aliexpress|croma|ajio|meesho|nykaa|tatacliq|reliancedigital|newegg|ikea|zara|nike|adidas|apple)\./i;
const SHOP_PATHS = /\/(dp|gp\/product|p|itm|ip|product|products|listing|buy)\//i;

function isProductPage(): boolean {
  if (productCache?.url === location.href) return productCache.product;
  let product = false;
  try {
    product =
      Boolean(document.querySelector('meta[property="og:type"][content*="product" i], [itemtype*="schema.org/Product"]')) ||
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((s) =>
        /"@type"\s*:\s*\[?\s*"Product"/.test(s.textContent ?? ''),
      ) ||
      (SHOP_HOSTS.test(location.hostname) && SHOP_PATHS.test(location.pathname));
  } catch {
    product = false;
  }
  productCache = { url: location.href, product };
  return product;
}

/** Best guess at the product's name on a shopping page. */
function productName(): string {
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(s.textContent ?? '');
      const list = (Array.isArray(data) ? data : data['@graph'] ?? [data]) as Record<string, unknown>[];
      const p = list.find((x) => x?.['@type'] === 'Product' || (Array.isArray(x?.['@type']) && (x['@type'] as string[]).includes('Product')));
      if (p && typeof p.name === 'string') return p.name;
    } catch {
      /* malformed JSON-LD — try the next block */
    }
  }
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  const h1 = document.querySelector('h1')?.textContent;
  return (og || h1 || document.title).replace(/\s+/g, ' ').trim().slice(0, 160);
}

function pageText(max = 12000): string {
  const root = (document.querySelector('main, article, [role="main"]') as HTMLElement | null) ?? document.body;
  return (root?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

async function runFromMenu(cmd: Extract<TabCommand, { type: 'pf-runAi' }>): Promise<void> {
  let input = cmd.text;
  if (cmd.product) {
    input = [`Product: ${productName()}`, cmd.text && `Selected text: ${cmd.text}`, `Page: ${location.href}`]
      .filter(Boolean)
      .join('\n');
  }
  if (cmd.usePageText) {
    const body = pageText();
    input = `${input ? `${input}\n\n` : ''}Title: ${document.title}\n\n${body}`;
  }
  if (!input.trim()) return;

  selectedText = cmd.text;
  editableTarget = cmd.text ? captureEditableTarget() : null;
  showPopover(cmd.title);
  const res = await requestAi(cmd.task, input);
  if (res.ok && res.text) renderResult(cmd.title, res.text, cmd.links);
  else renderError(res.error || 'Something went wrong.', res.hint);
}

function onMouseUp(e: MouseEvent): void {
  if (!enabled) {
    reportMenuContext();
    return;
  }
  // Ignore clicks inside our own UI.
  if (isOurNode(e.target)) return;
  // Option (macOS) / Alt (Windows/Linux) + click on a selection → translate to
  // English straight away (handles Hinglish / Telugulish / any language).
  const altTranslate = e.altKey;
  // Let the selection settle after the mouseup.
  setTimeout(() => {
    const text = currentSelection();
    reportMenuContext();
    if (text) {
      selectedText = text;
      // Snapshot the editable box NOW, before our rail/popover steals focus.
      editableTarget = captureEditableTarget();
      if (altTranslate) void doAi('translate-english', 'English translation');
      else showRail();
    } else {
      hideRail();
    }
  }, 10);
}

function onMouseDown(e: MouseEvent): void {
  if (isOurNode(e.target)) return;
  // Right button: report context before Chrome builds the menu, and keep the
  // current selection + popover (the user is about to pick a menu action).
  if (e.button === 2) {
    reportMenuContext(true);
    return;
  }
  // A fresh click outside our UI dismisses everything.
  hideRail();
  hidePopover();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    hideRail();
    hidePopover();
  }
}

function currentSelection(): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  // Don't trigger on selections made inside our own UI.
  if (sel.anchorNode && isOurNode(sel.anchorNode)) return '';
  const t = sel.toString().replace(/\s+/g, ' ').trim();
  return t.length >= MIN_CHARS ? t.slice(0, MAX_CHARS) : '';
}

function isOurNode(node: EventTarget | Node | null): boolean {
  let n = node as Node | null;
  while (n) {
    if (n instanceof HTMLElement && (n.id === RAIL_ID || n.id === POPOVER_ID)) return true;
    n = (n as Node).parentNode;
  }
  return false;
}

function teardown(): void {
  hideRail();
  hidePopover();
}

// ── Small DOM helpers ───────────────────────────────────────────────
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  Object.assign(node, props);
  if (tag === 'button') {
    node.addEventListener('focus', () => { node.style.outline = '2px solid var(--theme-accent-text)'; node.style.outlineOffset = '2px'; });
    node.addEventListener('blur', () => { node.style.outline = ''; });
  }
  return node;
}

function fadeIn(node: HTMLElement, fromY: number): void {
  if (reducedThemeMotion()) return;
  node.animate(
    [
      { opacity: 0, transform: `translateY(${fromY}px) scale(.96)` },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
  );
}

/** Where the user's selection is on screen (falls back to the focused field). */
function selectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width || r.height) return r;
  }
  const active = document.activeElement as HTMLElement | null;
  return active && active !== document.body ? active.getBoundingClientRect() : null;
}

const clampX = (x: number, w: number) => Math.max(8, Math.min(x, window.innerWidth - w - 8));

/** Centre `node` above `rect` (or below it when there is no room above). */
function placeNear(node: HTMLElement, rect: DOMRect): 'above' | 'below' {
  const { width: w, height: h } = node.getBoundingClientRect();
  node.style.left = `${clampX(rect.left + rect.width / 2 - w / 2, w)}px`;
  const above = rect.top - h - GAP >= 8;
  node.style.top = `${above ? rect.top - h - GAP : Math.min(rect.bottom + GAP, window.innerHeight - h - 8)}px`;
  return above ? 'above' : 'below';
}

// ── Action rail ─────────────────────────────────────────────────────
interface RailAction {
  key: string;
  label: string;
  icon: string;
  run: () => void;
}

const ACTIONS: RailAction[] = [
  { key: 'improve', label: 'Improve message', icon: ICON_WAND(), run: () => void doAi('improve', 'Improved') },
  { key: 'search', label: 'AI search', icon: ICON_SEARCH(), run: () => void doAi('ai-search', 'AI answer') },
  { key: 'humanize', label: 'Humanize', icon: ICON_HUMAN(), run: () => void doAi('humanize', 'Humanized') },
  {
    key: 'translate',
    label: 'Translate → English',
    icon: ICON_TRANSLATE(),
    run: () => void doAi('translate-english', 'English translation'),
  },
  { key: 'save', label: 'Save as prompt', icon: ICON_SAVE(), run: () => void doSave() },
];

function showRail(): void {
  hidePopover();
  if (railEl) {
    const rect = selectionRect();
    if (rect) placeNear(railEl, rect);
    fadeIn(railEl, 6);
    return;
  }

  const rail = el('div', {
    position: 'fixed',
    left: '-9999px',
    top: '-9999px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '2px',
    padding: '5px',
    background: INK,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '999px',
    boxShadow: '0 18px 40px -16px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
    zIndex: Z,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    pointerEvents: 'auto',
  });
  rail.id = RAIL_ID;

  // Brand chip
  const brand = el('div', {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: IVORY,
    color: INK,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '800',
    marginRight: '4px',
    userSelect: 'none',
  });
  brand.textContent = 'k';
  rail.appendChild(brand);

  for (const a of ACTIONS) rail.appendChild(railButton(a));

  document.body.appendChild(rail);
  bindDOMTheme(rail);
  railEl = rail;
  const rect = selectionRect();
  if (rect) placeNear(rail, rect);
  else Object.assign(rail.style, { left: `${clampX(window.innerWidth / 2 - 120, 240)}px`, top: '16px' });
  fadeIn(rail, 6);
}

function railButton(a: RailAction): HTMLButtonElement {
  const btn = el('button', {
    position: 'relative',
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '0',
    borderRadius: '50%',
    color: IVORY,
    cursor: 'pointer',
    transition: 'background .14s ease, color .14s ease',
    padding: '0',
  });
  btn.type = 'button';
  btn.setAttribute('aria-label', a.label);
  btn.innerHTML = a.icon;

  const tip = makeTooltip(a.label);
  btn.appendChild(tip);

  btn.addEventListener('mouseenter', () => {
    btn.style.background = IVORY;
    btn.style.color = INK;
    tip.style.opacity = '1';
    tip.style.transform = 'translateX(-50%) translateY(0)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.color = IVORY;
    tip.style.opacity = '0';
    tip.style.transform = 'translateX(-50%) translateY(4px)';
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    a.run();
  });
  return btn;
}

function makeTooltip(label: string): HTMLSpanElement {
  const tip = el('span', {
    position: 'absolute',
    left: '50%',
    bottom: 'calc(100% + 10px)',
    transform: 'translateX(-50%) translateY(4px)',
    whiteSpace: 'nowrap',
    background: INK,
    color: IVORY,
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '5px 9px',
    borderRadius: '9px',
    fontSize: '12px',
    fontWeight: '600',
    boxShadow: C.shadow,
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity .14s ease, transform .14s ease',
  });
  tip.textContent = label;
  return tip;
}

function hideRail(): void {
  if (!railEl) return;
  railEl.remove();
  railEl = null;
}

// ── Actions ─────────────────────────────────────────────────────────
async function doSave(): Promise<void> {
  const text = selectedText;
  if (!text) return;
  const label = text.length > 42 ? `${text.slice(0, 42).trim()}…` : text;
  flashBrand('…');
  const ok = await savePromptViaMessage(label, text);
  flashBrand(ok ? '✓' : '✕');
}

async function doAi(task: AiTask, title: string): Promise<void> {
  const text = selectedText;
  if (!text) return;
  showPopover(title);
  const res = await requestAi(task, text);
  if (res.ok && res.text) {
    renderResult(title, res.text);
  } else {
    renderError(res.error || 'Something went wrong.', res.hint);
  }
}

/** Briefly swap the brand chip glyph to signal save success/failure. */
function flashBrand(glyph: string): void {
  const brand = railEl?.firstElementChild as HTMLElement | undefined;
  if (!brand) return;
  const prev = brand.textContent;
  brand.textContent = glyph;
  if (glyph === '✓' || glyph === '✕') {
    setTimeout(() => {
      if (brand.textContent === glyph) brand.textContent = prev;
    }, 1100);
  }
}

// ── Result popover ──────────────────────────────────────────────────
function showPopover(title: string): void {
  hidePopover();
  const pop = el('div', {
    position: 'fixed',
    left: '-9999px',
    top: '-9999px',
    width: '360px',
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: '64vh',
    display: 'flex',
    flexDirection: 'column',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '22px',
    boxShadow: C.shadow,
    zIndex: Z,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: C.text,
    overflow: 'hidden',
    pointerEvents: 'auto',
  });
  pop.id = POPOVER_ID;

  // Header
  const header = el('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: `1px solid ${C.border}`,
  });
  const h = el('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700' });
  const dot = el('span', { width: '6px', height: '14px', borderRadius: '3px', background: C.accent, flexShrink: '0' });
  const hLabel = el('span', {});
  hLabel.textContent = title;
  h.append(dot, hLabel);
  const close = el('button', {
    background: 'transparent',
    border: '0',
    color: C.textDim,
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1',
    padding: '2px 4px',
  });
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => hidePopover());
  header.append(h, close);

  // Body (loading state)
  const body = el('div', {
    padding: '14px',
    overflowY: 'auto',
    fontSize: '13px',
    lineHeight: '1.55',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    flex: '1',
  });
  body.dataset.role = 'body';
  body.appendChild(spinner());

  pop.append(header, body);
  document.body.appendChild(pop);
  bindDOMTheme(pop);
  popoverEl = pop;
  placePopover(pop);
  fadeIn(pop, 8);
}

/** Anchor the result card below the selection (never over it); else the right side. */
function placePopover(pop: HTMLElement): void {
  const rects = [railEl?.getBoundingClientRect(), selectionRect()].filter((r): r is DOMRect => Boolean(r && (r.width || r.height)));
  const w = Math.min(360, window.innerWidth - 16);
  if (!rects.length) {
    Object.assign(pop.style, { left: `${window.innerWidth - w - 96}px`, top: '12vh', maxHeight: '76vh' });
    return;
  }
  const centre = rects[0];
  pop.style.left = `${clampX(centre.left + centre.width / 2 - w / 2, w)}px`;
  const bottomEdge = Math.max(...rects.map((r) => r.bottom));
  const topEdge = Math.min(...rects.map((r) => r.top));
  const below = window.innerHeight - bottomEdge - GAP - 12;
  const above = topEdge - GAP - 12;
  if (below >= 240 || below >= above) {
    Object.assign(pop.style, { top: `${bottomEdge + GAP}px`, bottom: '', maxHeight: `${Math.max(160, below)}px` });
  } else {
    Object.assign(pop.style, { top: '', bottom: `${window.innerHeight - topEdge + GAP}px`, maxHeight: `${Math.max(160, above)}px` });
  }
}

function spinner(): HTMLElement {
  const wrap = el('div', {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: C.textDim,
    fontSize: '12.5px',
  });
  const dot = el('div', {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: `2px solid ${C.border}`,
    borderTopColor: C.accentSolid,
  });
  if (!reducedThemeMotion()) dot.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
    duration: 800,
    iterations: Infinity,
  });
  const label = el('span', {});
  label.textContent = 'Working on it…';
  wrap.append(dot, label);
  return wrap;
}

function popBody(): HTMLDivElement | null {
  return (popoverEl?.querySelector('[data-role="body"]') as HTMLDivElement) ?? null;
}

function renderResult(title: string, text: string, links?: { label: string; url: string }[]): void {
  const body = popBody();
  if (!body) return;
  body.textContent = text;

  if (links?.length) {
    const row = el('div', { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 14px 10px' });
    for (const l of links) {
      const b = ghostButton(l.label);
      Object.assign(b.style, { flex: '0 0 auto', padding: '6px 10px', fontSize: '11.5px' });
      b.addEventListener('click', () => window.open(l.url, '_blank', 'noopener'));
      row.appendChild(b);
    }
    popoverEl?.appendChild(row);
  }

  const footer = el('div', {
    display: 'flex',
    gap: '8px',
    padding: '10px 14px',
    borderTop: `1px solid ${C.border}`,
  });

  // When the selection came from a writable box (WhatsApp, LinkedIn, Gmail, a
  // textarea, …), offer to drop the result straight back in, replacing it.
  const target = editableTarget;
  if (target) {
    const insert = primaryButton('Insert');
    insert.innerHTML = `${ICON_INSERT()}<span style="margin-left:6px">Insert</span>`;
    Object.assign(insert.style, { display: 'flex', alignItems: 'center', justifyContent: 'center' });
    insert.addEventListener('click', () => {
      const ok = insertIntoTarget(target, text);
      if (ok) {
        hidePopover();
        hideRail();
      } else {
        insert.innerHTML = '<span>Couldn’t insert</span>';
        setTimeout(() => {
          insert.innerHTML = `${ICON_INSERT()}<span style="margin-left:6px">Insert</span>`;
        }, 1500);
      }
    });
    footer.appendChild(insert);
  }

  const copy = target ? ghostButton('Copy') : primaryButton('Copy');
  copy.addEventListener('click', async () => {
    const ok = await copyText(text);
    copy.textContent = ok ? 'Copied ✓' : 'Press ⌘/Ctrl+C';
    setTimeout(() => (copy.textContent = 'Copy'), 1400);
  });
  const save = ghostButton('Save as prompt');
  save.addEventListener('click', async () => {
    const ok = await savePromptViaMessage(`${title}: ${text.slice(0, 32).trim()}…`, text);
    save.textContent = ok ? 'Saved ✓' : 'Failed';
    setTimeout(() => (save.textContent = 'Save as prompt'), 1400);
  });
  footer.append(copy, save);
  popoverEl?.appendChild(footer);
}

function renderError(message: string, hint?: string): void {
  const body = popBody();
  if (!body) return;
  body.textContent = '';
  const msg = el('div', { color: '#FF9A9A', fontWeight: '600', marginBottom: hint ? '6px' : '0' });
  msg.textContent = message;
  body.appendChild(msg);
  if (hint) {
    const h = el('div', { color: C.textDim, fontSize: '12px' });
    h.textContent = hint;
    body.appendChild(h);
  }
}

function primaryButton(text: string): HTMLButtonElement {
  const b = el('button', {
    flex: '1',
    background: C.accent,
    color: C.accentInk,
    border: '0',
    borderRadius: '14px',
    padding: '9px 12px',
    fontSize: '12.5px',
    fontWeight: '700',
    cursor: 'pointer',
  });
  b.type = 'button';
  b.textContent = text;
  return b;
}

function ghostButton(text: string): HTMLButtonElement {
  const b = el('button', {
    flex: '1',
    background: C.surface2,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: '14px',
    padding: '9px 12px',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
  });
  b.type = 'button';
  b.textContent = text;
  return b;
}

function hidePopover(): void {
  if (!popoverEl) return;
  popoverEl.remove();
  popoverEl = null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked by page permissions policy — fall back to execCommand.
    try {
      const ta = el('textarea', { position: 'fixed', top: '-9999px', opacity: '0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ── Icons (inline SVG, stroke = currentColor) ───────────────────────
function svg(path: string): string {
  return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
function ICON_SAVE(): string {
  return svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/>');
}
function ICON_WAND(): string {
  // Magic wand + sparkle — "improve / polish this message".
  return svg('<path d="M15 4V2"/><path d="M15 10V8"/><path d="M12.5 5.5h-2"/><path d="M19.5 5.5h-2"/><path d="M18 13l-1.5-1.5"/><path d="M3 21l11-11"/><path d="M12.5 7.5L14 9"/>');
}
function ICON_INSERT(): string {
  // Arrow into a tray — "insert this back into the box".
  return svg('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 21h16"/>');
}
function ICON_SEARCH(): string {
  // Magnifier with a small sparkle — signals AI-powered answers, not raw web search.
  return svg('<circle cx="10.5" cy="10.5" r="6.5"/><line x1="20" y1="20" x2="15.5" y2="15.5"/><path d="M18 3l.7 1.8L20.5 5.5l-1.8.7L18 8l-.7-1.8L15.5 5.5l1.8-.7z"/>');
}
function ICON_HUMAN(): string {
  return svg('<path d="M12 2l1.6 4.2L18 8l-4.4 1.8L12 14l-1.6-4.2L6 8l4.4-1.8z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>');
}
function ICON_TRANSLATE(): string {
  return svg('<path d="M4 5h7"/><path d="M9 3v2c0 4-2.5 7-5 8"/><path d="M5 9c0 2.5 2.5 4.5 5 5.5"/><path d="M12 20l4-9 4 9"/><path d="M13.5 17h5"/>');
}

init();
