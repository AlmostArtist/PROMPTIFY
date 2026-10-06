import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextRail } from '@/ui/components/ContextRail';
import { useBackendHealth } from '@/ui/hooks/useBackendHealth';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

/** True while this window's side panel is open — the panel has its own dock. */
function usePanelOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ask = () => void chrome.runtime.sendMessage({ type: 'panelState' }).then((r: { open?: boolean } | undefined) => setOpen(Boolean(r?.open))).catch(() => undefined);
    const onMessage = (message: { type?: string; open?: boolean }) => { if (message?.type === 'pk-panelState') setOpen(Boolean(message.open)); };
    const onVisible = () => { if (document.visibilityState === 'visible') ask(); };
    ask();
    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => { chrome.runtime.onMessage.removeListener(onMessage); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return open;
}

function WebRail() {
  const health = useBackendHealth(0, false);
  const panelOpen = usePanelOpen();
  return <ContextRail web hidden={panelOpen} health={health} onCapture={() => void chrome.runtime.sendMessage({ type: 'quickCapture' })} readPage={async () => {
    const copy = (document.querySelector('main, article, [role="main"]') ?? document.body).cloneNode(true) as HTMLElement;
    copy.querySelectorAll('script, style, nav, header, footer, input, textarea, [contenteditable], #promptify-context-root, #promptify-ai-root').forEach(node => node.remove());
    return copy.textContent?.replace(/\s+/g, ' ').trim().slice(0, 14000) ?? null;
  }} onNavigate={page => {
    void chrome.runtime.sendMessage({ type: 'openSidePanel', page });
  }} />;
}
if (window.top === window.self && !document.getElementById('promptify-context-root')) {
  const host = document.createElement('div'); host.id = 'promptify-context-root';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  createRoot(shadow).render(<ErrorBoundary><WebRail /></ErrorBoundary>);
}
