import type { PromptConfig, Role } from './types';
import { getRoles } from '@/data/roles';
import { getThinkingMode } from '@/data/thinkingModes';
import { getOutputFormat } from '@/data/outputFormats';
import { describeCreativity } from '@/data/creativity';

export interface BuildResult {
  /** The fully assembled prompt ready to write back into the page. */
  prompt: string;
  /** Human-readable list of applied layers for the UI summary / analytics. */
  layers: string[];
}

/** Drop empty/whitespace-only sections, then join with blank lines. */
function stitch(sections: Array<string | null | undefined>): string {
  return sections
    .map((s) => (s ? s.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}

function bulletize(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join('\n');
}

/** Single persona vs. stacked expert panel. */
function buildRoleSection(roles: Role[]): string {
  if (roles.length === 0) return '';

  if (roles.length === 1) {
    const r = roles[0];
    return stitch([
      `Act as a ${r.headline}.`,
      `You specialize in:\n${bulletize(r.specialties)}`,
    ]);
  }

  const numbered = roles
    .map((r, i) => `${i + 1}. ${capitalize(r.headline)}`)
    .join('\n');

  return stitch([
    `Act simultaneously as a panel of experts:\n${numbered}`,
    'Analyze the request from every one of these perspectives. Let the experts build on and challenge each other, then converge on one coherent recommendation.',
  ]);
}

/** Deliverables block — only meaningful when multiple roles are stacked. */
function buildDeliverablesSection(roles: Role[]): string {
  if (roles.length < 2) return '';
  const deliverables = roles.map((r) => `${r.deliverable} (from the ${r.label})`);
  return stitch([
    `Provide:\n${bulletize(deliverables)}`,
    'Finish with a single combined recommendation that reconciles all perspectives.',
  ]);
}

function buildThinkingSection(modeId: PromptConfig['thinkingMode']): string {
  if (!modeId) return '';
  const mode = getThinkingMode(modeId);
  if (!mode) return '';
  return `Before answering (${mode.label} mode):\n${mode.steps
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')}`;
}

function buildCreativitySection(creativity: number): string {
  const { headline, directives } = describeCreativity(creativity);
  return stitch([`Creativity level: ${creativity}%. ${headline}`, bulletize(directives)]);
}

function buildBoosterSection(): string {
  return stitch([
    'Treat the request below with maximum rigor:',
    bulletize([
      'If it is terse or vague, infer the most useful complete version of what is being asked.',
      'State any key assumptions in one short line, then proceed — do not stall asking for clarification unless truly blocked.',
      'Deliver professional-grade output, not a generic first draft.',
    ]),
  ]);
}

function buildFormatSection(formatId: PromptConfig['outputFormat']): string {
  if (!formatId) return '';
  const fmt = getOutputFormat(formatId);
  return fmt ? `Output format:\n${fmt.instruction}` : '';
}

/**
 * The core injection function: turn the user's raw prompt + their selected
 * layers into a single expert-grade prompt. Deterministic and offline — no
 * network or API key required.
 */
export function buildPrompt(rawPrompt: string, config: PromptConfig): BuildResult {
  const roles = getRoles(config.roleIds);
  const trimmed = rawPrompt.trim();
  const requestLabel = roles.length > 0 ? 'User Request:' : 'Request:';

  const prompt = stitch([
    buildRoleSection(roles),
    config.booster ? buildBoosterSection() : '',
    buildThinkingSection(config.thinkingMode),
    buildCreativitySection(config.creativity),
    `${requestLabel}\n${trimmed}`,
    buildFormatSection(config.outputFormat),
    buildDeliverablesSection(roles),
  ]);

  return { prompt, layers: summarizeLayers(config, roles) };
}

export function summarizeLayers(config: PromptConfig, roles?: Role[]): string[] {
  const resolved = roles ?? getRoles(config.roleIds);
  const layers: string[] = [];
  if (resolved.length === 1) layers.push(`Role: ${resolved[0].label}`);
  if (resolved.length > 1) layers.push(`Expert panel (${resolved.length})`);
  if (config.booster) layers.push('Prompt booster');
  if (config.thinkingMode) {
    const m = getThinkingMode(config.thinkingMode);
    if (m) layers.push(`${m.label} thinking`);
  }
  layers.push(`Creativity ${config.creativity}%`);
  if (config.outputFormat) {
    const f = getOutputFormat(config.outputFormat);
    if (f) layers.push(`Format: ${f.label}`);
  }
  return layers;
}

/** True when at least one prompt-shaping layer would change the output. */
export function hasActiveLayers(config: PromptConfig): boolean {
  return (
    config.roleIds.length > 0 ||
    config.booster ||
    config.thinkingMode !== null ||
    config.outputFormat !== null ||
    config.creativity !== 50
  );
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
