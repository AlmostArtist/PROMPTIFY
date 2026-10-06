/**
 * Pull the first JSON object out of a model reply. Free models often wrap JSON
 * in code fences or add a sentence before/after it, so we strip fences and
 * slice from the first `{` to the last `}` before parsing.
 */
export function parseJsonLoose<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const raw = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Common free-model slip: trailing commas before } or ].
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')) as T;
    } catch {
      return null;
    }
  }
}

/** Coerce an unknown JSON value to a trimmed string. */
export function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return '';
}

/** Coerce an unknown JSON value to a string array. */
export function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  return s ? [s] : [];
}

/** Coerce an unknown JSON value to a number array (ids, source refs). */
export function numList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}
