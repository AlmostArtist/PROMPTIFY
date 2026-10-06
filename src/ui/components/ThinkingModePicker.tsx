import { THINKING_MODES } from '@/data/thinkingModes';
import type { ThinkingModeId } from '@/engine/types';

export function ThinkingModePicker({
  value,
  onChange,
}: {
  value: ThinkingModeId | null;
  onChange: (v: ThinkingModeId | null) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {THINKING_MODES.map((mode) => {
        const active = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            title={mode.description}
            onClick={() => onChange(active ? null : mode.id)}
            className={[
              'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-colors duration-150',
              active
                ? 'border-transparent bg-[var(--pf-accent)] text-[var(--pf-accent-fg)]'
                : 'border-[var(--pf-border)] bg-[var(--pf-elev)] text-[var(--pf-muted)] hover:bg-[var(--pf-hover)] hover:text-[var(--pf-fg)]',
            ].join(' ')}
          >
            <span className="text-base leading-none">{mode.emoji}</span>
            <span className="text-[10px] font-medium">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
