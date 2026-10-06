// AI Hub — every chat assistant PROMPTIFY can hand a prompt to. A handoff
// opens the assistant's own website in a new tab and our content script types
// the prompt into its composer, so it runs on the user's own (free) account.
// No scraping of private APIs, no shared keys — just the official web apps.
//
// Keep `hosts` in sync with SITE_MATCHES in manifest.config.ts, otherwise the
// content script never loads on that site and the prompt can't be injected.

export interface AiHub {
  id: string;
  name: string;
  /** URL of a fresh chat. */
  url: string;
  /** Hostname suffixes, used to match the hub to a site adapter. */
  hosts: string[];
  /** Brand color for the chip dot. */
  color: string;
}

export const AI_HUBS: AiHub[] = [
  { id: 'chatgpt',    name: 'ChatGPT',     url: 'https://chatgpt.com/',              hosts: ['chatgpt.com', 'chat.openai.com'], color: '#10A37F' },
  { id: 'claude',     name: 'Claude',      url: 'https://claude.ai/new',             hosts: ['claude.ai'],                      color: '#D97757' },
  { id: 'gemini',     name: 'Gemini',      url: 'https://gemini.google.com/app',     hosts: ['gemini.google.com'],              color: '#4285F4' },
  { id: 'deepseek',   name: 'DeepSeek',    url: 'https://chat.deepseek.com/',        hosts: ['chat.deepseek.com'],              color: '#4D6BFE' },
  { id: 'perplexity', name: 'Perplexity',  url: 'https://www.perplexity.ai/',        hosts: ['perplexity.ai'],                  color: '#20808D' },
  { id: 'grok',       name: 'Grok',        url: 'https://grok.com/',                 hosts: ['grok.com'],                       color: '#9CA3AF' },
  { id: 'copilot',    name: 'Copilot',     url: 'https://copilot.microsoft.com/',    hosts: ['copilot.microsoft.com'],          color: '#0EA5E9' },
  { id: 'qwen',       name: 'Qwen',        url: 'https://chat.qwen.ai/',             hosts: ['chat.qwen.ai'],                   color: '#615CED' },
  { id: 'kimi',       name: 'Kimi',        url: 'https://www.kimi.com/',             hosts: ['kimi.com'],                       color: '#A3A3A3' },
  { id: 'mistral',    name: 'Le Chat',     url: 'https://chat.mistral.ai/chat',      hosts: ['chat.mistral.ai'],                color: '#FA520F' },
  { id: 'metaai',     name: 'Meta AI',     url: 'https://www.meta.ai/',              hosts: ['meta.ai'],                        color: '#0866FF' },
  { id: 'huggingchat',name: 'HuggingChat', url: 'https://huggingface.co/chat/',      hosts: ['huggingface.co'],                 color: '#FFD21E' },
];

/** The default "Ask all" line-up. */
export const DEFAULT_ASK_ALL = ['chatgpt', 'claude', 'gemini', 'deepseek'];

export function hubById(id: string): AiHub | undefined {
  return AI_HUBS.find((h) => h.id === id);
}
