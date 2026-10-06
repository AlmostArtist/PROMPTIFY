import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** Relative luminance (0–255-ish) of a CSS `rgb()/rgba()` string. */
function luminanceOf(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  const [r, g, b, a = 1] = parts;
  if (a === 0) return null; // transparent — keep looking
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Walk up from the page body to the first element with an opaque background. */
function detectTheme(): Theme {
  const candidates: Element[] = [document.body, document.documentElement].filter(Boolean) as Element[];
  for (const el of candidates) {
    const lum = luminanceOf(getComputedStyle(el).backgroundColor);
    if (lum !== null) return lum < 128 ? 'dark' : 'light';
  }
  // Fall back to the OS/site preference.
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

/**
 * Matches the toolbar to the host site's light/dark theme so it feels native.
 * Re-checks when the OS preference flips or the site toggles its theme (most
 * sites swap a class/attribute on <html>).
 */
export function useHostTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => detectTheme());

  useEffect(() => {
    const update = () => setTheme(detectTheme());

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', update);

    // Sites typically toggle dark mode via a class/attr on <html>.
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

    return () => {
      mq?.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);

  return theme;
}
