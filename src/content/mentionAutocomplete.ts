import { bindDOMTheme, initializeDOMTheme } from '@/lib/themeDOM';
// ── // Mention autocomplete ──────────────────────────────────────────
// When the user types "//" in the prompt textarea on a supported AI chat site,
// this module shows a floating dropdown of saved prompts. Selecting one replaces
// the "//" trigger text with the chosen prompt content.

import type { SavedPrompt } from '@/engine/types';
import { getSavedPromptsViaMessage } from '@/lib/messages';
import { loadHumanTone } from '@/lib/storage';
import { withHumanTone } from '@/data/humanTone';
import type { SiteAdapter } from './siteAdapters';
import { findPromptInput } from './siteAdapters';
import { readPrompt, writePrompt } from './inject';

const DROPDOWN_ID = 'pf-mention-dropdown';
let activeDropdown: HTMLElement | null = null;
let activeItems: SavedPrompt[] = [];
let highlightIndex = -1;
// Refreshed whenever the dropdown opens; read synchronously when inserting.
let humanToneOn = false;

/** Inject styles for the dropdown into the page. Called once. */
function ensureStyles(): void {
  initializeDOMTheme();
  if (document.getElementById('pf-mention-styles')) return;
  const style = document.createElement('style');
  style.id = 'pf-mention-styles';
  style.textContent = `
    #${DROPDOWN_ID} {
      position: fixed;
      z-index: 2147483647;
      min-width: 260px;
      max-width: 380px;
      max-height: 240px;
      overflow-y: auto;
      border-radius: var(--theme-radius);
      border: 1px solid var(--p-border);
      background: var(--p-surface);
      backdrop-filter: saturate(180%) blur(18px);
      -webkit-backdrop-filter: saturate(180%) blur(18px);
      box-shadow: 0 8px 32px rgba(20, 8, 40, 0.6), 0 0 0 1px rgba(124, 58, 237, 0.08);
      padding: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      animation: pf-dd-in 0.15s ease both;
    }
    #${DROPDOWN_ID}::-webkit-scrollbar { width: 5px; }
    #${DROPDOWN_ID}::-webkit-scrollbar-thumb { background: var(--p-border); border-radius: 99px; }
    #${DROPDOWN_ID}::-webkit-scrollbar-track { background: transparent; }

    @keyframes pf-dd-in {
      from { opacity: 0; transform: translateY(4px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .pf-dd-header {
      padding: 6px 10px 4px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--p-text-2);
    }

    .pf-dd-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .pf-dd-item:hover,
    .pf-dd-item.pf-dd-active {
      background: var(--p-surface-2);
    }
    .pf-dd-item-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--p-text-1);
    }
    .pf-dd-item-preview {
      font-size: 10px;
      color: var(--p-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 340px;
    }

    .pf-dd-empty {
      padding: 12px 10px;
      font-size: 11px;
      color: var(--p-text-2);
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function destroyDropdown(): void {
  activeDropdown?.remove();
  activeDropdown = null;
  activeItems = [];
  highlightIndex = -1;
}

function renderDropdown(
  items: SavedPrompt[],
  anchorRect: DOMRect,
  filter: string,
  onSelect: (item: SavedPrompt) => void,
): void {
  destroyDropdown();
  ensureStyles();

  const filtered = filter
    ? items.filter(
        (p) =>
          p.label.toLowerCase().includes(filter.toLowerCase()) ||
          p.content.toLowerCase().includes(filter.toLowerCase()),
      )
    : items;
  activeItems = filtered;

  const dd = document.createElement('div');
  dd.id = DROPDOWN_ID;

  if (filtered.length === 0) {
    dd.innerHTML = `<div class="pf-dd-empty">No saved prompts${filter ? ' matching "' + filter + '"' : ''}</div>`;
  } else {
    dd.innerHTML = `<div class="pf-dd-header">Saved prompts</div>`;
    filtered.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'pf-dd-item';
      item.dataset.index = String(i);
      item.innerHTML = `
        <span class="pf-dd-item-label">${escHtml(p.label)}</span>
        <span class="pf-dd-item-preview">${escHtml(p.content.slice(0, 80))}</span>
      `;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(p);
      });
      dd.appendChild(item);
    });
  }

  // Position above the input
  dd.style.left = `${anchorRect.left}px`;
  dd.style.bottom = `${window.innerHeight - anchorRect.top + 6}px`;

  document.body.appendChild(dd);
  bindDOMTheme(dd);
  activeDropdown = dd;
  highlightIndex = -1;
}

function updateHighlight(): void {
  if (!activeDropdown) return;
  const items = activeDropdown.querySelectorAll('.pf-dd-item');
  items.forEach((el, i) => {
    el.classList.toggle('pf-dd-active', i === highlightIndex);
  });
  if (highlightIndex >= 0) {
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Helper: find "//" trigger in text ──────────────────────────────
function findTrigger(text: string, cursorPos: number): { start: number; filter: string } | null {
  // Look backwards from cursor for "//"
  const before = text.slice(0, cursorPos);
  const lastSlash = before.lastIndexOf('//');
  if (lastSlash === -1) return null;
  // The text between "//" and cursor is the filter query
  const filter = before.slice(lastSlash + 2);
  // Filter must not contain newlines (user moved on to a different line)
  if (filter.includes('\n')) return null;
  return { start: lastSlash, filter };
}

function getCursorPosition(el: HTMLElement): number {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.selectionStart ?? el.value.length;
  }
  // For contenteditable: approximate using selection
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return (el.innerText ?? '').length;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

// ── Replace the // trigger text with the selected prompt ───────────
// Robust against cursor drift after the dropdown is clicked: it re-locates the
// "//query" span from the current text and swaps the whole span for the prompt,
// rather than trusting a possibly-stale caret position.
function insertSelectedPrompt(el: HTMLElement, replacement: string): void {
  const current = readPrompt(el);

  let cursor: number;
  try {
    cursor = getCursorPosition(el);
  } catch {
    cursor = current.length;
  }

  let trigger = findTrigger(current, cursor);
  if (!trigger) {
    // Fallback: take the last "//" on its line as the trigger.
    const idx = current.lastIndexOf('//');
    if (idx === -1) return;
    const rest = current.slice(idx + 2);
    const nl = rest.indexOf('\n');
    trigger = { start: idx, filter: nl === -1 ? rest : rest.slice(0, nl) };
  }

  const end = trigger.start + 2 + trigger.filter.length;
  const newText = current.slice(0, trigger.start) + replacement + current.slice(end);
  writePrompt(el, newText);
}

// ── Main: attach to the page ───────────────────────────────────────
let attached = false;

export function attachMentionAutocomplete(adapter: SiteAdapter | null): void {
  if (attached) return;
  attached = true;

  // We need to listen on the document because the prompt input may not exist yet
  // (SPA navigations create it lazily). We use event delegation.
  document.addEventListener(
    'input',
    (e) => {
      const el = findPromptInput(adapter);
      if (!el) return;
      // Only react to events from the prompt input itself
      const target = e.target as HTMLElement;
      if (target !== el && !el.contains(target)) return;

      const text = readPrompt(el);
      const cursor = getCursorPosition(el);
      const trigger = findTrigger(text, cursor);

      if (!trigger) {
        destroyDropdown();
        return;
      }

      // Fetch saved prompts (+ the human-tone toggle) and show dropdown
      void Promise.all([getSavedPromptsViaMessage(), loadHumanTone()]).then(([prompts, tone]) => {
        humanToneOn = tone;
        if (prompts.length === 0 && !trigger.filter) {
          // No saved prompts at all — show empty state
          const rect = el.getBoundingClientRect();
          renderDropdown([], rect, '', () => {});
          return;
        }
        const rect = el.getBoundingClientRect();
        renderDropdown(prompts, rect, trigger.filter, (selected) => {
          insertSelectedPrompt(el, withHumanTone(selected.content, humanToneOn));
          destroyDropdown();
        });
      });
    },
    true,
  );

  // Keyboard navigation inside the dropdown
  document.addEventListener(
    'keydown',
    (e) => {
      if (!activeDropdown) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        destroyDropdown();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        highlightIndex = Math.min(highlightIndex + 1, activeItems.length - 1);
        updateHighlight();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        highlightIndex = Math.max(highlightIndex - 1, 0);
        updateHighlight();
        return;
      }

      if ((e.key === 'Enter' || e.key === 'Tab') && highlightIndex >= 0 && activeItems[highlightIndex]) {
        e.preventDefault();
        e.stopPropagation();
        const selected = activeItems[highlightIndex];
        const el = findPromptInput(adapter);
        if (el) {
          insertSelectedPrompt(el, withHumanTone(selected.content, humanToneOn));
        }
        destroyDropdown();
        return;
      }
    },
    true,
  );

  // Dismiss on click outside
  document.addEventListener('mousedown', (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
      destroyDropdown();
    }
  });
}
