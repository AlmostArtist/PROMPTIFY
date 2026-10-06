// Core domain types shared by the engine, data catalogs, and UI.

export type RoleCategory =
  | 'Custom'
  | 'Developer'
  | 'Creative'
  | 'AI & Data'
  | 'Content'
  | 'Design'
  | 'Business';

export interface Role {
  id: string;
  emoji: string;
  label: string;
  category: RoleCategory;
  /** Plugged into "Act as a {headline}." */
  headline: string;
  /** Bulleted areas of expertise injected under "You specialize in:". */
  specialties: string[];
  /** Section name this role owns when stacked with others. */
  deliverable: string;
}

export type ThinkingModeId = 'quick' | 'smart' | 'advanced' | 'expert';

export interface ThinkingMode {
  id: ThinkingModeId;
  emoji: string;
  label: string;
  description: string;
  /** Reasoning directives injected before the answer. */
  steps: string[];
}

export type OutputFormatId =
  | 'bullets'
  | 'report'
  | 'table'
  | 'blog'
  | 'script'
  | 'strategy'
  | 'code'
  | 'brief'
  | 'social';

export interface OutputFormat {
  id: OutputFormatId;
  emoji: string;
  label: string;
  /** Formatting directive block appended near the end of the prompt. */
  instruction: string;
}

/** Everything the user can configure before forging a prompt. */
export interface PromptConfig {
  /** Selected roles. One role = single persona, multiple = stacked panel. */
  roleIds: string[];
  thinkingMode: ThinkingModeId | null;
  /** 0 = strictly logical, 100 = maximally creative. */
  creativity: number;
  outputFormat: OutputFormatId | null;
  /** Wrap terse prompts in a rigor-boosting enhancer block. */
  booster: boolean;
}

export const DEFAULT_CONFIG: PromptConfig = {
  roleIds: [],
  thinkingMode: null,
  creativity: 50,
  outputFormat: null,
  booster: true,
};

/** A user-created prompt tool with custom instructions. */
export interface CustomTool {
  id: string;
  label: string;
  blurb: string;
  /** System instruction sent to the AI — {prompt} is replaced with the user prompt. */
  instruction: string;
  /** How the result is handled: 'replace' updates the prompt box, 'show' displays the result. */
  behavior: 'replace' | 'show';
  /** Single letter mark for the card display. */
  mark: string;
  /** Gradient index (0–4) for the card background. */
  coverIndex: number;
}

/** A user-saved prompt that can be recalled quickly via the // mention shortcut. */
export interface SavedPrompt {
  id: string;
  /** Short user-visible name for the prompt. */
  label: string;
  /** The full prompt text that gets inserted. */
  content: string;
  /** Epoch ms when saved. */
  ts: number;
}
