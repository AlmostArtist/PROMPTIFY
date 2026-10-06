import { useThemePreferences } from '../hooks/useThemePreferences';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AiTask, EnhanceSubMode } from '@/lib/messages';
import { RoboEyes } from '../RoboEyes';

export type QuickActionKind = 'enhance' | 'tone' | 'translate';

interface QuickActionPopoverProps {
  kind: QuickActionKind;
  theme: 'light' | 'dark';
  /** Bounding rect of the prompt box, captured when the popover opened. */
  anchorRect: DOMRect;
  busy: boolean;
  onRun: (task: AiTask, subModes?: EnhanceSubMode[]) => void;
  onClose: () => void;
}

interface Choice {
  task: AiTask;
  label: string;
  hint: string;
}

const ENHANCE_VARIANTS: Choice[] = [
  { task: 'enhance-concise', label: 'Concise', hint: 'Tight, high-signal prompt' },
  { task: 'enhance-detailed', label: 'Detailed', hint: 'Thorough, fully-specified prompt' },
  { task: 'enhance-structured', label: 'Structured', hint: 'Labelled Role / Task / Output sections' },
];

const SUB_MODES: { id: EnhanceSubMode; label: string }[] = [
  { id: 'formal', label: 'Formal' },
  { id: 'eli5', label: 'ELI5' },
  { id: 'power', label: 'Power' },
  { id: 'translate-en', label: 'Translate→EN' },
];

const TONES: Choice[] = [
  { task: 'tone-professional', label: 'Professional', hint: 'Polished and businesslike' },
  { task: 'tone-friendly', label: 'Friendly', hint: 'Warm and approachable' },
  { task: 'tone-assertive', label: 'Assertive', hint: 'Direct and confident' },
  { task: 'tone-diplomatic', label: 'Diplomatic', hint: 'Tactful and even-handed' },
  { task: 'tone-casual', label: 'Casual', hint: 'Relaxed and conversational' },
  { task: 'tone-technical', label: 'Technical', hint: 'Precise and exact' },
];

const LANGUAGE_TOOLS: Choice[] = [
  { task: 'translate-english', label: 'Translate to English', hint: 'Natural English from any language or mixed script' },
  { task: 'fix-english-grammar', label: 'Fix English grammar', hint: 'Correct grammar and spelling without changing your voice' },
];

const POPOVER_WIDTH = 268;

/**
 * Transient menu anchored above the host page's prompt bar, opened by a keyboard
 * shortcut. All styling is inline (no stylesheet/utility classes) so it renders
 * identically whether or not the host page's CSP allows our styles, and the
 * colours are driven by the captured host theme. It closes on Escape, outside
 * click, scroll, or resize — so we never need to track the bar's coordinates.
 */
export default function QuickActionPopover({
  kind,
  anchorRect,
  busy,
  onRun,
  onClose,
}: QuickActionPopoverProps) {
  const appearance = useThemePreferences();
  const t = appearance.tokens;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [subModes, setSubModes] = useState<EnhanceSubMode[]>([]);
  const [enter, setEnter] = useState(false);
  const [top, setTop] = useState(8);

  // Close on Escape / outside click / scroll / resize. The popover is short-lived,
  // so we never reposition it — we just dismiss if the page moves under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onDocPointer = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDocPointer, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDocPointer, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose, true);
    };
  }, [onClose]);

  // Measure once so composers near the top open below instead of pushing the
  // menu outside the viewport. Normal bottom-docked composers still open above.
  useLayoutEffect(() => {
    const height = rootRef.current?.getBoundingClientRect().height ?? 0;
    const above = anchorRect.top - height - 8;
    const below = Math.min(anchorRect.bottom + 8, window.innerHeight - height - 8);
    setTop(Math.round(Math.max(8, above >= 8 ? above : below)));
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, [anchorRect]);

  const toggleSub = (id: EnhanceSubMode) =>
    setSubModes((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  const choices = kind === 'enhance' ? ENHANCE_VARIANTS : kind === 'tone' ? TONES : LANGUAGE_TOOLS;
  const title = kind === 'enhance' ? 'Prompt Enhancer' : kind === 'tone' ? 'Tone Shifter' : 'Translation & English';
  const shortcut = kind === 'enhance' ? '⌘/Ctrl ↑' : kind === 'tone' ? '⌘/Ctrl ↓' : '⌘/Ctrl →';

  // Anchor the card just above the prompt bar, clamped into the viewport.
  const left = Math.round(
    Math.max(8, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - 8)),
  );

  const c = { bg: t['--p-surface'], border: t['--p-border'], text: t['--p-text-1'], sub: t['--p-text-2'], rowBg: t['--p-surface-2'], rowHover: t['--p-bg'], chipBg: t['--p-surface-2'], chipText: t['--p-text-1'], accent: t['--p-primary'], accentFg: t['--p-primary-fg'], shadow: t['--p-shadow-md'] };

  return createPortal(
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        left,
        top,
        width: POPOVER_WIDTH,
        zIndex: 2147483647,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: appearance.preferences.radius,
        boxShadow: c.shadow,
        padding: 12,
        font: `${appearance.preferences.fontSize}px/1.4 ${t['--theme-font']}`,
        color: c.text,
        boxSizing: 'border-box',
        opacity: enter || appearance.reducedMotion ? 1 : 0,
        transform: enter || appearance.reducedMotion ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.98)',
        transformOrigin: anchorRect.top > top ? 'bottom left' : 'top left',
        transition: appearance.reducedMotion ? 'none' : 'opacity .14s ease, transform .16s ease',
        pointerEvents: busy ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <RoboEyes
          size={24}
          mood={kind === 'enhance' ? 'excited' : kind === 'tone' ? 'mischievous' : 'thinking'}
          variant="eyes-only"
          color={c.text}
          trackPointer
          reducedMotion={appearance.reducedMotion}
        />
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {title}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: c.sub }}>
          {busy ? 'Rewriting…' : shortcut}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {choices.map((choice) => (
          <Row
            key={choice.task}
            label={choice.label}
            hint={choice.hint}
            colors={c}
            disabled={busy}
            onClick={() => onRun(choice.task, kind === 'enhance' ? subModes : undefined)}
          />
        ))}
      </div>

      {kind === 'enhance' && (
        <>
          <div style={{ fontSize: 11, color: c.sub, margin: '12px 2px 7px' }}>Add a twist</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUB_MODES.map((sm) => {
              const on = subModes.includes(sm.id);
              return (
                <button
                  key={sm.id}
                  type="button"
                  onClick={() => toggleSub(sm.id)}
                  style={{
                    border: `1px solid ${on ? c.accent : c.border}`,
                    background: on ? c.accent : c.chipBg,
                    color: on ? c.accentFg : c.chipText,
                    borderRadius: 999,
                    padding: '5px 11px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                  }}
                >
                  {sm.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function Row({
  label,
  hint,
  colors,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  colors: { rowBg: string; rowHover: string; text: string; sub: string };
  disabled: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        textAlign: 'left',
        width: '100%',
        border: 'none',
        background: hover ? colors.rowHover : colors.rowBg,
        color: colors.text,
        borderRadius: 11,
        padding: '8px 11px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.12s ease, transform 0.12s ease',
        transform: hover && !disabled ? 'translateX(2px)' : 'none',
        WebkitAppearance: 'none',
        appearance: 'none',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 11.5, color: colors.sub }}>{hint}</span>
    </button>
  );
}
