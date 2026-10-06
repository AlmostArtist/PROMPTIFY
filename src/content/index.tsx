import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/ui/App';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import styles from '@/ui/styles.css?inline';
import type { BgRequest, Handoff, TabCommand } from '@/lib/messages';
import { findPromptInput, getAdapter, scrapeSession, submitPrompt } from './siteAdapters';
import { readPrompt, writePrompt } from './inject';
import { attachMentionAutocomplete } from './mentionAutocomplete';
const HOST_ID = 'promptify-ai-root';

// Only run in the top frame — these sites embed iframes we should ignore.
if (window.top === window.self) {
  // The composer often mounts after first paint; document_idle is usually
  // enough, but guard against re-injection on SPA navigations all the same.
  if (!document.getElementById(HOST_ID)) {
    mount();
  }
  // Activate // mention autocomplete on the prompt input.
  attachMentionAutocomplete(getAdapter());
  // AI Hub: if this tab was opened to receive a prompt, type it in.
  void chrome.runtime
    .sendMessage({ type: 'claimHandoff' } satisfies BgRequest)
    .then((h: Handoff | null) => (h?.text ? deliverHandoff(h) : undefined))
    .catch(() => undefined);
  // Let the side panel read/write this tab's prompt box.
  chrome.runtime.onMessage.addListener((message: TabCommand, _sender, sendResponse) => {
    if (message?.type === 'pf-getPrompt') {
      const el = findPromptInput(getAdapter());
      sendResponse({ text: el ? readPrompt(el).trim() : null });
    } else if (message?.type === 'pf-setPrompt') {
      const el = findPromptInput(getAdapter());
      if (el) {
        writePrompt(el, message.text);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    } else if (message?.type === 'pf-glow') {
      // Hand off to the React app (same isolated world) to toggle the progress border.
      window.dispatchEvent(new CustomEvent('pf-glow', { detail: { on: message.on } }));
      sendResponse({ ok: true });
    } else if (message?.type === 'pf-burst') {
      window.dispatchEvent(new CustomEvent('pf-burst'));
      sendResponse({ ok: true });
    } else if (message?.type === 'pf-getSession') {
      sendResponse(scrapeSession(getAdapter()));
    }
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for the composer to appear (sites hydrate slowly), then fill — and optionally send. */
async function deliverHandoff(h: Handoff): Promise<void> {
  const adapter = getAdapter();
  let el: HTMLElement | null = null;
  for (let i = 0; i < 50 && !el; i++) {
    el = findPromptInput(adapter);
    if (!el) await wait(400);
  }
  if (!el) return;
  // Give the app's editor a moment to finish hydrating, or it may wipe our text.
  await wait(900);
  el = findPromptInput(adapter) ?? el;
  writePrompt(el, h.text);
  await wait(700);
  // Re-apply once if a late re-render cleared it.
  const current = findPromptInput(adapter) ?? el;
  if (!readPrompt(current).trim()) writePrompt(current, h.text);
  if (h.autoSend) {
    await wait(500);
    submitPrompt(findPromptInput(adapter) ?? current);
  }
}

function mount(): void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  // Zero-size fixed host — never intercepts page clicks.
  // `position:fixed` is required so that children using viewport coordinates
  // stay anchored to the viewport and never scroll with the page.
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;';
  document.documentElement.appendChild(host);

  // Shadow DOM isolates our Tailwind/preflight from the host site and vice versa.
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  mountPoint.className = 'pf-root';
  shadow.appendChild(mountPoint);

  try {
    createRoot(mountPoint).render(
      <StrictMode>
        <ErrorBoundary>
          <App adapter={getAdapter()} />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    console.warn('[PROMPTIFY] mount failed:', err);
  }
}
