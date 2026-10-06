// The "Human tone" backend prompt. When enabled in the Prompts tab, this block
// is prepended to any prompt the user inserts, so the AI writes like a real
// person instead of producing AI slop. Adapted from the human-voice template.

export const HUMAN_TONE_LABEL = 'Human tone';

export const HUMAN_TONE_PROMPT = [
  'Write like a real person actually typed this — not like an AI assistant. Follow these rules strictly:',
  '',
  '- Vary sentence length and rhythm: mix short, punchy lines with longer ones. Do not start sentences the same way (no repeated "Additionally", "Furthermore", "Moreover", "In conclusion"). Use contractions. Short fragments are fine.',
  '- Never use these AI-tell words/phrases: delve, leverage, robust, seamless, streamline, unlock, unleash, elevate, game-changer, cutting-edge, "in today\'s world/landscape", "in the realm of", "it\'s important to note", "navigate the complexities", holistic, tapestry, "testament to", bustling, boasts, embark, foster, paramount, plethora, myriad, ever-evolving, "dive into"/"deep dive", harness, "the bottom line is", "at the end of the day", "when it comes to", "that being said", "needless to say", "I hope this helps", "I hope this email finds you well", "circle back", "touch base", vague "align/alignment", synergy, "not only... but also", and chains of em-dashes.',
  '- Prose first. Do not default to bullet lists or a tidy intro / 3-points / conclusion structure unless the content genuinely is a list. Do not restate the request, and do not add a summary paragraph unless asked.',
  '- Be specific and concrete instead of vague. If a detail is missing, leave it out or ask — do not pad with abstractions.',
  '- Match the tone to the real relationship and context. Skip generic openers ("I hope this finds you well") and closers ("Looking forward to hearing from you"). Start where a real person would, and do not reach for fancy synonyms when a plain word works.',
  '',
  'Now do this:',
].join('\n');

/** Prepend the human-tone block to a prompt when the toggle is on. */
export function withHumanTone(content: string, enabled: boolean): string {
  return enabled ? `${HUMAN_TONE_PROMPT}\n\n${content}` : content;
}
