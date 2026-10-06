import type { ReactNode } from 'react';

/** A labelled block within the panel body. */
export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-[var(--pf-muted)]">{title}</h3>
          {hint && <span className="text-[10px] text-[var(--pf-faint)]">{hint}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Pill-shaped select chip. */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 border',
        active
          ? 'border-transparent bg-[var(--pf-accent)] text-[var(--pf-accent-fg)] font-medium'
          : 'border-[var(--pf-border)] bg-[var(--pf-elev)] text-[var(--pf-muted)] hover:bg-[var(--pf-hover)] hover:text-[var(--pf-fg)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** Compact on/off switch (Headless-UI style — reliable knob travel). */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--pf-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
        on ? 'bg-[var(--pf-accent)]' : 'bg-white/15 ring-1 ring-inset ring-[var(--pf-border)]',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out',
          on ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

/** Small ghost icon button. */
export function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg text-[var(--pf-muted)] transition-colors hover:bg-[var(--pf-hover)] hover:text-[var(--pf-fg)]"
    >
      {children}
    </button>
  );
}
