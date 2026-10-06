import type { ThinkingMode, ThinkingModeId } from '@/engine/types';

export const THINKING_MODES: ThinkingMode[] = [
  {
    id: 'quick',
    emoji: '⚡',
    label: 'Quick',
    description: 'Fast, direct answer with no extra ceremony.',
    steps: [
      'Answer directly and concisely.',
      'Skip preamble; lead with the most useful information.',
    ],
  },
  {
    id: 'smart',
    emoji: '🧠',
    label: 'Smart',
    description: 'A considered answer that checks its own reasoning.',
    steps: [
      'Briefly think through the request before answering.',
      'Consider the most likely intent and edge cases.',
      'Give a clear, well-structured answer.',
    ],
  },
  {
    id: 'advanced',
    emoji: '🚀',
    label: 'Advanced',
    description: 'Step-by-step analysis with alternatives weighed.',
    steps: [
      'Break the problem into its key parts.',
      'Reason step by step toward a solution.',
      'Evaluate at least two alternative approaches.',
      'Recommend the strongest option and justify it.',
    ],
  },
  {
    id: 'expert',
    emoji: '🧬',
    label: 'Expert',
    description: 'Deep, critical reasoning with self-review.',
    steps: [
      'Analyze the problem deeply and surface hidden assumptions.',
      'Think step by step and explore multiple solution paths.',
      'Stress-test each path for weaknesses, risks, and failure modes.',
      'Select and refine the optimal solution.',
      'Give specific, actionable recommendations and concrete next steps.',
    ],
  },
];

const BY_ID = new Map(THINKING_MODES.map((m) => [m.id, m]));

export function getThinkingMode(id: ThinkingModeId): ThinkingMode | undefined {
  return BY_ID.get(id);
}
