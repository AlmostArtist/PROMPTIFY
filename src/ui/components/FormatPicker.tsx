import { OUTPUT_FORMATS } from '@/data/outputFormats';
import type { OutputFormatId } from '@/engine/types';
import { Chip } from './primitives';

export function FormatPicker({
  value,
  onChange,
}: {
  value: OutputFormatId | null;
  onChange: (v: OutputFormatId | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OUTPUT_FORMATS.map((fmt) => {
        const active = value === fmt.id;
        return (
          <Chip
            key={fmt.id}
            active={active}
            onClick={() => onChange(active ? null : fmt.id)}
            title={fmt.instruction}
          >
            <span>{fmt.emoji}</span>
            <span>{fmt.label}</span>
          </Chip>
        );
      })}
    </div>
  );
}
