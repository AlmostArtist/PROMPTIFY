import { bindDOMTheme } from '@/lib/themeDOM';
import { useEffect } from 'react';

/**
 * Celebration overlay — plays when a prompt enhancement / insertion completes.
 *
 * Visual: a realistic confetti fountain bursting up from the prompt area and
 * raining down (parabolic launch + gravity, each piece tumbling in 3D), plus a
 * central flash, two shockwave rings and an "✨ Enhanced" pop.
 *
 * Rendered directly into document.body and animated with the Web Animations
 * API (NOT CSS classes) so it is immune to shadow-DOM style scoping and the
 * host page's `style-src` CSP — it always shows.
 */
export function EnhanceCelebration({ burstKey }: { burstKey: number }) {
  useEffect(() => {
    if (!burstKey) return;

    const root = document.createElement('div');
    root.setAttribute('data-promptify-celebrate', '');
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
    document.body.appendChild(root);
    bindDOMTheme(root);

    const anims: Animation[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;          // burst origin X (centre)
    const oy = vh - 130;        // burst origin Y (just above the prompt bar)
    const my = vh * 0.46;       // flash / text centre Y

    const COLORS = ['var(--p-primary)', 'var(--theme-accent-text)', 'var(--p-text-2)'];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    // ── Central flash ────────────────────────────────────────────────
    const flash = document.createElement('div');
    flash.style.cssText =
      `position:absolute;left:${cx}px;top:${my}px;width:340px;height:340px;margin:-170px 0 0 -170px;` +
      'border-radius:50%;background:radial-gradient(circle,rgba(253,230,138,0.75),rgba(245,158,11,0.18) 55%,transparent 70%);';
    root.appendChild(flash);
    anims.push(flash.animate(
      [
        { transform: 'scale(0.2)', opacity: 0 },
        { opacity: 0.55, offset: 0.14 },
        { transform: 'scale(1.7)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out', fill: 'forwards' },
    ));

    // ── Shockwave rings ──────────────────────────────────────────────
    const mkRing = (color: string, delay: number, duration: number) => {
      const ring = document.createElement('div');
      ring.style.cssText =
        `position:absolute;left:${cx}px;top:${my}px;width:200px;height:200px;margin:-100px 0 0 -100px;` +
        `border-radius:50%;border:3px solid ${color};`;
      root.appendChild(ring);
      anims.push(ring.animate(
        [
          { transform: 'scale(0.1)', opacity: 0.75 },
          { transform: 'scale(2.6)', opacity: 0 },
        ],
        { duration, delay, easing: 'cubic-bezier(0.2,0.7,0.3,1)', fill: 'forwards' },
      ));
    };
    mkRing('rgba(253,230,138,0.85)', 0, 1100);
    mkRing('rgba(167,139,250,0.8)', 140, 1300);

    // ── Confetti fountain ────────────────────────────────────────────
    type Shape = 'rect' | 'square' | 'streamer' | 'circle';
    for (let i = 0; i < 90; i++) {
      const shape = pick<Shape>(['rect', 'square', 'streamer', 'circle', 'rect', 'streamer']);
      let w: number, h: number, radius: string;
      switch (shape) {
        case 'square':   w = rnd(7, 11);  h = w;           radius = '1px'; break;
        case 'streamer': w = rnd(4, 6);   h = rnd(16, 26); radius = '2px'; break;
        case 'circle':   w = rnd(6, 10);  h = w;           radius = '50%'; break;
        default:         w = rnd(8, 13);  h = rnd(5, 8);   radius = '1px'; break;
      }

      const dir  = Math.random() < 0.5 ? -1 : 1;
      const dx   = dir * rnd(20, 380);   // horizontal landing offset
      const peak = -rnd(180, 470);       // apex above origin
      const fall = rnd(300, 720);        // distance below origin (off-screen)
      const dur  = rnd(2200, 3400);
      const delay = rnd(0, 250);

      const rz   = rnd(0, 360);
      const rx   = rnd(360, 1080);
      const ry   = rnd(360, 900);
      const spin = (Math.random() < 0.5 ? -1 : 1) * rnd(360, 1440);
      const spindur = rnd(500, 1200);

      const outer = document.createElement('div');
      outer.style.cssText =
        `position:absolute;left:${cx}px;top:${oy}px;perspective:600px;will-change:transform,opacity;`;
      const inner = document.createElement('div');
      inner.style.cssText =
        `width:${w}px;height:${h}px;background:${pick(COLORS)};border-radius:${radius};` +
        'transform-style:preserve-3d;will-change:transform;' +
        'box-shadow:inset 0 0 3px rgba(0,0,0,0.18),0 1px 2px rgba(0,0,0,0.12);';
      outer.appendChild(inner);
      root.appendChild(outer);

      anims.push(outer.animate(
        [
          { transform: 'translate(0,0)', opacity: 0, offset: 0, easing: 'cubic-bezier(0.16,0.7,0.38,1)' },
          { opacity: 1, offset: 0.06 },
          { transform: `translate(${dx * 0.42}px,${peak}px)`, offset: 0.26, easing: 'cubic-bezier(0.55,0,0.85,0.9)' },
          { opacity: 1, offset: 0.86 },
          { transform: `translate(${dx}px,${fall}px)`, opacity: 0, offset: 1 },
        ],
        { duration: dur, delay, fill: 'forwards', easing: 'linear' },
      ));
      anims.push(inner.animate(
        [
          { transform: `rotateX(0deg) rotateY(0deg) rotateZ(${rz}deg)` },
          { transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz + spin}deg)` },
        ],
        { duration: spindur, delay, iterations: Infinity, easing: 'linear' },
      ));
    }

    // ── Headline ─────────────────────────────────────────────────────
    const text = document.createElement('div');
    text.textContent = '✨ Enhanced';
    text.style.cssText =
      `position:absolute;left:50%;top:${my}px;transform:translate(-50%,-50%);` +
      "font-family:'Inter',-apple-system,system-ui,sans-serif;font-size:26px;font-weight:800;" +
      'letter-spacing:-0.02em;color:#fff;white-space:nowrap;' +
      'text-shadow:0 2px 12px rgba(245,158,11,0.55),0 1px 3px rgba(0,0,0,0.35);';
    root.appendChild(text);
    anims.push(text.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.6) translateY(8px)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.12)', offset: 0.28 },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.58 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.18) translateY(-10px)' },
      ],
      { duration: 1900, delay: 250, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' },
    ));

    const cleanup = window.setTimeout(() => root.remove(), 4200);
    return () => {
      window.clearTimeout(cleanup);
      anims.forEach((a) => a.cancel());
      root.remove();
    };
  }, [burstKey]);

  return null;
}
