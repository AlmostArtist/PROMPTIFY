// Starters for the Prompts tab's save sheet. Each one is a reusable skeleton:
// [VARIABLES] in capitals are filled in at insert time.

export const PROMPT_CATEGORIES = ['General', 'Writing', 'Coding', 'Image', 'Video', 'Research', 'Marketing'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export interface PromptStarter {
  id: string;
  label: string;
  category: PromptCategory;
  content: string;
}

export const PROMPT_STARTERS: PromptStarter[] = [
  { id: 'blank', label: 'Blank', category: 'General', content: '' },
  {
    id: 'expert', label: 'Expert role', category: 'General',
    content:
      'Act as a [ROLE] with [YEARS] years of experience.\n\n' +
      'Task: [TASK]\nContext: [CONTEXT]\n\n' +
      'Requirements:\n1. [REQUIREMENT]\n2. Ask me for anything critical that is missing before you start.\n\n' +
      'Output format: [FORMAT]',
  },
  {
    id: 'image', label: 'Image prompt', category: 'Image',
    content:
      '[SUBJECT], [ACTION], in [SETTING]. Shot on [CAMERA AND LENS], [LIGHTING] lighting, ' +
      '[COLOR PALETTE] palette, [STYLE] style, highly detailed.\n' +
      'Negative prompt: [AVOID]\nAspect ratio: [RATIO]',
  },
  {
    id: 'video', label: 'Video prompt', category: 'Video',
    content:
      'A [DURATION]-second shot of [SUBJECT] [MOTION] in [SETTING]. ' +
      'Camera: [CAMERA MOVE]. Lighting: [LIGHTING]. Mood: [MOOD]. Style: [STYLE].',
  },
  {
    id: 'code', label: 'Code task', category: 'Coding',
    content:
      'You are a senior [LANGUAGE] engineer.\n\n' +
      'Build or fix: [TASK]\nConstraints: [CONSTRAINTS]\n\n' +
      'Return complete, runnable code with error handling, then a short explanation of the key decisions.',
  },
  {
    id: 'writing', label: 'Writing', category: 'Writing',
    content:
      'Write a [FORMAT] for [AUDIENCE] about [TOPIC].\n' +
      'Tone: [TONE]. Length: [LENGTH].\nMust include: [KEY POINTS].',
  },
  {
    id: 'research', label: 'Research', category: 'Research',
    content:
      'Research [TOPIC] with a focus on [FOCUS].\n\n' +
      'Give me:\n1. A 3-sentence summary\n2. Key findings, each with its source\n3. Open questions and what to read next',
  },
];

/** `[UPPER CASE]` or `{{name}}` placeholders. Lowercase [links](…) are ignored. */
const VAR_RE = /\[([A-Z][A-Z0-9 /&_-]{0,30})\]|\{\{\s*([\w ]{1,30}?)\s*\}\}/g;

export function promptVariables(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) found.add((m[1] ?? m[2]).trim());
  return [...found];
}

/** Replace each variable that has a value; unfilled ones stay as placeholders. */
export function fillPromptVariables(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (whole, a: string | undefined, b: string | undefined) => {
    const v = values[(a ?? b ?? '').trim()]?.trim();
    return v ? v : whole;
  });
}
