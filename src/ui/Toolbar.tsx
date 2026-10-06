import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThemePreferences } from './hooks/useThemePreferences';
import type { BackendHealth } from './hooks/useBackendHealth';
import { RoboEyes, type RoboEyesMood } from './RoboEyes';
import { useRobotPreferences } from './hooks/useRobotPreferences';

export interface ForgeStatus {
  kind: 'ok' | 'warn' | 'busy';
  message: string;
}

interface ToolbarProps {
  onEnhance: () => void;
  onEnhanceTranslate: () => void;
  enhancing: boolean;
  status: ForgeStatus | null;
  health: BackendHealth;
  onOpenPanel: () => void;
  findInput: () => HTMLElement | null;
}

const ANCHOR_ATTR = 'data-promptify-anchor';
const SEND_BUTTON_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[aria-label*="Send" i]',
  'button[aria-label*="Submit" i]',
  'button[type="submit"]',
].join(',');

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Walk up from the prompt input to a safe, non-editable container that
 * represents the visible "prompt bar" — the box that also holds the send
 * button. We must NOT inject inside a contenteditable region (it would
 * corrupt the editor), so climb past any editable ancestors.
 */
function findComposerWrapper(input: HTMLElement): HTMLElement {
  const inputRect = input.getBoundingClientRect();
  let parent = input.parentElement;
  let fallback = parent ?? input;
  let depth = 0;

  // Prefer the outermost compact composer surface. Claude and Gemini wrap the
  // editable in several layers, while ChatGPT usually exposes a nearby form.
  // Stopping before a tall conversation container prevents the anchor from
  // becoming relative to the whole page.
  while (parent && parent !== document.body && depth < 8) {
    if (!parent.isContentEditable && parent.getAttribute('contenteditable') !== 'true') {
      const rect = parent.getBoundingClientRect();
      const compact = rect.width >= Math.min(inputRect.width, 180) && rect.height >= 34 && rect.height <= 240;
      if (compact) fallback = parent;
      if (compact && parent.querySelector(SEND_BUTTON_SELECTOR)) return parent;
      if (compact && parent.tagName === 'FORM') return parent;
    }
    parent = parent.parentElement;
    depth += 1;
  }
  return fallback;
}

/**
 * Enhancer button injected directly into the host page's prompt bar.
 *
 * Why this finally stays put: the button is a REAL child of the prompt-bar
 * DOM (positioned `absolute` inside it), not a floating overlay tracking the
 * textarea's coordinates. The browser lays it out together with the bar in a
 * single paint, so when you scroll the conversation the button moves with the
 * bar with ZERO lag — there is no JS in the scroll path at all. It sits beside
 * the send button and never drifts.
 *
 * All styling is inline (set via CSSOM by React), never a stylesheet — this
 * sidesteps strict `style-src` CSP on sites like ChatGPT/Claude.
 */
export default function Toolbar({
  onEnhance,
  onEnhanceTranslate,
  enhancing,
  status,
  health,
  onOpenPanel,
  findInput,
}: ToolbarProps) {
  const appearance = useThemePreferences();
  const { preferences: robot } = useRobotPreferences();
  const [focused, setFocused] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [hover, setHover]   = useState(false);
  const [press, setPress]   = useState(false);
  const [typingMood, setTypingMood] = useState<RoboEyesMood | null>(null);
  const [buttonSize, setButtonSize] = useState(40);
  const anchorRef = useRef<HTMLElement | null>(null);
  const rafRef    = useRef(0);
  const typingTimerRef = useRef<number>();
  const typingCountRef = useRef(0);
  // On macOS, Option+Click may not propagate `altKey` to the `click` event
  // reliably (the browser/OS can intercept it). We capture it from `mousedown`
  // instead, which always fires.
  const altRef    = useRef(false);

  // Keep the anchor attached to the current prompt bar. Runs each frame, but
  // only mutates the DOM when something actually changed (cheap no-op otherwise).
  // IMPORTANT: depends only on `findInput` (stable) so the rAF effect mounts
  // ONCE. `setAnchor` uses a functional update that returns the same ref when
  // unchanged, so steady-state frames cause no re-render.
  const sync = useCallback(() => {
    const input = findInput();

    if (!input) {
      if (anchorRef.current?.isConnected) anchorRef.current.remove();
      anchorRef.current = null;
      setAnchor((prev) => (prev ? null : prev));
      return;
    }

    const wrapper = findComposerWrapper(input);
    const inputRect = input.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const availableHeight = Math.max(inputRect.height, Math.min(wrapperRect.height, 54));
    const nextSize = Math.round(clamp(availableHeight - 10, 26, 40));

    // The wrapper needs a positioning context for our absolute button.
    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }

    let a = anchorRef.current;
    if (!a) {
      a = document.createElement('div');
      a.setAttribute(ANCHOR_ATTR, '');
      // Zero-size point pinned to the right-centre of the bar, beside the
      // send button. The button itself renders inside this anchor.
      a.style.cssText =
        'position:absolute;top:50%;right:10px;transform:translateY(-50%);' +
        'width:40px;height:40px;z-index:2147483646;pointer-events:none;';
      anchorRef.current = a;
    }

    // (Re)attach if the host framework re-rendered the bar and dropped our node.
    if (a.parentElement !== wrapper) {
      wrapper.appendChild(a);
    }

    const sendButtons = Array.from(wrapper.querySelectorAll<HTMLElement>(SEND_BUTTON_SELECTOR))
      .filter(button => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return rect.width >= 20 && rect.height >= 20 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right);
    const sendRect = sendButtons[0]?.getBoundingClientRect();
    const inputCenter = inputRect.top + inputRect.height / 2;
    const sendNearInput = sendRect && sendRect.top < inputRect.bottom + 18 && sendRect.bottom > inputRect.top - 18;
    const right = sendNearInput
      ? Math.max(6, wrapperRect.right - sendRect.left + 7)
      : Math.max(7, wrapperRect.right - inputRect.right + 7);
    const top = clamp(inputCenter - wrapperRect.top, nextSize / 2 + 4, wrapperRect.height - nextSize / 2 - 4);

    a.style.width = `${nextSize}px`;
    a.style.height = `${nextSize}px`;
    a.style.right = `${Math.round(right)}px`;
    a.style.top = `${Math.round(top)}px`;
    setButtonSize(current => current === nextSize ? current : nextSize);

    // Render the portal into the current anchor (no-op once stable).
    setAnchor((prev) => (prev === a ? prev : a));
  }, [findInput]);

  useEffect(() => {
    const loop = () => { sync(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      anchorRef.current?.remove();
      anchorRef.current = null;
    };
  }, [sync]);

  // Give the character a small, readable reaction to the user's writing. The
  // reaction is deliberately brief so a manually selected expression remains
  // the robot's resting personality rather than being overwritten.
  useEffect(() => {
    const isPromptTarget = (target: EventTarget | null) => {
      const input = findInput();
      return Boolean(input && target instanceof Node && (target === input || input.contains(target)));
    };

    const react = (mood: RoboEyesMood) => {
      window.clearTimeout(typingTimerRef.current);
      setTypingMood(mood);
      typingTimerRef.current = window.setTimeout(() => setTypingMood(null), 760);
    };

    const onInput = (event: Event) => {
      if (!isPromptTarget(event.target)) return;
      const inputEvent = event as InputEvent;
      const characters = inputEvent.data ?? '';
      typingCountRef.current += 1;

      if (inputEvent.inputType.includes('delete')) react('angry');
      else if (characters.includes('?')) react('curious');
      else if (characters.includes('!')) react('excited');
      else if (/[,.]/.test(characters)) react('happy');
      else {
        const rhythm: RoboEyesMood[] = ['happy', 'curious', 'excited', 'mischievous', 'surprised', 'love'];
        react(rhythm[Math.floor(typingCountRef.current / 4) % rhythm.length]);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPromptTarget(event.target)) return;
      if (event.key === 'Backspace' || event.key === 'Delete') react('angry');
      else if (event.key === 'Enter' && !event.shiftKey) react('excited');
    };

    window.addEventListener('input', onInput, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.clearTimeout(typingTimerRef.current);
    };
  }, [findInput]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onOpenPanel(); },
    [onOpenPanel],
  );

  if (!anchor) return null;

  const online = health.state === 'online';
  const scale = appearance.reducedMotion ? 1 : press ? .97 : hover ? 1.04 : 1;
  const automaticMood: RoboEyesMood = status?.kind === 'ok'
      ? 'excited'
      : status?.kind === 'warn'
        ? 'sad'
        : !online
          ? 'sleepy'
        : press
          ? 'mischievous'
          : hover || focused
            ? 'curious'
            : 'neutral';
  const eyesMood: RoboEyesMood = enhancing || status?.kind === 'busy'
    ? 'thinking'
    : typingMood
      ? typingMood
    : robot.expression === 'auto'
      ? automaticMood
      : robot.expression;

  return createPortal(
    <>
      {status && (
        <div
          style={{
            position: 'absolute',
            right: 'calc(100% + 8px)',
            top: '50%',
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background: appearance.tokens['--p-surface'],
            color: appearance.tokens['--p-text-1'],
            font: "500 12px/1.3 -apple-system,'Inter',system-ui,sans-serif",
            padding: '6px 12px',
            borderRadius: 9,
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
          }}
        >
          {status.message}
        </div>
      )}

      <button
        type="button"
        onClick={() => { altRef.current ? onEnhanceTranslate() : onEnhance(); altRef.current = false; }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPress(false); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={enhancing ? "Enhancing prompt" : "Enhance prompt"}
        onMouseDown={(e) => { altRef.current = e.altKey; setPress(true); }}
        onMouseUp={() => setPress(false)}
        disabled={enhancing}
        title={enhancing ? 'Enhancing…' : 'Click: Enhance · ⌥+Click: Translate to English · Right-click: Panel'}
        style={{
          position: 'relative',
          width: buttonSize,
          height: buttonSize,
          border: 'none',
          borderRadius: '50%',
          padding: 0,
          margin: 0,
          cursor: enhancing ? 'wait' : 'pointer',
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
          color: appearance.tokens['--p-primary-fg'],
          outline: focused ? `2px solid ${appearance.tokens['--theme-accent-text']}` : 'none',
          outlineOffset: 3,
          boxShadow: 'none',
          pointerEvents: 'auto',
          WebkitAppearance: 'none',
          appearance: 'none',
          transform: `scale(${scale})`,
          transition: appearance.reducedMotion ? 'none' : 'transform .12s ease',
        }}
      >
        <RoboEyes
          size={buttonSize - 4}
          mood={eyesMood}
          variant="orb"
          color="currentColor"
          hue={robot.hue}
          movement={robot.movement}
          trackPointer={!enhancing}
          reducedMotion={appearance.reducedMotion}
        />
      </button>
    </>,
    anchor,
  );
}
