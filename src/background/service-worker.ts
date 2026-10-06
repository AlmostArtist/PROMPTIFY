import { refreshNews } from './news-service';
// MV3 service worker. Seeds defaults and reaches OpenRouter's cloud API using
// the user's own API key. Only this context has the openrouter.ai host
// permission, so every model call is proxied here — this keeps the key out of
// page contexts and sidesteps host-page CSP rules.
import {
  addHistoryEntry,
  addSavedPrompt,
  loadConfig,
  loadEnabled,
  loadHistory,
  loadOpenRouterKey,
  loadOpenRouterModel,
  loadSavedPrompts,
  saveConfig,
  saveEnabled,
} from '@/lib/storage';
import { AI_TASKS, applySubModes, SYSTEM_GUARDRAILS, VISION_TASKS, type AiTaskDef } from '@/lib/aiTasks';
import {
  OPENROUTER_BASE_URL,
  type AiResult,
  type AiTask,
  type BgRequest,
  type CaptureResult,
  type EnhanceSubMode,
  type Handoff,
  type HealthResult,
  type HistoryEntry,
  type NewHistoryEntry,
  type TabCommand,
  type UsageRing,
  type UsageSnapshot,
} from '@/lib/messages';
import { candidateModels, getFreeModels } from '@/lib/models';
import { AI_HUBS, DEFAULT_ASK_ALL, hubById } from '@/lib/aiHubs';
import { captureRegion, pickRegion } from '@/lib/capture';
import { normalizeImage, thumbnail, urlToBlob } from '@/lib/image';
import { loadMemoryOn, recordMemoryPage } from '@/lib/memory';
import { addVisionHistory, writeVisionJob, type VisionJob, type VisionMode } from '@/lib/vision';
import { recordTokenUsage } from '@/lib/token-usage';
import { applyPreset, normalizeTheme } from '@/lib/theme';
import { loadAiProvider, loadCliModel, nativeRequest, resolveVisionProvider, PROVIDER_LABELS, type ConnectionResult, type CliProvider } from '@/lib/connections';

// Multiple injected toolbars can poll at once. Share CLI status checks briefly.
let cliHealthCache: { at: number; result: Promise<ConnectionResult> } | null = null;

export const HISTORY_FILENAME = 'PROMPTIFY/promptify-history.md';

// Clicking the toolbar icon opens the side panel (instead of a popup).
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.runtime.onInstalled.addListener(async (details) => {
  const [enabled, config] = await Promise.all([loadEnabled(), loadConfig()]);
  await Promise.all([saveEnabled(enabled), saveConfig(config)]);
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => undefined);
  buildContextMenus();
  void adoptCharcoalOnce();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://chatgpt.com/' }).catch(() => undefined);
  }
});

chrome.runtime.onStartup.addListener(() => buildContextMenus());

chrome.runtime.onMessage.addListener((message: BgRequest, sender, sendResponse) => {
  if (message?.type === 'cliConnection') {
    // Account management is only available from our own side panel, never a web page.
    if (sender.id !== chrome.runtime.id || sender.url?.split('#')[0] !== chrome.runtime.getURL('sidepanel.html')) {
      sendResponse({ ok: false, error: 'Open Connections in the side panel.' });
      return false;
    }
    cliHealthCache = null;
    if (message.action === 'status') void nativeRequest({ action: 'status' }).then(sendResponse);
    else if ((message.action === 'login' || message.action === 'logout' || message.action === 'telemetry') && (message.provider === 'codex' || message.provider === 'claude')) {
      void nativeRequest({ action: message.action, provider: message.provider }).then((result) => { cliHealthCache = null; sendResponse(result); });
    } else { sendResponse({ ok: false, error: 'Invalid connection request.' }); return false; }
    return true;
  }
  if (message?.type === 'news') {
    void refreshNews(Boolean(message.force)).then(sendResponse).catch(() => sendResponse({ stories: [], refreshedAt: 0, attemptedAt: 0, error: 'News storage is unavailable. Please retry.' }));
    return true;
  }
  if (message?.type === 'health') {
    void handleHealth().then(sendResponse);
    return true;
  }
  if (message?.type === 'ai') {
    void handleAi(message.task, message.prompt, message.customInstruction, message.subModes).then(sendResponse);
    return true;
  }
  if (message?.type === 'openSidePanel') {
    if (message.page && QUICK_ROUTES.includes(message.page)) void chrome.storage.session.set({ pk_quick_route: { page: message.page, ts: Date.now() } });
    // Must run within the user gesture that triggered the content-script message.
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    try {
      if (tabId !== undefined) chrome.sidePanel.open({ tabId });
      else if (windowId !== undefined) chrome.sidePanel.open({ windowId });
    } catch {
      /* gesture/availability — user can click the toolbar icon instead */
    }
    return false;
  }
  if (message?.type === 'recordHistory') {
    void recordHistory(message.entry);
    return false;
  }
  if (message?.type === 'exportHistory') {
    void exportHistoryFile();
    return false;
  }
  if (message?.type === 'getSavedPrompts') {
    void loadSavedPrompts().then(sendResponse);
    return true;
  }
  if (message?.type === 'savePrompt') {
    void handleSavePrompt(message.label, message.content).then(sendResponse);
    return true;
  }
  if (message?.type === 'vision') {
    void runVision(message.mode, message.image, message.source).then(sendResponse);
    return true;
  }
  if (message?.type === 'captureForVision') {
    void captureFromPanel(message.mode).then(sendResponse);
    return true;
  }
  if (message?.type === 'sendToAi') {
    void openHandoffs(message.hubIds, message.text, message.autoSend).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'claimHandoff') {
    void claimHandoff(sender.tab?.id).then(sendResponse);
    return true;
  }
  if (message?.type === 'memoryRecord') {
    if (!sender.tab?.incognito) void recordIfEnabled(message.page);
    return false;
  }
  if (message?.type === 'panelState') {
    void isPanelOpen(sender.tab?.windowId).then((open) => sendResponse({ open }));
    return true;
  }
  if (message?.type === 'quickCapture') {
    // Quick tool → Screenshot analysis: open the panel inside this click's
    // gesture, then let the user drag a region on the page.
    openSidePanelFor(sender.tab);
    void chrome.storage.session.set({ pk_quick_route: { page: 'vision', ts: Date.now() } });
    if (sender.tab) void screenshotFlow(sender.tab, 'prompts');
    return false;
  }
  if (message?.type === 'usageSnapshot') {
    void usageSnapshot(Boolean(message.force)).then(sendResponse);
    return true;
  }
  if (message?.type === 'listModels') {
    void getFreeModels(Boolean(message.force)).then(sendResponse);
    return true;
  }
  if (message?.type === 'menuContext') {
    updateMenuContext(message.code, message.product);
    return false;
  }
  return false;
});

/** Persist a selection as a reusable saved prompt (selection rail). */
async function handleSavePrompt(label: string, content: string): Promise<{ ok: boolean }> {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await addSavedPrompt({ id, label: label.trim() || 'Saved selection', content: content.trim(), ts: Date.now() });
  return { ok: true };
}

// History is persisted silently to chrome.storage. We never auto-download — the
// .md file is only written when the user explicitly clicks Export.
async function recordHistory(entry: NewHistoryEntry): Promise<void> {
  await addHistoryEntry(entry);
}

/** Build one Markdown document, grouped by AI website, and save it (overwrite). */
async function exportHistoryFile(): Promise<void> {
  const history = await loadHistory();
  const md = buildHistoryMarkdown(history);
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
  try {
    await chrome.downloads.download({
      url,
      filename: HISTORY_FILENAME,
      conflictAction: 'overwrite',
      saveAs: false,
    });
  } catch {
    /* download blocked — history still lives in storage */
  }
}

function stamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function buildHistoryMarkdown(entries: HistoryEntry[]): string {
  const bySite = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const key = e.site || 'Other';
    const arr = bySite.get(key);
    if (arr) arr.push(e);
    else bySite.set(key, [e]);
  }

  let md = `# PROMPTIFY — Enhanced Prompt History\n\n`;
  md += `_Updated ${stamp(Date.now())} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  md += ` · ${bySite.size} site${bySite.size === 1 ? '' : 's'}_\n`;

  if (entries.length === 0) {
    md += `\nNo enhanced prompts yet.\n`;
    return md;
  }

  for (const [site, list] of bySite) {
    md += `\n---\n\n## ${site}\n`;
    for (const e of list) {
      md += `\n### ${stamp(e.ts)} · ${e.tool}\n\n`;
      md += `**Original**\n\n${quote(e.original)}\n\n`;
      md += `**Enhanced**\n\n\`\`\`\n${e.enhanced.trim()}\n\`\`\`\n`;
    }
  }
  return md;
}

async function handleHealth(): Promise<HealthResult> {
  const provider = await loadAiProvider();
  if (provider !== 'openrouter') {
    if (!cliHealthCache || Date.now() - cliHealthCache.at > 20_000) {
      cliHealthCache = { at: Date.now(), result: nativeRequest({ action: 'status' }) };
    }
    const result = await cliHealthCache.result;
    const status = result.providers?.[provider];
    return { ok: Boolean(result.ok && status?.authenticated), provider, model: await loadCliModel(provider) || PROVIDER_LABELS[provider],
      error: result.error || (status?.authenticated ? undefined : 'Connect your CLI account in Connections.') };
  }
  const [key, model] = await Promise.all([loadOpenRouterKey(), loadOpenRouterModel()]);
  return openRouterHealth(key, model);
}

async function handleAi(
  task: AiTask,
  prompt: string,
  customInstruction?: string,
  subModes?: EnhanceSubMode[],
): Promise<AiResult> {
  const provider = await loadAiProvider();
  if (provider !== 'openrouter') {
    return cliAi(provider, task, prompt, customInstruction, subModes);
  }
  const [key, model] = await Promise.all([loadOpenRouterKey(), loadOpenRouterModel()]);
  return openRouterAi(key, model, task, prompt, customInstruction, subModes);
}

async function cliAi(provider: CliProvider, task: AiTask, prompt: string, customInstruction?: string, subModes?: EnhanceSubMode[], image?: string): Promise<AiResult> {
  const def = resolveTask(task, customInstruction);
  if (!def) return { ok: false, error: 'Unknown AI task.' };
  if (VISION_TASKS.has(task) && !image) return { ok: false, error: 'Attach an image or capture a screenshot in Vision.' };
  if (image && !image.startsWith('data:image/')) return { ok: false, error: 'This image could not be downloaded. Use Capture screen or upload it in Vision instead.' };
  const model = await loadCliModel(provider, image ? 'vision' : 'text');
  const result = await nativeRequest({ action: 'generate', provider, ...(model ? { model } : {}), ...(image ? { image } : {}),
    prompt: `${def.system}\n\n${applySubModes(def.build(prompt), subModes)}` });
  if (result.ok) await recordTokenUsage(provider, result.usage);
  return { ...result, task, model: result.model || model || PROVIDER_LABELS[provider] };
}

// ── OpenRouter (cloud) ───────────────────────────────────────────
const NO_KEY_HINT = 'Add your OpenRouter API key in Settings — get one at https://openrouter.ai/keys';

/** Common headers for every OpenRouter REST call. */
function orHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/AlmostArtist/PROMPTIFY',
    'X-Title': 'PROMPTIFY',
  };
}

/** Validate the key by querying OpenRouter's key-info endpoint (lightweight GET, no model needed). */
async function openRouterHealth(key: string, model: string): Promise<HealthResult> {
  if (!key) return { ok: false, provider: 'openrouter', error: 'No OpenRouter API key set.', hint: NO_KEY_HINT };
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/AlmostArtist/PROMPTIFY',
        'X-Title': 'PROMPTIFY',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      return { ok: false, provider: 'openrouter', error: 'Invalid OpenRouter API key.', hint: NO_KEY_HINT };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, provider: 'openrouter', error: `OpenRouter responded ${res.status}. ${body.slice(0, 160)}` };
    }
    return { ok: true, provider: 'openrouter', model };
  } catch (err) {
    return { ok: false, provider: 'openrouter', error: errMsg(err), hint: 'Could not reach OpenRouter — check your connection.' };
  }
}

/** Resolve the task definition (built-in or an ad-hoc custom instruction). */
function resolveTask(task: AiTask, customInstruction?: string): AiTaskDef | null {
  if (task === 'custom' && customInstruction) {
    const block = (p: string) => `=== PROMPT START ===\n${p.trim()}\n=== PROMPT END ===`;
    return {
      temperature: 0.5,
      system:
        "You are PROMPTIFY, an elite AI prompt engineer. Your only job is to transform the user's prompt as instructed. " +
        'You NEVER answer, explain, or fulfil the prompt itself — you only output the result as instructed.\n\n' +
        SYSTEM_GUARDRAILS,
      build: (p: string) =>
        `${customInstruction}\n\nReturn ONLY the result. Do NOT add commentary, quotes, or code fences.\n\n${block(p)}`,
    };
  }
  return (AI_TASKS as Record<string, AiTaskDef>)[task] ?? null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Extract the answer text from a non-streaming chat response. */
function readAnswer(res: unknown): string {
  const msg = (res as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message;
  const content = msg?.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map((c) => (c as { text?: string })?.text ?? '').join('');
  // Strip any <think>…</think> reasoning blocks some models embed in content.
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

async function openRouterAi(
  key: string,
  model: string,
  task: AiTask,
  prompt: string,
  customInstruction?: string,
  subModes?: EnhanceSubMode[],
  image?: string,
): Promise<AiResult> {
  if (!key) return { ok: false, error: 'No OpenRouter API key set.', hint: NO_KEY_HINT };

  const def = resolveTask(task, customInstruction);
  if (!def) return { ok: false, error: `Unknown task: ${task}` };

  // Layer any active Prompt Enhancer sub-mode requirements onto the built
  // message. No-op for tasks/calls without sub-modes.
  const text = applySubModes(def.build(prompt), subModes);
  const needVision = Boolean(image) && VISION_TASKS.has(task);
  const userContent: string | ContentPart[] = needVision
    ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image as string } }]
    : text;

  // Try the user's pick first, then each live free fallback in turn. We send
  // the SINGULAR `model` field (one per request) — the `models` array routing
  // param has element-count constraints that were rejecting requests.
  const candidates = await candidateModels(model, needVision);
  let lastErr = 'Unknown error.';
  const startedAt = Date.now();

  const isTransient = (msg: string) =>
    /overload|temporarily|timeout|rate.?limit|too many|429|500|502|503|provider returned|empty response/i.test(msg);
  const isHardStop = (msg: string) =>
    /401|unauthor|invalid.*key|user not found|402|credit|payment|insufficient/i.test(msg);

  for (const m of candidates) {
    // Give up on fresh models once we've spent long enough — the UI is waiting.
    if (Date.now() - startedAt > 150_000) break;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: orHeaders(key),
          body: JSON.stringify({
            model: m,
            temperature: def.temperature,
            messages: [
              { role: 'system', content: def.system },
              { role: 'user',   content: userContent },
            ],
            stream: false,
          }),
          signal: AbortSignal.timeout(90_000),
        });

        const data = (await res.json().catch(() => null)) as
          | { choices?: { message?: { content?: unknown } }[]; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }; error?: { message?: string } }
          | null;

        if (!res.ok || data?.error) {
          lastErr = data?.error?.message || `OpenRouter responded ${res.status}.`;
        } else {
          const answer = readAnswer(data);
          if (answer) {
            const usage = data?.usage;
            await recordTokenUsage('openrouter', typeof usage?.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number'
              ? { input: usage.prompt_tokens, output: usage.completion_tokens, cachedInput: usage.prompt_tokens_details?.cached_tokens || 0, cacheWrite: 0 } : undefined);
            return { ok: true, task, model: data?.model ?? m, text: answer };
          }
          lastErr = 'Model returned an empty response.';
        }
      } catch (err) {
        lastErr = errMsg(err);
      }

      // Retry the SAME model once on a transient blip, else move on.
      if (attempt < 2 && isTransient(lastErr)) {
        await sleep(500);
        continue;
      }
      break;
    }

    // No point trying other models if the key/credits are the problem.
    if (isHardStop(lastErr)) break;
  }

  const hint = /401|unauthor|invalid.*key|user not found/i.test(lastErr) ? NO_KEY_HINT
    : /402|credit|payment|insufficient/i.test(lastErr)                   ? 'OpenRouter credits exhausted — top up your account.'
    : /no endpoints|data policy|privacy/i.test(lastErr)                  ? 'Enable free models under openrouter.ai/settings/privacy, then retry.'
    : needVision && /image|vision|multimodal|modalit/i.test(lastErr)     ? 'No free vision model accepted this image — try again, or pick a vision model in Settings.'
    : /overload|provider|temporarily|429|500|502|503/i.test(lastErr)     ? 'The model provider is overloaded — try again in a moment.'
    : 'Could not complete the request — check your connection or try another model.';
  return { ok: false, error: lastErr, hint };
}

/** Pull the most useful message out of an SDK / network error. */
function errMsg(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'Request timed out.';
  // SDK typed errors carry the parsed OpenRouter body on `.error` / `.data`.
  const e = err as { error?: { message?: string }; data?: { error?: { message?: string } } };
  const apiMsg = e?.error?.message ?? e?.data?.error?.message;
  if (typeof apiMsg === 'string' && apiMsg) return apiMsg;
  return err instanceof Error ? err.message : String(err);
}

// ══════════════════════════════════════════════════════════════════
// Vision — Screenshot → Perfect Prompt, Prompt DNA, describe / analyze
// ══════════════════════════════════════════════════════════════════
const VISION_TASK: Record<VisionMode, AiTask> = {
  prompts: 'vision-prompts',
  dna: 'prompt-dna',
  image: 'vision-image-prompt',
  video: 'vision-video-prompt',
  'ui-anim': 'vision-ui-animation',
  describe: 'image-describe',
  analyze: 'image-analyze',
  remix: 'image-remix',
};

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Turn whatever we were given into something a vision model can read: data
 * URLs are re-encoded small; http(s) images are fetched and inlined when we
 * can (CORS / host permission permitting), otherwise passed through as a URL
 * for OpenRouter to download itself.
 */
async function prepareImage(input: string): Promise<string> {
  if (input.startsWith('data:')) return normalizeImage(await urlToBlob(input));
  if (/^https?:/i.test(input)) {
    try {
      return normalizeImage(await urlToBlob(input));
    } catch {
      return input;
    }
  }
  throw new Error('That image can’t be read directly — use Screenshot → Prompt on it instead.');
}

/** Run one vision job end-to-end, mirroring progress into session storage for the panel. */
async function runVision(
  mode: VisionMode,
  input: string,
  source?: { title?: string; url?: string },
  id = newId(),
): Promise<VisionJob> {
  const job: VisionJob = { id, mode, status: 'working', source, ts: Date.now() };
  const provider = await resolveVisionProvider();
  job.provider = provider;
  await writeVisionJob(job);
  try {
    job.image = await prepareImage(input);
    await writeVisionJob(job);
  } catch (err) {
    Object.assign(job, { status: 'error', error: errMsg(err) });
    await writeVisionJob(job);
    return job;
  }

  const context = [source?.title, source?.url].filter(Boolean).join(' — ');
  let res: AiResult;
  try {
    if (provider === 'openrouter') {
      const [key, model] = await Promise.all([loadOpenRouterKey(), loadOpenRouterModel()]);
      res = await openRouterAi(key, model, VISION_TASK[mode], context, undefined, undefined, job.image);
    } else res = await cliAi(provider, VISION_TASK[mode], context, undefined, undefined, job.image);
  } catch (error) { res = { ok: false, error: errMsg(error) }; }
  if (res.ok && res.text) {
    Object.assign(job, { status: 'done', text: res.text, model: res.model });
    const thumb = job.image?.startsWith('data:') ? await thumbnail(job.image) : (job.image ?? '');
    void addVisionHistory({ id, mode, ts: job.ts, thumb, text: res.text, source });
  } else {
    Object.assign(job, { status: 'error', error: res.error || 'Vision request failed.', hint: res.hint });
  }
  await writeVisionJob(job);
  return job;
}

/** Drag-select a region in `tab`, capture it, and run the vision job. */
async function screenshotFlow(tab: chrome.tabs.Tab, mode: VisionMode): Promise<CaptureResult> {
  if (tab.id === undefined || tab.windowId === undefined) return { ok: false, error: 'No active tab.' };
  const id = newId();
  await writeVisionJob({ id, mode, status: 'picking', source: { title: tab.title, url: tab.url }, ts: Date.now() });
  try {
    // Let the side panel finish opening (it resizes the page) before the overlay appears.
    await sleep(300);
    const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pickRegion });
    const region = inj?.result ?? null;
    if (!region) {
      await chrome.storage.session.remove('pf_vision_job');
      return { ok: false, error: 'Capture cancelled.' };
    }
    const image = await captureRegion(tab.windowId, region);
    void runVision(mode, image, { title: region.pageTitle, url: region.pageUrl }, id);
    return { ok: true };
  } catch (err) {
    const msg = errMsg(err);
    const needsPermission = /permission|cannot access|activeTab|all_urls/i.test(msg);
    await writeVisionJob({
      id,
      mode,
      status: 'error',
      error: needsPermission ? 'PROMPTIFY needs permission to capture this tab.' : msg,
      hint: needsPermission ? 'Turn on Browser Brain in the Ask tab, or use the right-click menu / Alt+Shift+S.' : undefined,
      ts: Date.now(),
    });
    return { ok: false, error: msg, needsPermission };
  }
}

async function captureFromPanel(mode: VisionMode): Promise<CaptureResult> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, error: 'No active tab.' };
  if (!/^https?:|^file:/i.test(tab.url ?? 'https:')) {
    return { ok: false, error: 'Chrome doesn’t allow capturing this page. Switch to a normal website tab.' };
  }
  return screenshotFlow(tab, mode);
}

// ══════════════════════════════════════════════════════════════════
// AI Hub handoffs — open ChatGPT / Claude / DeepSeek … with the prompt typed in
// ══════════════════════════════════════════════════════════════════
const HANDOFF_PREFIX = 'pf_handoff_';
const HANDOFF_TTL = 3 * 60 * 1000;

async function openHandoffs(hubIds: string[], text: string, autoSend: boolean): Promise<void> {
  const hubs = hubIds.map(hubById).filter((h): h is NonNullable<typeof h> => Boolean(h));
  for (const [i, hub] of hubs.entries()) {
    const tab = await chrome.tabs.create({ url: hub.url, active: i === 0 });
    if (tab.id !== undefined) {
      const payload: Handoff & { ts: number } = { text, autoSend, ts: Date.now() };
      await chrome.storage.session.set({ [`${HANDOFF_PREFIX}${tab.id}`]: payload });
    }
  }
}

async function claimHandoff(tabId: number | undefined): Promise<Handoff | null> {
  if (tabId === undefined) return null;
  const key = `${HANDOFF_PREFIX}${tabId}`;
  const stored = (await chrome.storage.session.get(key))[key] as (Handoff & { ts: number }) | undefined;
  if (!stored) return null;
  await chrome.storage.session.remove(key);
  return Date.now() - stored.ts < HANDOFF_TTL ? { text: stored.text, autoSend: stored.autoSend } : null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`${HANDOFF_PREFIX}${tabId}`).catch(() => undefined);
});

/** The user's "Ask all" line-up and auto-send preference (set in the AI Hub tab). */
async function loadHubPrefs(): Promise<{ askAll: string[]; autoSend: boolean }> {
  const r = await chrome.storage.local.get(['pf_hub_askall', 'pf_hub_autosend']);
  return {
    askAll: (r.pf_hub_askall as string[] | undefined)?.length ? (r.pf_hub_askall as string[]) : DEFAULT_ASK_ALL,
    autoSend: r.pf_hub_autosend === true,
  };
}

// ══════════════════════════════════════════════════════════════════
// Personal memory
// ══════════════════════════════════════════════════════════════════
async function recordIfEnabled(page: Parameters<typeof recordMemoryPage>[0]): Promise<void> {
  if (await loadMemoryOn()) await recordMemoryPage(page);
}

// ══════════════════════════════════════════════════════════════════
// Universal AI right-click menu
// ══════════════════════════════════════════════════════════════════
type Ctx = chrome.contextMenus.ContextType;

type MenuAction =
  | {
      kind: 'ai';
      task: AiTask;
      title: string;
      usePageText?: boolean;
      product?: boolean;
      /** Prefix sent before the selection, e.g. a target language. */
      prefix?: string;
      links?: (q: string, tab?: chrome.tabs.Tab) => { label: string; url: string }[];
    }
  | { kind: 'open'; url: (q: string, tab?: chrome.tabs.Tab, info?: chrome.contextMenus.OnClickData) => string | null; product?: boolean }
  | { kind: 'vision'; mode: VisionMode }
  | { kind: 'shot' }
  | { kind: 'send'; hub: string | 'all' }
  | { kind: 'save' }
  | { kind: 'voice' };

interface MenuItem {
  id: string;
  title: string;
  contexts: Ctx[];
  parentId?: string;
  separator?: boolean;
  visible?: boolean;
  action?: MenuAction;
}

const enc = encodeURIComponent;
const SEL: Ctx[] = ['selection'];
const IMG: Ctx[] = ['image'];
const PAGE: Ctx[] = ['page'];

/** Strip store prefixes/suffixes from a product page title. */
function productQuery(selection: string, tab?: chrome.tabs.Tab): string {
  if (selection.trim()) return selection.trim().slice(0, 140);
  return (tab?.title ?? '')
    .replace(/^(amazon\.[a-z.]+|buy)\s*[:|-]\s*/i, '')
    .replace(/\s*[:|–—-]\s*(amazon|flipkart|myntra|ebay|walmart|best buy|target|etsy|croma|reliance digital)[^]*$/i, '')
    .split(/\s[|]\s/)[0]
    .trim()
    .slice(0, 140);
}

const CODE_LANGS = ['Python', 'TypeScript', 'JavaScript', 'Go', 'Rust', 'Java', 'C#', 'Swift'];

const MENU: MenuItem[] = [
  { id: 'pk', title: 'PROMPTIFY AI', contexts: ['selection', 'image', 'page'] },

  // ── Text selection ──
  { id: 'pk-ask',       parentId: 'pk', contexts: SEL, title: 'Ask AI about “%s”', action: { kind: 'ai', task: 'ai-search', title: 'AI answer' } },
  { id: 'pk-rewrite',   parentId: 'pk', contexts: SEL, title: 'Rewrite',            action: { kind: 'ai', task: 'improve', title: 'Rewritten' } },
  { id: 'pk-explain',   parentId: 'pk', contexts: SEL, title: 'Explain',            action: { kind: 'ai', task: 'explain-text', title: 'Explained' } },
  { id: 'pk-translate', parentId: 'pk', contexts: SEL, title: 'Translate → English', action: { kind: 'ai', task: 'translate-english', title: 'English translation' } },
  { id: 'pk-summarize', parentId: 'pk', contexts: SEL, title: 'Summarize',          action: { kind: 'ai', task: 'summarize', title: 'Summary' } },
  { id: 'pk-factcheck', parentId: 'pk', contexts: SEL, title: 'Fact check',         action: { kind: 'ai', task: 'fact-check', title: 'Fact check' } },
  { id: 'pk-research',  parentId: 'pk', contexts: SEL, title: 'Research on Perplexity ↗', action: { kind: 'open', url: (q) => `https://www.perplexity.ai/search?q=${enc(q)}` } },
  { id: 'pk-sep-1',     parentId: 'pk', contexts: SEL, title: '', separator: true },

  // ── Code (shown when the selection looks like code) ──
  { id: 'pk-code', parentId: 'pk', contexts: SEL, title: 'Code', visible: false },
  { id: 'pk-code-explain', parentId: 'pk-code', contexts: SEL, title: 'Explain',        action: { kind: 'ai', task: 'code-explain', title: 'Code explained' } },
  { id: 'pk-code-debug',   parentId: 'pk-code', contexts: SEL, title: 'Debug',          action: { kind: 'ai', task: 'debug', title: 'Debug' } },
  { id: 'pk-code-opt',     parentId: 'pk-code', contexts: SEL, title: 'Optimize',       action: { kind: 'ai', task: 'code-optimize', title: 'Optimized' } },
  { id: 'pk-code-conv',    parentId: 'pk-code', contexts: SEL, title: 'Convert to' },
  ...CODE_LANGS.map((lang): MenuItem => ({
    id: `pk-code-conv-${lang}`, parentId: 'pk-code-conv', contexts: SEL, title: lang,
    action: { kind: 'ai', task: 'code-convert', title: `Converted → ${lang}`, prefix: `Target language: ${lang}` },
  })),
  { id: 'pk-code-doc',     parentId: 'pk-code', contexts: SEL, title: 'Document',       action: { kind: 'ai', task: 'code-document', title: 'Documented' } },
  { id: 'pk-code-test',    parentId: 'pk-code', contexts: SEL, title: 'Write tests',    action: { kind: 'ai', task: 'code-tests', title: 'Tests' } },
  { id: 'pk-code-review',  parentId: 'pk-code', contexts: SEL, title: 'Review',         action: { kind: 'ai', task: 'code-review', title: 'Code review' } },

  // ── Product (shown on shopping pages) ──
  { id: 'pk-product', parentId: 'pk', contexts: ['selection', 'page'], title: 'Product', visible: false },
  { id: 'pk-prod-compare', parentId: 'pk-product', contexts: ['selection', 'page'], title: 'Compare with rivals', action: { kind: 'ai', task: 'product-compare', title: 'Comparison', product: true } },
  { id: 'pk-prod-cheaper', parentId: 'pk-product', contexts: ['selection', 'page'], title: 'Find cheaper ↗', action: { kind: 'open', product: true, url: (q) => `https://www.google.com/search?tbm=shop&q=${enc(q)}` } },
  {
    id: 'pk-prod-reviews', parentId: 'pk-product', contexts: ['selection', 'page'], title: 'Summarize reviews',
    action: {
      kind: 'ai', task: 'product-reviews', title: 'Reviews', usePageText: true, product: true,
      links: (q) => [
        { label: 'Reddit reviews ↗', url: `https://www.google.com/search?q=${enc(`${q} review site:reddit.com`)}` },
        { label: 'YouTube reviews ↗', url: `https://www.youtube.com/results?search_query=${enc(`${q} review`)}` },
      ],
    },
  },
  { id: 'pk-prod-alts', parentId: 'pk-product', contexts: ['selection', 'page'], title: 'Alternatives', action: { kind: 'ai', task: 'product-alternatives', title: 'Alternatives', product: true } },
  {
    id: 'pk-prod-history', parentId: 'pk-product', contexts: ['selection', 'page'], title: 'Price history ↗',
    action: {
      kind: 'open', product: true,
      url: (q, tab) =>
        /amazon\./i.test(tab?.url ?? '')
          ? `https://camelcamelcamel.com/search?sq=${enc(tab?.url ?? q)}`
          : `https://www.google.com/search?q=${enc(`${q} price history`)}`,
    },
  },

  // ── Send to another AI ──
  { id: 'pk-send', parentId: 'pk', contexts: SEL, title: 'Send to AI' },
  { id: 'pk-send-all', parentId: 'pk-send', contexts: SEL, title: 'Ask all my AIs', action: { kind: 'send', hub: 'all' } },
  { id: 'pk-send-sep', parentId: 'pk-send', contexts: SEL, title: '', separator: true },
  ...AI_HUBS.map((h): MenuItem => ({ id: `pk-send-${h.id}`, parentId: 'pk-send', contexts: SEL, title: h.name, action: { kind: 'send', hub: h.id } })),
  { id: 'pk-save', parentId: 'pk', contexts: SEL, title: 'Save as prompt', action: { kind: 'save' } },

  // ── Images ──
  { id: 'pk-img-dna',      parentId: 'pk', contexts: IMG, title: 'Extract Prompt DNA',              action: { kind: 'vision', mode: 'dna' } },
  { id: 'pk-img-prompts',  parentId: 'pk', contexts: IMG, title: 'Generate prompts (image · video · UI)', action: { kind: 'vision', mode: 'prompts' } },
  { id: 'pk-img-describe', parentId: 'pk', contexts: IMG, title: 'Describe',                        action: { kind: 'vision', mode: 'describe' } },
  { id: 'pk-img-analyze',  parentId: 'pk', contexts: IMG, title: 'Analyze',                         action: { kind: 'vision', mode: 'analyze' } },
  { id: 'pk-img-remix',    parentId: 'pk', contexts: IMG, title: 'Edit / Remix prompts',            action: { kind: 'vision', mode: 'remix' } },
  {
    id: 'pk-img-similar', parentId: 'pk', contexts: IMG, title: 'Find similar (Google Lens) ↗',
    action: { kind: 'open', url: (_q, _t, info) => (info?.srcUrl && /^https?:/i.test(info.srcUrl) ? `https://lens.google.com/uploadbyurl?url=${enc(info.srcUrl)}` : null) },
  },

  // ── Page ──
  { id: 'pk-shot',     parentId: 'pk', contexts: PAGE, title: 'Screenshot → Perfect Prompt', action: { kind: 'shot' } },
  { id: 'pk-page-sum', parentId: 'pk', contexts: PAGE, title: 'Summarize this page',          action: { kind: 'ai', task: 'summarize', title: 'Page summary', usePageText: true } },
  { id: 'pk-voice',    parentId: 'pk', contexts: PAGE, title: 'Talk to your browser',         action: { kind: 'voice' } },
];

const MENU_BY_ID = new Map(MENU.map((m) => [m.id, m]));

function buildContextMenus(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    for (const m of MENU) {
      chrome.contextMenus.create(
        {
          id: m.id,
          parentId: m.parentId,
          title: m.title || undefined,
          contexts: m.contexts as [Ctx, ...Ctx[]],
          type: m.separator ? 'separator' : 'normal',
          visible: m.visible ?? true,
        },
        () => void chrome.runtime.lastError, // swallow duplicate-id races
      );
    }
    menuState = { code: false, product: false };
  });
}

// Adapt the menu to what's under the cursor (reported by the selection rail on
// mouseup / right-mousedown, i.e. before Chrome builds the menu).
let menuState = { code: false, product: false };
function updateMenuContext(code: boolean, product: boolean): void {
  if (!chrome.contextMenus) return;
  if (code !== menuState.code) chrome.contextMenus.update('pk-code', { visible: code }, () => void chrome.runtime.lastError);
  if (product !== menuState.product) chrome.contextMenus.update('pk-product', { visible: product }, () => void chrome.runtime.lastError);
  menuState = { code, product };
}

/** Make sure the selection-rail content script is alive in `tabId` (it isn't in tabs opened before install). */
async function ensureRail(tabId: number): Promise<boolean> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, { type: 'pf-ping' })) as { ok?: boolean } | undefined;
    if (r?.ok) return true;
  } catch {
    /* not injected — inject below */
  }
  const files = chrome.runtime.getManifest().content_scripts?.find((c) => c.js?.some((f) => f.includes('selection')))?.js;
  if (!files?.length) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    await sleep(150);
    return true;
  } catch {
    return false;
  }
}

async function sendToRail(tabId: number, cmd: TabCommand): Promise<void> {
  if (!(await ensureRail(tabId))) return;
  await chrome.tabs.sendMessage(tabId, cmd).catch(() => undefined);
}

function openSidePanelFor(tab?: chrome.tabs.Tab): void {
  // Must be called synchronously inside the user gesture (menu click / command).
  try {
    if (tab?.id !== undefined) void chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    else if (tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  } catch {
    /* side panel unavailable — the job still runs and shows next time it opens */
  }
}

function requestVoice(tab?: chrome.tabs.Tab): void {
  openSidePanelFor(tab);
  void chrome.storage.session.set({ pf_voice_request: Date.now() });
}

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  const item = MENU_BY_ID.get(String(info.menuItemId));
  const action = item?.action;
  if (!action) return;
  const text = (info.selectionText ?? '').trim();

  switch (action.kind) {
    case 'ai': {
      if (tab?.id === undefined) return;
      const q = action.product ? productQuery(text, tab) : text;
      void sendToRail(tab.id, {
        type: 'pf-runAi',
        task: action.task,
        title: action.title,
        text: action.prefix ? `${action.prefix}\n\n${text}` : text,
        usePageText: action.usePageText,
        product: action.product,
        links: action.links?.(q, tab),
      });
      return;
    }
    case 'open': {
      const q = action.product ? productQuery(text, tab) : text;
      const url = action.url(q, tab, info);
      if (url) void chrome.tabs.create({ url, index: tab ? tab.index + 1 : undefined });
      return;
    }
    case 'vision':
      openSidePanelFor(tab);
      if (info.srcUrl) void runVision(action.mode, info.srcUrl, { title: tab?.title, url: info.pageUrl });
      return;
    case 'shot':
      openSidePanelFor(tab);
      if (tab) void screenshotFlow(tab, 'prompts');
      return;
    case 'send':
      void loadHubPrefs().then(({ askAll, autoSend }) =>
        openHandoffs(action.hub === 'all' ? askAll : [action.hub], text, autoSend),
      );
      return;
    case 'save':
      void handleSavePrompt(text.length > 42 ? `${text.slice(0, 42).trim()}…` : text, text);
      return;
    case 'voice':
      requestVoice(tab);
      return;
  }
});

// ── Keyboard shortcuts (rebind at chrome://extensions/shortcuts) ──
chrome.commands?.onCommand.addListener((command, tab) => {
  if (command === 'screenshot-prompt') {
    openSidePanelFor(tab);
    if (tab) void screenshotFlow(tab, 'prompts');
  } else if (command === 'talk-to-browser') {
    requestVoice(tab);
  }
});


/**
 * One-time move to the Charcoal design for installs that predate it. Other
 * appearance choices (density, font size, layout…) are kept, and the user can
 * pick any other preset afterwards — this never runs twice.
 */
async function adoptCharcoalOnce(): Promise<void> {
  const data = await chrome.storage.local.get(['pf_charcoal_v1', 'pf_appearance_v1']);
  if (data.pf_charcoal_v1) return;
  const current = normalizeTheme(data.pf_appearance_v1 ?? {});
  await chrome.storage.local.set({ pf_appearance_v1: { ...applyPreset(current, 'charcoal'), appearance: 'dark' }, pf_charcoal_v1: true });
}

// ══════════════════════════════════════════════════════════════════
// Usage rings — live % of each signed-in CLI account's plan limits
// ══════════════════════════════════════════════════════════════════
const USAGE_KEY_SNAPSHOT = 'pf_usage_snapshot';
const USAGE_TTL = 3 * 60 * 1000;
let usageInflight: Promise<UsageSnapshot> | null = null;

/**
 * Cached for a few minutes because every refresh starts the local CLIs. Only
 * percentages and reset times are kept — never emails, plans or tokens — so
 * the snapshot is safe to hand to the quick tool on ordinary web pages.
 */
async function usageSnapshot(force = false): Promise<UsageSnapshot> {
  const active = await loadAiProvider();
  const cached = (await chrome.storage.local.get(USAGE_KEY_SNAPSHOT))[USAGE_KEY_SNAPSHOT] as UsageSnapshot | undefined;
  if (cached && !force && Date.now() - cached.ts < USAGE_TTL) return { ...cached, active };
  if (usageInflight) return usageInflight;
  usageInflight = (async () => {
    const status = await nativeRequest({ action: 'status' });
    if (!status.ok) return { ts: Date.now(), rings: cached?.rings ?? [], active };
    const providers = (['claude', 'codex'] as const).filter((id) => status.providers?.[id]?.authenticated);
    const rings: UsageRing[] = [];
    for (const provider of providers) {
      const result = await nativeRequest({ action: 'telemetry', provider });
      const limits = result.telemetry?.limits ?? [];
      if (!limits.length) continue;
      const short = [...limits].sort((a, b) => (a.windowMinutes ?? 1e9) - (b.windowMinutes ?? 1e9))[0];
      const weekly = limits.find((w) => w.windowMinutes === 10080);
      rings.push({
        provider, used: Math.round(short.usedPercent), label: short.label, resetsAt: short.resetsAt,
        ...(weekly && weekly !== short ? { weekly: Math.round(weekly.usedPercent) } : {}),
      });
    }
    const snapshot: UsageSnapshot = { ts: Date.now(), rings };
    await chrome.storage.local.set({ [USAGE_KEY_SNAPSHOT]: snapshot });
    return { ...snapshot, active };
  })().finally(() => { usageInflight = null; });
  return usageInflight;
}

// ══════════════════════════════════════════════════════════════════
// Side panel open/closed per window — the web quick tool hides while the
// panel is open (the panel carries its own dock).
// ══════════════════════════════════════════════════════════════════
const QUICK_ROUTES = ['settings', 'connections', 'home', 'ask', 'news', 'tools', 'vision', 'prompts', 'analysis'];
const panelPorts = new Map<number, number>();

async function isPanelOpen(windowId?: number): Promise<boolean> {
  if (windowId === undefined) return false;
  if ((panelPorts.get(windowId) ?? 0) > 0) return true;
  // After a worker restart the port map is empty until the panel reconnects.
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] });
    return contexts.some((c) => c.windowId === windowId);
  } catch {
    return false;
  }
}

async function broadcastPanelState(windowId: number, open: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId });
  for (const tab of tabs) {
    if (tab.id !== undefined) void chrome.tabs.sendMessage(tab.id, { type: 'pk-panelState', open }).catch(() => undefined);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  const match = /^pk-panel:(\d+)$/.exec(port.name);
  if (!match || port.sender?.id !== chrome.runtime.id) return;
  const windowId = Number(match[1]);
  panelPorts.set(windowId, (panelPorts.get(windowId) ?? 0) + 1);
  void broadcastPanelState(windowId, true);
  port.onDisconnect.addListener(() => {
    const left = (panelPorts.get(windowId) ?? 1) - 1;
    if (left > 0) panelPorts.set(windowId, left);
    else { panelPorts.delete(windowId); void broadcastPanelState(windowId, false); }
  });
});
