// Screenshot → Prompt: let the user drag a region on the page, then grab the
// visible tab and crop it. `pickRegion` is injected with chrome.scripting, so
// it MUST be fully self-contained — no imports, no outer variables.
import { normalizeImage, urlToBlob, type CropRect } from './image';

export interface PickedRegion {
  /** CSS pixels, relative to the viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
  pageTitle: string;
  pageUrl: string;
}

/**
 * Injected into the page. Shows a dimmed overlay; drag to select a region,
 * click (no drag) or Enter for the whole viewport, Esc to cancel. Resolves after
 * the overlay is gone and the page has repainted, so it isn't in the capture.
 */
export function pickRegion(): Promise<PickedRegion | null> {
  return new Promise((resolve) => {
    const ID = 'promptify-capture-overlay';
    document.getElementById(ID)?.remove();

    const root = document.createElement('div');
    root.id = ID;
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.35);user-select:none;';
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;display:none;border:2px solid #FFD43B;background:rgba(255,212,59,0.08);' +
      'box-shadow:0 0 0 9999px rgba(0,0,0,0.35);pointer-events:none;';
    const hint = document.createElement('div');
    hint.textContent = 'Drag to capture a region · Click for full view · Esc to cancel';
    hint.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;' +
      'background:#0E0E0E;color:#F4F4F5;font:600 12.5px Inter,system-ui,sans-serif;pointer-events:none;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);';
    root.append(box, hint);
    document.documentElement.appendChild(root);

    let sx = 0;
    let sy = 0;
    let dragging = false;

    const finish = (rect: { x: number; y: number; w: number; h: number } | null) => {
      root.remove();
      window.removeEventListener('keydown', onKey, true);
      if (!rect) return resolve(null);
      // Wait two frames so the overlay is gone from the composited frame.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(
            () =>
              resolve({
                ...rect,
                dpr: window.devicePixelRatio || 1,
                pageTitle: document.title,
                pageUrl: location.href,
              }),
            40,
          ),
        ),
      );
    };
    const full = () => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finish(full());
      }
    };
    window.addEventListener('keydown', onKey, true);

    root.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      box.style.display = 'block';
      box.style.left = `${sx}px`;
      box.style.top = `${sy}px`;
      box.style.width = '0px';
      box.style.height = '0px';
      root.style.background = 'transparent';
    });
    root.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      box.style.left = `${Math.min(sx, e.clientX)}px`;
      box.style.top = `${Math.min(sy, e.clientY)}px`;
      box.style.width = `${Math.abs(e.clientX - sx)}px`;
      box.style.height = `${Math.abs(e.clientY - sy)}px`;
    });
    root.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      const w = Math.abs(e.clientX - sx);
      const h = Math.abs(e.clientY - sy);
      // A click (or a tiny accidental drag) means "whole viewport".
      finish(w < 12 || h < 12 ? full() : { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w, h });
    });
  });
}

/** Capture the visible tab and crop it to the picked region. Returns a JPEG data URL. */
export async function captureRegion(windowId: number, region: PickedRegion | null): Promise<string> {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const blob = await urlToBlob(shot);
  let crop: CropRect | undefined;
  if (region) {
    const d = region.dpr || 1;
    crop = { x: region.x * d, y: region.y * d, w: region.w * d, h: region.h * d };
  }
  return normalizeImage(blob, crop);
}
