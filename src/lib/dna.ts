// Prompt DNA — the "reverse compiler" for AI images. A vision model breaks an
// image down into the eleven genes below; the user can edit any gene and the
// reusable prompt is re-assembled locally (no extra AI call) for each target.
import { str, strList } from './json';

export const DNA_GENES = [
  { key: 'subject',     label: 'Subject',     hint: 'Who / what, pose, action, key details' },
  { key: 'composition', label: 'Composition', hint: 'Framing, shot size, angle, placement' },
  { key: 'camera',      label: 'Camera',      hint: 'Body / format, movement, viewpoint' },
  { key: 'lens',        label: 'Lens',        hint: 'Focal length, aperture, depth of field' },
  { key: 'lighting',    label: 'Lighting',    hint: 'Key / fill / rim, quality, direction, time' },
  { key: 'materials',   label: 'Materials',   hint: 'Surfaces, textures, finishes' },
  { key: 'environment', label: 'Environment', hint: 'Setting, background, atmosphere' },
  { key: 'motion',      label: 'Motion',      hint: 'Movement, blur, camera move (for video)' },
  { key: 'color',       label: 'Color',       hint: 'Palette, grade, contrast' },
  { key: 'style',       label: 'Style',       hint: 'Medium, era, references, render quality' },
  { key: 'negative',    label: 'Negative',    hint: 'What to avoid' },
] as const;

export type DnaKey = (typeof DNA_GENES)[number]['key'];
export type Dna = Record<DnaKey, string>;

export interface DnaResult {
  dna: Dna;
  /** The model's own one-paragraph reusable prompt. */
  prompt: string;
  /** Swappable slots the model found, e.g. "[PRODUCT]". */
  variables: string[];
  title: string;
}

export function parseDna(o: Record<string, unknown> | null): DnaResult | null {
  if (!o) return null;
  const genes = (o.dna && typeof o.dna === 'object' ? o.dna : o) as Record<string, unknown>;
  const dna = Object.fromEntries(DNA_GENES.map((g) => [g.key, str(genes[g.key])])) as Dna;
  const filled = DNA_GENES.filter((g) => dna[g.key]).length;
  if (filled < 4) return null;
  return {
    dna,
    prompt: str(o.prompt),
    variables: strList(o.variables),
    title: str(o.title) || 'Untitled DNA',
  };
}

export type DnaTarget = 'universal' | 'midjourney' | 'sdxl' | 'video' | 'json';

export const DNA_TARGETS: { id: DnaTarget; label: string }[] = [
  { id: 'universal',  label: 'Universal' },
  { id: 'midjourney', label: 'Midjourney' },
  { id: 'sdxl',       label: 'SD / Flux' },
  { id: 'video',      label: 'Video' },
  { id: 'json',       label: 'JSON' },
];

const sentence = (s: string) => {
  const t = s.trim().replace(/[.\s]+$/, '');
  return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : '';
};

/** Deterministically compile DNA into a prompt for the chosen generator. */
export function compileDna(dna: Dna, target: DnaTarget): string {
  const d = dna;
  switch (target) {
    case 'json':
      return JSON.stringify(d, null, 2);

    case 'midjourney': {
      const parts = [d.subject, d.environment, d.composition, d.lighting, d.materials, d.color, d.camera, d.lens, d.style]
        .map((s) => s.trim())
        .filter(Boolean);
      const neg = d.negative.trim() ? ` --no ${d.negative.replace(/\.$/, '')}` : '';
      return `${parts.join(', ')}${neg} --style raw --v 7`;
    }

    case 'sdxl': {
      const positive = [d.subject, d.style, d.environment, d.composition, d.lighting, d.materials, d.color, `${d.camera} ${d.lens}`.trim()]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');
      const negative = d.negative.trim() || 'blurry, low quality, watermark, text, deformed';
      return `PROMPT: ${positive}, highly detailed, sharp focus\nNEGATIVE: ${negative}`;
    }

    case 'video':
      return [
        sentence(d.subject),
        d.environment && sentence(`Set in ${d.environment}`),
        d.motion && sentence(`Motion: ${d.motion}`),
        (d.camera || d.lens) && sentence(`Camera: ${[d.camera, d.lens].filter(Boolean).join(', ')}`),
        d.composition && sentence(`Framing: ${d.composition}`),
        d.lighting && sentence(`Lighting: ${d.lighting}`),
        d.color && sentence(`Color grade: ${d.color}`),
        d.style && sentence(`Style: ${d.style}`),
        d.negative && sentence(`Avoid: ${d.negative}`),
      ]
        .filter(Boolean)
        .join(' ');

    case 'universal':
    default:
      return [
        sentence(d.subject),
        d.composition && sentence(`Composition: ${d.composition}`),
        (d.camera || d.lens) && sentence(`Shot on ${[d.camera, d.lens].filter(Boolean).join(', ')}`),
        d.lighting && sentence(`Lighting: ${d.lighting}`),
        d.materials && sentence(`Materials and textures: ${d.materials}`),
        d.environment && sentence(`Environment: ${d.environment}`),
        d.motion && sentence(`Motion: ${d.motion}`),
        d.color && sentence(`Color: ${d.color}`),
        d.style && sentence(`Style: ${d.style}`),
        d.negative && sentence(`Avoid: ${d.negative}`),
      ]
        .filter(Boolean)
        .join(' ');
  }
}
