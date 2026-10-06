import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RobotMood } from '@/lib/robot';

export type RoboEyesMood = RobotMood;

export type RoboEyesVariant = 'eyes-only' | 'orb' | 'visor';

interface RoboEyesProps {
  mood?: RoboEyesMood;
  variant?: RoboEyesVariant;
  size?: number;
  color?: string;
  hue?: number;
  movement?: number;
  trackPointer?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

type BlinkSide = 'both' | 'left' | 'right' | null;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const MOOD_GRADIENTS: Record<'cool' | 'warm' | 'soft' | 'love', string> = {
  cool:
    'radial-gradient(circle at 38% 27%, #d9ff79 0 8%, #55f0e2 28%, #168ed7 61%, #5038cf 84%, #221064 100%)',
  warm:
    'radial-gradient(circle at 38% 25%, #fff48a 0 8%, #ffba2f 30%, #ff5b45 62%, #c51d71 86%, #5b164c 100%)',
  soft:
    'radial-gradient(circle at 38% 25%, #b8f5ff 0 8%, #78bdd7 31%, #5268ba 65%, #332477 88%, #1b154b 100%)',
  love:
    'radial-gradient(circle at 38% 25%, #fff5af 0 7%, #ff9bb6 31%, #ed4e9b 61%, #7041c6 88%, #291b67 100%)',
};

function shellPalette(mood: RoboEyesMood): string {
  if (mood === 'angry' || mood === 'mischievous') return MOOD_GRADIENTS.warm;
  if (mood === 'sad' || mood === 'tired' || mood === 'sleepy') return MOOD_GRADIENTS.soft;
  if (mood === 'love') return MOOD_GRADIENTS.love;
  return MOOD_GRADIENTS.cool;
}

/**
 * Expressive robot eyes with three presentations: a glossy orb, a compact
 * visor-head, and eyes-only. It uses layered CSS surfaces rather than images so
 * it stays sharp at toolbar size and works inside extension shadow roots.
 */
export function RoboEyes({
  mood = 'neutral',
  variant = 'eyes-only',
  size = 24,
  color = 'currentColor',
  hue = 0,
  movement = 100,
  trackPointer = true,
  reducedMotion = false,
  className,
}: RoboEyesProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef(0);
  const blinkTimerRef = useRef<number>();
  const blinkCloseRef = useRef<number>();
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blinkSide, setBlinkSide] = useState<BlinkSide>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (reducedMotion || !trackPointer) return;
    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = (event.clientX - (rect.left + rect.width / 2)) / Math.max(window.innerWidth * .2, 120);
        const dy = (event.clientY - (rect.top + rect.height / 2)) / Math.max(window.innerHeight * .2, 105);
        setLook({ x: clamp(dx, -1, 1), y: clamp(dy, -1, 1) });
      });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frameRef.current);
    };
  }, [reducedMotion, trackPointer]);

  useEffect(() => {
    if (reducedMotion || trackPointer || mood === 'thinking') return;
    const glances = [{ x: -.58, y: -.16 }, { x: .5, y: .1 }, { x: 0, y: 0 }, { x: .22, y: -.34 }];
    let index = 0;
    const id = window.setInterval(() => {
      setLook(glances[index % glances.length]);
      index += 1;
    }, 2200);
    return () => window.clearInterval(id);
  }, [mood, reducedMotion, trackPointer]);

  useEffect(() => {
    if (reducedMotion || mood !== 'thinking') return;
    const glances = [-.74, .7, -.24, .38];
    let index = 0;
    const id = window.setInterval(() => {
      setLook({ x: glances[index % glances.length], y: index % 2 ? .08 : -.17 });
      index += 1;
    }, 440);
    return () => window.clearInterval(id);
  }, [mood, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !['thinking', 'excited', 'love'].includes(mood)) {
      setPulse(false);
      return;
    }
    const id = window.setInterval(() => setPulse(value => !value), mood === 'thinking' ? 520 : 720);
    return () => window.clearInterval(id);
  }, [mood, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    let stopped = false;
    const schedule = () => {
      blinkTimerRef.current = window.setTimeout(() => {
        if (stopped) return;
        const wink = Math.random() < .17;
        setBlinkSide(wink ? (Math.random() < .5 ? 'left' : 'right') : 'both');
        blinkCloseRef.current = window.setTimeout(() => {
          if (stopped) return;
          setBlinkSide(null);
          schedule();
        }, wink ? 190 : 125);
      }, 2300 + Math.random() * 2600);
    };
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(blinkTimerRef.current);
      window.clearTimeout(blinkCloseRef.current);
    };
  }, [reducedMotion]);

  const shell = variant !== 'eyes-only';
  const orb = variant === 'orb';
  const motionStrength = clamp(movement, 0, 200) / 100;
  const height = shell ? size : Math.max(12, Math.round(size * .57));
  const eyeColor = shell
    ? orb
      ? 'linear-gradient(155deg,#14121f 0%,#05050a 48%,#182f5b 100%)'
      : 'linear-gradient(160deg,#ffffff 0 14%,#dffcff 45%,#8cecff 100%)'
    : mood === 'love'
      ? 'linear-gradient(160deg,#fff4fb,#ff6baa)'
      : `linear-gradient(160deg,#ffffff 0 10%,${color} 46%,#8ccff4 120%)`;

  const eye = (side: 'left' | 'right'): CSSProperties => {
    const isLeft = side === 'left';
    const curiousOuter = mood === 'curious' && ((isLeft && look.x < -.2) || (!isLeft && look.x > .2));
    const closed = blinkSide === 'both' || blinkSide === side || (mood === 'wink' && !isLeft);

    let width = 28;
    let eyeHeight = 68;
    let rotation = 0;
    let radius: CSSProperties['borderRadius'] = '44%';
    let clipPath: CSSProperties['clipPath'];

    if (mood === 'thinking') { width = isLeft ? 23 : 30; eyeHeight = isLeft ? 54 : 72; rotation = isLeft ? -5 : 4; }
    if (mood === 'curious') { width = curiousOuter ? 32 : 25; eyeHeight = curiousOuter ? 82 : 62; }
    if (mood === 'happy') { eyeHeight = 42; rotation = isLeft ? -8 : 8; radius = '18% 18% 58% 58%'; }
    if (mood === 'excited') { width = 31; eyeHeight = pulse ? 70 : 58; rotation = isLeft ? -12 : 12; radius = '20% 20% 58% 58%'; }
    if (mood === 'angry') { width = 31; eyeHeight = 55; rotation = isLeft ? 18 : -18; radius = '22% 22% 42% 42%'; }
    if (mood === 'mischievous') { width = isLeft ? 32 : 25; eyeHeight = isLeft ? 52 : 39; rotation = isLeft ? -13 : -7; radius = '25%'; }
    if (mood === 'sad') { width = 28; eyeHeight = 57; rotation = isLeft ? -11 : 11; radius = '46% 46% 38% 38%'; }
    if (mood === 'tired') { eyeHeight = 34; rotation = isLeft ? -5 : 5; }
    if (mood === 'sleepy') { width = 31; eyeHeight = 17; rotation = isLeft ? -3 : 3; radius = 999; }
    if (mood === 'surprised') { width = 29; eyeHeight = 84; radius = '50%'; }
    if (mood === 'love') {
      width = 34;
      eyeHeight = pulse ? 72 : 66;
      rotation = isLeft ? -5 : 5;
      radius = 0;
      clipPath = 'polygon(50% 94%,8% 51%,4% 31%,12% 12%,29% 4%,50% 19%,71% 4%,88% 12%,96% 31%,92% 51%)';
    }

    const x = look.x * (shell ? 1.6 : 2.3) * motionStrength;
    const y = look.y * (shell ? 1.15 : 1.65) * motionStrength + (mood === 'tired' || mood === 'sleepy' ? 8 : 0);
    const rotate3d = look.x * (isLeft ? 5 : -5) * motionStrength;
    return {
      position: 'relative',
      width: `${width}%`,
      height: `${eyeHeight}%`,
      minWidth: 3,
      minHeight: 2,
      borderRadius: radius,
      clipPath,
      overflow: 'hidden',
      background: eyeColor,
      transform: `translate3d(${x}px,${y}px,3px) rotate(${rotation + rotate3d}deg) rotateY(${look.x * 12 * motionStrength}deg) rotateX(${-look.y * 8 * motionStrength}deg) scaleY(${closed ? .1 : 1})`,
      transformOrigin: 'center',
      transition: reducedMotion
        ? 'none'
        : 'width 190ms cubic-bezier(.2,.8,.2,1),height 190ms cubic-bezier(.2,.8,.2,1),border-radius 190ms,transform 125ms ease-out,filter 190ms',
      boxShadow: orb
        ? 'inset 1px 1px 1px rgba(255,255,255,.3),inset -1px -2px 2px rgba(0,0,0,.6),0 1px 2px rgba(16,12,46,.45)'
        : `0 0 ${shell ? 7 : 4}px rgba(132,235,255,.72),inset 0 -1px 1px rgba(55,128,214,.35)`,
      filter: mood === 'angry' ? 'drop-shadow(0 0 3px rgba(255,91,73,.9))' : undefined,
    };
  };

  const mouth = (): CSSProperties => {
    const base: CSSProperties = {
      position: 'absolute',
      left: '50%',
      top: '66%',
      width: '18%',
      height: '8%',
      transform: 'translateX(-50%)',
      borderRadius: 999,
      transition: reducedMotion ? 'none' : 'all 180ms cubic-bezier(.2,.8,.2,1)',
    };
    if (mood === 'neutral') return { ...base, top: '69%', width: '13%', height: 2, background: '#2b2145', opacity: .86 };
    if (mood === 'curious') return { ...base, left: '55%', top: '66%', width: '8%', height: '9%', background: '#24163f', borderRadius: '50%', transform: 'translateX(-50%) rotate(-8deg)' };
    if (mood === 'happy') return { ...base, top: '63%', width: '23%', height: '13%', borderBottom: '2.5px solid #252044', borderRadius: '0 0 58% 58%' };
    if (mood === 'excited') return { ...base, top: '61%', width: '28%', height: '22%', background: '#21113e', borderRadius: '15% 15% 52% 52%', boxShadow: 'inset 0 2px 2px rgba(0,0,0,.35)' };
    if (mood === 'surprised') return { ...base, top: '63%', width: '11%', height: '14%', background: '#21113e', borderRadius: '50%', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.32)' };
    if (mood === 'sad') return { ...base, top: '69%', width: '19%', height: '11%', borderTop: '2.5px solid #252044', borderRadius: '55% 55% 0 0' };
    if (mood === 'tired') return { ...base, top: '71%', width: '14%', height: 2, background: '#30244a', transform: 'translateX(-50%) rotate(2deg)', opacity: .72 };
    if (mood === 'sleepy') return { ...base, top: '68%', width: '12%', height: '8%', border: '2px solid #30244a', borderRadius: '50%', opacity: .82 };
    if (mood === 'angry') return { ...base, top: '68%', width: '20%', height: '7%', borderTop: '3px solid #421832', borderRadius: '48% 48% 0 0', transform: 'translateX(-50%) rotate(-4deg)' };
    if (mood === 'mischievous') return { ...base, left: '55%', top: '65%', width: '20%', height: '11%', borderBottom: '2.5px solid #2b1643', borderRadius: '0 0 65% 30%', transform: 'translateX(-50%) rotate(-8deg)' };
    if (mood === 'thinking') return { ...base, left: '57%', top: '69%', width: '9%', height: '6%', background: '#261746', transform: 'translateX(-50%) rotate(-10deg)' };
    if (mood === 'love') return { ...base, top: '62%', width: '24%', height: '15%', borderBottom: '3px solid #4b194b', borderRadius: '0 0 62% 62%' };
    return { ...base, left: '54%', top: '65%', width: '18%', height: '9%', borderBottom: '2.5px solid #252044', borderRadius: '0 0 60% 42%', transform: 'translateX(-50%) rotate(-5deg)' };
  };

  const shellTransform = reducedMotion
    ? undefined
    : `perspective(${size * 8}px) rotateX(${-look.y * 10 * motionStrength}deg) rotateY(${look.x * 13 * motionStrength}deg) rotateZ(${(mood === 'mischievous' ? -4 : mood === 'excited' ? (pulse ? 2 : -2) : 0) * motionStrength}deg) translateZ(0)`;

  const eyeStage = (
    <span style={{
      position: shell ? 'absolute' : 'relative',
      left: shell ? (orb ? '18%' : '12%') : undefined,
      right: shell ? (orb ? '18%' : '12%') : undefined,
      top: shell ? (orb ? '29%' : '17%') : undefined,
      bottom: shell ? (orb ? '36%' : '17%') : undefined,
      width: shell ? undefined : '100%',
      height: shell ? undefined : '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: orb ? '15%' : '14%',
      padding: variant === 'visor' ? '5% 7%' : 0,
      boxSizing: 'border-box',
      borderRadius: variant === 'visor' ? '32%' : undefined,
      overflow: variant === 'visor' ? 'hidden' : 'visible',
      background: variant === 'visor'
        ? 'radial-gradient(circle at 48% 38%,#24204c 0%,#111329 48%,#070814 100%)'
        : undefined,
      border: variant === 'visor' ? '1px solid rgba(194,221,255,.3)' : undefined,
      boxShadow: variant === 'visor'
        ? 'inset 1px 2px 4px rgba(255,255,255,.12),inset -2px -3px 5px rgba(0,0,0,.65),0 0 8px rgba(108,88,255,.38)'
        : undefined,
      transformStyle: 'preserve-3d',
    }}>
      {(['left', 'right'] as const).map(side => (
        <span key={side} style={eye(side)}>
          <span style={{
            position: 'absolute',
            left: orb ? '25%' : '18%',
            top: orb ? '12%' : '8%',
            width: orb ? '27%' : '38%',
            height: orb ? '22%' : '16%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,.94)',
            boxShadow: '0 0 2px rgba(255,255,255,.9)',
            opacity: mood === 'sleepy' ? 0 : 1,
          }} />
        </span>
      ))}
    </span>
  );

  return (
    <span
      ref={rootRef}
      className={className}
      data-robo-eyes
      data-mood={mood}
      data-variant={variant}
      data-hue={Math.round(hue)}
      data-movement={Math.round(movement)}
      aria-hidden="true"
      style={{
        position: 'relative',
        width: size,
        height,
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'visible',
        color,
        pointerEvents: 'none',
        perspective: size * 9,
      }}
    >
      {shell ? (
        <>
          <span style={{
            position: 'absolute',
            left: '17%',
            right: '17%',
            bottom: '-8%',
            height: '13%',
            borderRadius: '50%',
            background: 'rgba(35,30,100,.38)',
            filter: `blur(${Math.max(2, size * .075)}px)`,
            transform: `translateX(${look.x * 1.5 * motionStrength}px) scale(${pulse && motionStrength > 0 ? 1.05 : .92})`,
            opacity: .7,
          }} />
          {variant === 'visor' && <>
            <span style={{ position: 'absolute', left: '-5%', top: '35%', width: '10%', height: '29%', borderRadius: '60% 20% 20% 60%', background: 'linear-gradient(90deg,#6f62db,#d6ddff)', boxShadow: 'inset 1px 1px 1px #fff9,0 0 4px #7969ef88' }} />
            <span style={{ position: 'absolute', right: '-5%', top: '35%', width: '10%', height: '29%', borderRadius: '20% 60% 60% 20%', background: 'linear-gradient(270deg,#6f62db,#d6ddff)', boxShadow: 'inset -1px 1px 1px #fff9,0 0 4px #7969ef88' }} />
          </>}
          <span style={{
            position: 'absolute',
            inset: 0,
            borderRadius: orb ? '50%' : '33%',
            background: shellPalette(mood),
            border: '1px solid rgba(206,239,255,.54)',
            boxShadow: orb
              ? 'inset 3px 4px 6px rgba(255,255,255,.42),inset -4px -6px 9px rgba(23,17,110,.5),0 5px 9px -4px rgba(36,31,116,.62),0 0 0 1px rgba(92,222,255,.2)'
              : 'inset 2px 3px 4px rgba(255,255,255,.4),inset -3px -5px 7px rgba(31,18,112,.52),0 5px 10px -5px rgba(27,18,92,.72)',
            transform: shellTransform,
            transformStyle: 'preserve-3d',
            transition: reducedMotion ? 'none' : 'transform 135ms ease-out,background 260ms ease,box-shadow 260ms ease',
            filter: hue ? `hue-rotate(${hue}deg)` : undefined,
            overflow: 'hidden',
          }}>
            <span style={{
              position: 'absolute',
              inset: orb ? '4% 13% 47% 13%' : '5% 10% 55% 10%',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at 45% 20%,rgba(255,255,255,.78),rgba(255,255,255,.18) 45%,transparent 72%)',
              filter: `blur(${Math.max(.3, size * .012)}px)`,
              opacity: .9,
            }} />
            {eyeStage}
            {orb && <>
              <span data-robo-mouth={mood} style={mouth()}>
                {mood === 'excited' && <span style={{ position: 'absolute', left: '23%', right: '23%', bottom: '5%', height: '31%', borderRadius: '50% 50% 45% 45%', background: '#ff5284' }} />}
              </span>
              {mood === 'sad' && <span style={{ position: 'absolute', left: '67%', top: '50%', width: '7%', height: '16%', borderRadius: '65% 25% 65% 55%', background: 'linear-gradient(#e8fbff,#53bfff)', boxShadow: '0 0 4px #8de7ff', transform: `translateY(${pulse ? 2 : 0}px) rotate(12deg)` }} />}
            </>}
          </span>
          {(mood === 'excited' || mood === 'love') && <>
            <span style={{ position: 'absolute', left: '-7%', top: '4%', width: '9%', height: '9%', background: '#fffbd1', transform: `rotate(45deg) scale(${pulse ? 1.18 : .76})`, boxShadow: '0 0 5px #d8ff9b', borderRadius: 1, transition: reducedMotion ? 'none' : 'transform 400ms ease' }} />
            <span style={{ position: 'absolute', right: '-5%', top: '19%', width: '6%', height: '6%', background: '#e3fbff', transform: `rotate(45deg) scale(${pulse ? .72 : 1.16})`, boxShadow: '0 0 5px #83eeff', borderRadius: 1, transition: reducedMotion ? 'none' : 'transform 400ms ease' }} />
          </>}
          {mood === 'thinking' && <span style={{ position: 'absolute', right: '-4%', top: '-8%', display: 'flex', gap: 2, alignItems: 'end' }}>
            {[3, 4, 5].map((dot, index) => <span key={dot} style={{ width: dot, height: dot, borderRadius: '50%', background: index === (pulse ? 2 : 1) ? '#d5ff82' : '#8ae8ff', boxShadow: '0 0 4px #70dfff', opacity: index === (pulse ? 2 : 1) ? 1 : .45, transition: reducedMotion ? 'none' : 'opacity 260ms' }} />)}
          </span>}
        </>
      ) : eyeStage}
    </span>
  );
}
