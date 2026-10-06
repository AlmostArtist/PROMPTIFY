export const NEWS_KEY = 'pk_ai_news_v1';
export const NEWS_INTERVAL = 60 * 60 * 1000;
export const NEWS_COOLDOWN = 60 * 1000;

/**
 * Publisher RSS feeds, weighted toward generative-media coverage: new video
 * models, image checkpoints, open-source weights and research. `hint` is a
 * fallback category used only when headline keywords don't classify a story.
 */
export const NEWS_SOURCES: { name: string; url: string; hint?: NewsCategory }[] = [
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', hint: 'Research' },
  { name: 'Replicate', url: 'https://replicate.com/blog/rss', hint: 'Image Models' },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', hint: 'Products' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', hint: 'Products' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', hint: 'Products' },
  { name: 'MIT News', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', hint: 'Research' },
];

export type NewsCategory = 'Video AI' | 'Image Models' | 'Prompts & LoRAs' | 'Research' | 'Products';

/** Filter chips shown in the AI News tab (plus "All"). */
export const NEWS_CATEGORIES: NewsCategory[] = ['Video AI', 'Image Models', 'Prompts & LoRAs', 'Research', 'Products'];

export interface NewsStory {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  summary: string;
  category: NewsCategory;
  /** A new checkpoint / model release was detected in the headline. */
  release?: boolean;
  /** Short model name for the release badge, e.g. "Flux 1.1", "Kling 2.0". */
  model?: string;
  thumbnail?: string;
}

export interface NewsCache { stories: NewsStory[]; refreshedAt: number; attemptedAt: number; error?: string; }
export const EMPTY_NEWS: NewsCache = { stories: [], refreshedAt: 0, attemptedAt: 0 };

// ── Classification ──────────────────────────────────────────────────
// Named model families, newest first, so the release badge can show a label.
const MODEL_NAMES: [RegExp, string][] = [
  [/\bsora\s*2?\b/i, 'Sora'],
  [/\bveo\s*\d(?:\.\d)?\b/i, 'Veo'],
  [/\bkling\s*\d(?:\.\d)?\b/i, 'Kling'],
  [/\brunway\s*gen-?\d\b/i, 'Runway Gen'],
  [/\b(?:pika|luma|dream\s?machine|hailuo|mochi|ltx(?:-?video)?|cogvideo|hunyuan\s?video|wan\s?\d(?:\.\d)?)\b/i, 'video model'],
  [/\bflux(?:\s*\.?\s*\d(?:\.\d)?)?\b/i, 'Flux'],
  [/\b(?:stable\s?diffusion|sd\s?3(?:\.\d)?|sdxl|sd\s?1\.5)\b/i, 'Stable Diffusion'],
  [/\bmidjourney(?:\s*v?\d)?\b/i, 'Midjourney'],
  [/\bdall-?e\s*\d?\b/i, 'DALL·E'],
  [/\bimagen\s*\d?\b/i, 'Imagen'],
  [/\b(?:ideogram|firefly|recraft|nano\s?banana|qwen-?image|seedream|hidream)\b/i, 'image model'],
];

const VIDEO_RE = /\b(sora|veo\s?\d|kling|runway\s?gen|gen-?[23]|pika|luma|dream\s?machine|hailuo|minimax\s?video|mochi|ltx|cogvideo|hunyuan\s?video|wan\s?\d|text-?to-?video|image-?to-?video|video\s?(model|generation|diffusion))\b/i;
const IMAGE_RE = /\b(flux|stable\s?diffusion|sdxl|sd\s?3|sd\s?1\.5|midjourney|dall-?e|imagen|ideogram|firefly|recraft|nano\s?banana|qwen-?image|seedream|hidream|checkpoint|text-?to-?image|image\s?(model|generation)|diffusion\s?model)\b/i;
const LORA_RE = /\b(lora|loras|civitai|comfyui|embedding|textual\s?inversion|fine-?tun|workflow|prompt(ing|\s?technique|\s?engineer)|controlnet|ip-?adapter)\b/i;
const RESEARCH_RE = /\b(research|paper|arxiv|benchmark|study|dataset|open-?source|open\s?weights|hugging\s?face|model\s?card|state-of-the-art|\bsota\b)\b/i;
// No trailing \b: these are word stems (releas → releases/released), and the
// leading \b keeps them anchored to word starts.
const RELEASE_RE = /\b(releas|launch|introduc|announc|unveil|now\s?available|out\s?now|rolls?\s?out|\bdrop|available\s?(now|today)|is\s?here|v\d+(?:\.\d+)?)/i;

/** Pick a category for a story from its text, falling back to the source hint. */
export function classifyNews(text: string, hint: NewsCategory = 'Products'): NewsCategory {
  if (VIDEO_RE.test(text)) return 'Video AI';
  if (IMAGE_RE.test(text)) return 'Image Models';
  if (LORA_RE.test(text)) return 'Prompts & LoRAs';
  if (RESEARCH_RE.test(text)) return 'Research';
  return hint;
}

/** Whether the story looks like a fresh model/checkpoint release, and which model. */
export function detectRelease(text: string): { release: boolean; model?: string } {
  const hit = MODEL_NAMES.find(([re]) => re.test(text));
  if (!hit || !RELEASE_RE.test(text)) return { release: false };
  const generic = hit[1] === 'video model' || hit[1] === 'image model';
  const matched = generic ? undefined : text.match(hit[0])?.[0]?.replace(/\s+/g, ' ').trim();
  return { release: true, model: (matched && matched.length <= 20 ? matched : hit[1]) };
}
