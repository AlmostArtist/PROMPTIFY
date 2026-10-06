import type { OutputFormat, OutputFormatId } from '@/engine/types';

export const OUTPUT_FORMATS: OutputFormat[] = [
  {
    id: 'bullets',
    emoji: '📋',
    label: 'Bullet Points',
    instruction:
      'Respond as a tight, scannable bulleted list. One idea per bullet, no filler sentences.',
  },
  {
    id: 'report',
    emoji: '📄',
    label: 'Hiring Report',
    instruction:
      'Respond as a professional hiring report with clear section headings, a short summary at the top, and key takeaways / recommendations at the end.',
  },
  {
    id: 'table',
    emoji: '📊',
    label: 'Candidate Table',
    instruction:
      'Respond as a Markdown table with clearly labeled columns (e.g. candidate, strengths, gaps, fit). Add a one-line note under the table only if essential.',
  },
  {
    id: 'blog',
    emoji: '📝',
    label: 'Job Post',
    instruction:
      'Respond as a ready-to-post job description: a compelling hook, About the role, Responsibilities, Requirements, Nice-to-haves, and What we offer. Welcoming and bias-free.',
  },
  {
    id: 'script',
    emoji: '🎤',
    label: 'Interview Kit',
    instruction:
      'Respond as an interview kit: the competencies to assess, grouped questions (skill + behavioral), and a simple scoring rubric for each section.',
  },
  {
    id: 'strategy',
    emoji: '📈',
    label: 'Hiring Plan',
    instruction:
      'Respond as an actionable hiring plan: the goal, stages broken into phases, concrete steps, owners, success metrics, and risks to watch.',
  },
  {
    id: 'code',
    emoji: '✉️',
    label: 'Email / InMail',
    instruction:
      'Respond as a ready-to-send recruiting message: a strong subject line, a warm and concise body, and a clear, low-friction call to action.',
  },
  {
    id: 'brief',
    emoji: '🗂️',
    label: 'Scorecard',
    instruction:
      'Respond as an interview scorecard: the role, the key competencies to evaluate, what "strong" looks like for each, and a rating scale.',
  },
  {
    id: 'social',
    emoji: '📱',
    label: 'Social Job Ad',
    instruction:
      'Respond as a ready-to-post social hiring ad: a scroll-stopping first line, a tight pitch for the role, a clear CTA to apply, and a short set of relevant hashtags.',
  },
];

const BY_ID = new Map(OUTPUT_FORMATS.map((f) => [f.id, f]));

export function getOutputFormat(id: OutputFormatId): OutputFormat | undefined {
  return BY_ID.get(id);
}
