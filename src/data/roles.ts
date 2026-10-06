import type { Role, RoleCategory } from '@/engine/types';

/** Display order for the category sections in the Roles Hub. */
export const CATEGORY_ORDER: RoleCategory[] = [
  'Custom',
  'Developer',
  'Creative',
  'AI & Data',
  'Content',
  'Design',
  'Business',
];

export const ROLES: Role[] = [
  // ── Developer ──────────────────────────────────────────────────
  {
    id: 'senior-engineer',
    emoji: '👨‍💻',
    label: 'Senior Engineer',
    category: 'Developer',
    headline: 'senior full-stack software engineer with 12+ years building production systems',
    specialties: ['System design', 'Clean code', 'Performance', 'Code review', 'Architecture'],
    deliverable: 'Technical Solution',
  },
  {
    id: 'code-reviewer',
    emoji: '🔍',
    label: 'Code Reviewer',
    category: 'Developer',
    headline: 'expert code reviewer focused on quality, security, and maintainability',
    specialties: ['Bug detection', 'Security audit', 'Best practices', 'Refactoring', 'Test coverage'],
    deliverable: 'Code Review',
  },
  {
    id: 'devops-engineer',
    emoji: '⚙️',
    label: 'DevOps Engineer',
    category: 'Developer',
    headline: 'senior DevOps and platform engineer',
    specialties: ['CI/CD pipelines', 'Docker & Kubernetes', 'Cloud infrastructure', 'Monitoring', 'IaC'],
    deliverable: 'DevOps Plan',
  },
  {
    id: 'security-engineer',
    emoji: '🔐',
    label: 'Security Engineer',
    category: 'Developer',
    headline: 'application security engineer and penetration tester',
    specialties: ['OWASP Top 10', 'Threat modeling', 'Auth & crypto', 'Secure code review', 'Incident response'],
    deliverable: 'Security Assessment',
  },
  {
    id: 'api-designer',
    emoji: '🔌',
    label: 'API Designer',
    category: 'Developer',
    headline: 'API architect specializing in REST and GraphQL design',
    specialties: ['REST conventions', 'GraphQL schemas', 'OpenAPI specs', 'Versioning', 'Error contracts'],
    deliverable: 'API Specification',
  },

  // ── Creative ────────────────────────────────────────────────────
  {
    id: 'image-prompt-engineer',
    emoji: '🎨',
    label: 'Image Prompt Engineer',
    category: 'Creative',
    headline: 'expert AI image prompt engineer for Midjourney, DALL-E, and Stable Diffusion',
    specialties: ['Visual composition', 'Lighting & mood', 'Art style vocabulary', 'Parameter tuning', 'Negative prompts'],
    deliverable: 'Image Prompt',
  },
  {
    id: 'art-director',
    emoji: '🖼️',
    label: 'Art Director',
    category: 'Creative',
    headline: 'creative director with 15 years in visual branding and design direction',
    specialties: ['Visual identity', 'Color theory', 'Typography', 'Layout composition', 'Brand storytelling'],
    deliverable: 'Creative Brief',
  },
  {
    id: 'storyteller',
    emoji: '📖',
    label: 'Storyteller',
    category: 'Creative',
    headline: 'narrative strategist and storytelling expert',
    specialties: ['Story structure', 'Character arcs', 'World-building', 'Dialogue', 'Emotional hooks'],
    deliverable: 'Story Outline',
  },

  // ── AI & Data ───────────────────────────────────────────────────
  {
    id: 'prompt-engineer',
    emoji: '⚡',
    label: 'Prompt Engineer',
    category: 'AI & Data',
    headline: 'elite prompt engineer who maximizes LLM output quality',
    specialties: ['Chain-of-thought', 'Few-shot examples', 'Role framing', 'Output structuring', 'Model calibration'],
    deliverable: 'Optimized Prompt',
  },
  {
    id: 'data-analyst',
    emoji: '📊',
    label: 'Data Analyst',
    category: 'AI & Data',
    headline: 'senior data analyst and business intelligence specialist',
    specialties: ['Statistical analysis', 'Data visualization', 'SQL', 'Dashboard design', 'Trend interpretation'],
    deliverable: 'Data Insights',
  },
  {
    id: 'ml-engineer',
    emoji: '🤖',
    label: 'ML Engineer',
    category: 'AI & Data',
    headline: 'machine learning engineer and model architect',
    specialties: ['Model selection', 'Feature engineering', 'Training pipelines', 'Evaluation metrics', 'MLOps'],
    deliverable: 'ML Strategy',
  },

  // ── Content ─────────────────────────────────────────────────────
  {
    id: 'technical-writer',
    emoji: '📝',
    label: 'Technical Writer',
    category: 'Content',
    headline: 'senior technical writer specializing in developer documentation',
    specialties: ['API docs', 'Tutorials', 'README files', 'Clear explanations', 'Docs-as-code'],
    deliverable: 'Documentation',
  },
  {
    id: 'copywriter',
    emoji: '✍️',
    label: 'Copywriter',
    category: 'Content',
    headline: 'direct-response copywriter with 10+ years of conversion-focused writing',
    specialties: ['Headlines', 'CTAs', 'Landing pages', 'Email copy', 'Value propositions'],
    deliverable: 'Copy',
  },
  {
    id: 'seo-specialist',
    emoji: '🔎',
    label: 'SEO Specialist',
    category: 'Content',
    headline: 'technical SEO specialist and content strategist',
    specialties: ['Keyword research', 'On-page optimization', 'Content clusters', 'Schema markup', 'Search intent'],
    deliverable: 'SEO Strategy',
  },

  // ── Design ──────────────────────────────────────────────────────
  {
    id: 'ux-designer',
    emoji: '🧩',
    label: 'UX Designer',
    category: 'Design',
    headline: 'senior UX designer focused on user-centered product design',
    specialties: ['User flows', 'Wireframing', 'Usability testing', 'Information architecture', 'Accessibility'],
    deliverable: 'UX Recommendations',
  },
  {
    id: 'ui-designer',
    emoji: '💎',
    label: 'UI Designer',
    category: 'Design',
    headline: 'visual UI designer and design systems expert',
    specialties: ['Component design', 'Design tokens', 'Motion', 'Responsive layouts', 'Dark mode'],
    deliverable: 'UI Specification',
  },

  // ── Business ────────────────────────────────────────────────────
  {
    id: 'product-manager',
    emoji: '🗺️',
    label: 'Product Manager',
    category: 'Business',
    headline: 'senior product manager with expertise in B2B and B2C products',
    specialties: ['Roadmapping', 'PRDs', 'User stories', 'Prioritization', 'Stakeholder alignment'],
    deliverable: 'Product Plan',
  },
  {
    id: 'marketing-strategist',
    emoji: '📣',
    label: 'Marketing Strategist',
    category: 'Business',
    headline: 'growth marketing strategist and campaign architect',
    specialties: ['Go-to-market', 'Campaign planning', 'Positioning', 'Funnel optimization', 'Analytics'],
    deliverable: 'Marketing Plan',
  },
];

const BY_ID = new Map(ROLES.map((r) => [r.id, r]));

// User-created roles (registered from storage at startup). Kept in a mutable
// registry so the pure engine (getRoles/getRole) can resolve them without
// changing its signature.
const customRoles = new Map<string, Role>();

/** Replace the registered custom roles (call after loading from storage). */
export function registerCustomRoles(roles: Role[]): void {
  customRoles.clear();
  for (const r of roles) customRoles.set(r.id, { ...r, category: 'Custom' });
}

/** Resolve a list of ids to roles, preserving the given (selection) order. */
export function getRoles(ids: string[]): Role[] {
  return ids.map((id) => getRole(id)).filter((r): r is Role => Boolean(r));
}

export function getRole(id: string): Role | undefined {
  return BY_ID.get(id) ?? customRoles.get(id);
}

/** Built-in roles plus any registered custom roles (custom first). */
export function getAllRoles(): Role[] {
  return [...customRoles.values(), ...ROLES];
}

export function rolesByCategory(): Record<RoleCategory, Role[]> {
  const grouped = {} as Record<RoleCategory, Role[]>;
  for (const cat of CATEGORY_ORDER) grouped[cat] = [];
  for (const role of customRoles.values()) grouped.Custom.push(role);
  for (const role of ROLES) grouped[role.category].push(role);
  return grouped;
}
