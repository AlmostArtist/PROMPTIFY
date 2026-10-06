import { bindDOMTheme } from '@/lib/themeDOM';
import { useEffect } from 'react';

/**
 * "AI is working" progress FX. Shown while `active`:
 *   1. A sleek indeterminate progress bar (gradient fill + shimmer) at the top.
 *   2. A glowing comet that races around the viewport border.
 *
 * Rendered directly into document.body and animated with the Web Animations
 * API (NOT CSS classes) so it is immune to shadow-DOM style scoping and to the
 * host page's `style-src` CSP — it always shows.
 */
export function PromptBarFX({ active }: { active: boolean; burstKey: number }) {
  useEffect(() => {
    if (!active) return;

    const root = document.createElement('div');
    root.setAttribute('data-promptify-fx', '');
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483640;pointer-events:none;';
    document.body.appendChild(root);
    bindDOMTheme(root);

    const anims: Animation[] = [];

    // ── Top indeterminate bar ────────────────────────────────────────
    const track = document.createElement('div');
    track.style.cssText =
      'position:absolute;top:0;left:0;right:0;height:4px;overflow:hidden;background:var(--p-surface-2);';
    const fill = document.createElement('div');
    fill.style.cssText =
      'position:absolute;top:0;bottom:0;border-radius:999px;' +
      'background:var(--p-primary);' +
      'box-shadow:0 0 14px rgba(99,102,241,0.85),0 0 5px rgba(34,211,238,0.9);';
    const shine = document.createElement('div');
    shine.style.cssText =
      'position:absolute;top:0;bottom:0;width:26%;' +
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent);';
    track.append(fill, shine);
    root.appendChild(track);

    anims.push(
      fill.animate(
        [
          { left: '-45%', width: '45%' },
          { left: '35%', width: '58%', offset: 0.55 },
          { left: '105%', width: '45%' },
        ],
        { duration: 1500, iterations: Infinity, easing: 'cubic-bezier(0.65,0,0.35,1)' },
      ),
    );
    anims.push(
      shine.animate(
        [{ transform: 'translateX(-130%)' }, { transform: 'translateX(520%)' }],
        { duration: 1150, iterations: Infinity, easing: 'ease-in-out' },
      ),
    );

    // ── Glowing comet border ─────────────────────────────────────────
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    const sw = 3;
    const rx = 16;

    const buildBorder = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.querySelectorAll('rect').forEach((r) => {
        r.setAttribute('width', String(w - sw));
        r.setAttribute('height', String(h - sw));
      });
    };

    svg.setAttribute('fill', 'none');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;';

    const mkRect = (stroke: string, dash: string, width: number, filter: string) => {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', String(sw / 2));
      r.setAttribute('y', String(sw / 2));
      r.setAttribute('rx', String(rx));
      r.setAttribute('fill', 'none');
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', String(width));
      r.setAttribute('stroke-linecap', 'round');
      r.setAttribute('pathLength', '100');
      if (dash) r.setAttribute('stroke-dasharray', dash);
      if (filter) r.style.filter = filter;
      return r;
    };

    const trackRect = mkRect('rgba(124,58,237,0.22)', '', 3, '');
    const seg2 = mkRect('#22D3EE', '8 92', 2,
      'drop-shadow(0 0 5px rgba(34,211,238,0.85))');
    seg2.style.opacity = '0.6';
    seg2.setAttribute('stroke-dashoffset', '-50');
    const seg = mkRect('#A78BFA', '16 84', 3,
      'drop-shadow(0 0 6px rgba(124,58,237,0.9)) drop-shadow(0 0 3px rgba(34,211,238,0.85))');
    svg.append(trackRect, seg2, seg);
    root.appendChild(svg);
    buildBorder();

    anims.push(trackRect.animate(
      [{ opacity: 0.3 }, { opacity: 0.6 }, { opacity: 0.3 }],
      { duration: 1800, iterations: Infinity, easing: 'ease-in-out' },
    ));
    anims.push(seg.animate(
      [{ strokeDashoffset: '0' }, { strokeDashoffset: '-100' }],
      { duration: 1500, iterations: Infinity, easing: 'linear' },
    ));
    anims.push(seg2.animate(
      [{ strokeDashoffset: '-50' }, { strokeDashoffset: '-150' }],
      { duration: 1500, iterations: Infinity, easing: 'linear' },
    ));

    window.addEventListener('resize', buildBorder);

    return () => {
      window.removeEventListener('resize', buildBorder);
      anims.forEach((a) => a.cancel());
      root.remove();
    };
  }, [active]);

  return null;
}
