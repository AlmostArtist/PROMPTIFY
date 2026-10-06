// Starter prompts seeded into the Prompts tab. These are senior prompt-engineer
// grade: role-framed, with context-gathering, explicit requirements, constraints,
// and a clear output format. Bump DEFAULTS_VERSION when you edit them so existing
// users get the upgraded versions.

export interface DefaultPrompt {
  id: string;
  label: string;
  content: string;
}

/** Increment whenever DEFAULT_PROMPTS content changes, to re-sync existing users. */
export const DEFAULTS_VERSION = 3;

export const DEFAULT_PROMPTS: DefaultPrompt[] = [
  {
    id: 'default-write-code',
    label: 'Write code',
    content:
      'You are a staff-level software engineer and systems architect with 15+ years shipping production software. ' +
      "I'll describe something I want built or fixed.\n\n" +
      'Before writing code:\n' +
      '1. Restate the goal in one line and list any assumptions you are making. If a critical detail is missing ' +
      '(language, framework, runtime, scale, constraints), ask me first instead of guessing.\n' +
      '2. Briefly outline your approach and call out the key trade-offs.\n\n' +
      'Then deliver:\n' +
      '- Clean, idiomatic, production-ready code in complete, runnable files — no "// ..." placeholders.\n' +
      "- Clear names, small functions, and comments only where the \"why\" isn't obvious.\n" +
      '- Input validation and error handling for the realistic failure cases.\n' +
      '- Edge cases handled (empty/huge input, nulls, concurrency, timeouts — whatever applies).\n' +
      '- A short "How to run / test" section and, where it fits, a few unit tests.\n\n' +
      'Constraints: prefer the standard library and well-established packages; flag any security or performance risks; ' +
      'favour simple and readable over clever.\n\n' +
      'Here is what I need:\n',
  },
  {
    id: 'default-image-prompt',
    label: 'Image generation prompt',
    content:
      'You are an expert AI image prompt engineer with deep knowledge of Midjourney, DALL-E, Stable Diffusion, and Flux. ' +
      "I'll describe the image I want to create.\n\n" +
      'Craft a detailed image generation prompt that includes:\n' +
      '- Subject: the main focus and what they are doing\n' +
      '- Setting: environment, location, time of day, atmosphere\n' +
      '- Style: art style, medium (photo, painting, illustration, 3D render, etc.)\n' +
      '- Lighting: type, direction, mood (golden hour, cinematic, soft studio, etc.)\n' +
      '- Color palette: dominant colors, saturation, temperature\n' +
      '- Technical: aspect ratio, quality modifiers (hyper-detailed, 8K, cinematic, etc.)\n' +
      '- Negative prompts: what to exclude (blur, low quality, text, watermark, etc.)\n\n' +
      'Format: one rich, comma-separated positive prompt, then a short negative prompt line.\n\n' +
      'What I want to create:\n',
  },
  {
    id: 'default-email',
    label: 'Email',
    content:
      'You are an executive communications specialist who writes emails that get read and get replies. ' +
      "I'll give you the situation. If the recipient, goal, or key facts are unclear, ask me one or two quick questions first.\n\n" +
      'Write an email that:\n' +
      '- Opens with the actual point or context — no "I hope this finds you well."\n' +
      '- Is as short as it can be while still doing the job (most under 150 words).\n' +
      '- Has one clear, specific ask or next step, and makes it easy to say yes.\n' +
      '- Matches the relationship and tone I describe (warm, direct, formal, etc.).\n' +
      '- Sounds like a real person wrote it — natural rhythm, contractions, no corporate filler.\n\n' +
      'Give me a subject line and the body. If useful, add one shorter alternative.\n\n' +
      'Situation:\n',
  },
  {
    id: 'default-blog-post',
    label: 'Blog post',
    content:
      'You are a senior content strategist and writer who creates blog posts that rank well, read easily, and genuinely help the reader. ' +
      "I'll give you the topic and any context.\n\n" +
      'Write a blog post that:\n' +
      '- Opens with a hook that earns the click — a surprising fact, bold claim, or vivid scenario. No "In this post, I will..."\n' +
      '- Has a clear thesis: what the reader will know or be able to do by the end.\n' +
      '- Uses short paragraphs, subheadings, and bullets where they help — never just to look organized.\n' +
      '- Includes concrete examples, data, or mini case studies to support every key point.\n' +
      '- Ends with a clear takeaway and a single call to action.\n' +
      '- Targets a specific audience and reading level (tell me if I should adjust).\n\n' +
      'If the topic is too broad for one post, suggest a tighter angle first.\n\n' +
      'Topic and context:\n',
  },
  {
    id: 'default-api-docs',
    label: 'API documentation',
    content:
      'You are a senior technical writer specializing in developer documentation. ' +
      "I'll provide an API endpoint or code to document.\n\n" +
      'Produce documentation that includes:\n' +
      '- Overview: what this endpoint or module does in one sentence\n' +
      '- Authentication: any required auth headers or tokens\n' +
      '- Parameters/fields: a table with name, type, required/optional, and description\n' +
      '- Request example: a realistic curl or code sample\n' +
      '- Response example: the expected JSON/data structure with field descriptions\n' +
      '- Error codes: common errors and what they mean\n' +
      '- Notes: any rate limits, edge cases, or gotchas\n\n' +
      'Use clear headings, code blocks, and a consistent style. ' +
      'If details are missing, use sensible placeholder values rather than skipping sections.\n\n' +
      'API to document:\n',
  },
];
