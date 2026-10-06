import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

// Every AI surface PROMPTIFY runs on. Keep this in sync with
// src/content/siteAdapters.ts where each host is matched to selectors.
export const SITE_MATCHES = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://grok.com/*',
  'https://x.com/i/grok*',
  'https://www.perplexity.ai/*',
  'https://perplexity.ai/*',
  'https://copilot.microsoft.com/*',
  // AI Hub — free web apps PROMPTIFY can hand prompts to (see src/lib/aiHubs.ts).
  'https://chat.deepseek.com/*',
  'https://chat.qwen.ai/*',
  'https://www.kimi.com/*',
  'https://kimi.com/*',
  'https://chat.mistral.ai/*',
  'https://www.meta.ai/*',
  'https://huggingface.co/chat*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'PROMPTIFY',
  version: pkg.version,
  description: pkg.description,
  icons: {
    16: 'src/assets/icon-16.png',
    32: 'src/assets/icon-32.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
  action: {
    default_title: 'PROMPTIFY — open panel',
    default_icon: {
      16: 'src/assets/icon-16.png',
      32: 'src/assets/icon-32.png',
    },
  },
  side_panel: {
    default_path: 'sidepanel.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  // `scripting` + `activeTab` let the Analyze tab read the focused tab's text
  // (e.g. a LinkedIn profile or a job posting) on demand.
  // `contextMenus` powers the universal right-click AI menu.
  // Native messaging must be available when the worker starts. Adding it only
  // at runtime can leave an existing worker without connectNative bindings.
  permissions: ['alarms', 'storage', 'sidePanel', 'downloads', 'scripting', 'activeTab', 'contextMenus', 'nativeMessaging'],
  // OpenRouter API — all AI calls are proxied through the background worker.
  host_permissions: ['https://openrouter.ai/*', 'https://techcrunch.com/*', 'https://news.mit.edu/*'],
  // "Browser Brain" (Ask tab) — requested at runtime only when the user turns it
  // on: recall from history, read/close tabs, read other tabs' text, capture
  // screenshots from the side panel. See src/lib/permissions.ts.
  optional_permissions: ['history', 'tabs'],
  optional_host_permissions: ['<all_urls>'],
  commands: {
    'talk-to-browser': {
      suggested_key: { default: 'Alt+Space', mac: 'Alt+Space' },
      description: 'Talk to your browser (voice command)',
    },
    'screenshot-prompt': {
      suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
      description: 'Screenshot → Perfect Prompt',
    },
  },
  content_scripts: [
    { matches: ['http://*/*', 'https://*/*'], js: ['src/content/contextRail.tsx'], run_at: 'document_idle' },
    {
      matches: SITE_MATCHES,
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
    {
      // Text-selection action rail — runs on every site, not just AI hosts.
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/selection.ts'],
      run_at: 'document_idle',
    },
    {
      // Opt-in personal memory (off by default; does nothing until enabled).
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/memory.ts'],
      run_at: 'document_idle',
    },
  ],
});
