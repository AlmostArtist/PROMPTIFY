function label(v: number): string {
  if (v <= 20) return 'Logical';
  if (v <= 45) return 'Grounded';
  if (v <= 65) return 'Balanced';
  if (v <= 85) return 'Inventive';
  return 'Creative';
}

export function CreativitySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-[var(--pf-muted)]">{label(value)}</span>
        <span className="font-medium text-[var(--pf-fg)]">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pf-range w-full"
        aria-label="Creativity level"
      />
    </div>
  );
}
