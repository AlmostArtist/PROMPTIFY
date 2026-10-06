export type CliProvider = 'codex' | 'claude';
export type AiProvider = 'openrouter' | CliProvider;
export const NATIVE_HOST = 'com.promptify.cli';
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openrouter: 'OpenRouter', codex: 'ChatGPT · Codex CLI', claude: 'Claude Code',
};
export interface CliStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  error?: string;
}
export interface ModelOption { id: string; label: string; description: string; isDefault: boolean; supportsVision?: boolean }
export interface UsageWindow { id: string; label: string; usedPercent: number; windowMinutes: number | null; resetsAt: number | null }
export interface CliAccount { email?: string; plan?: string; organization?: string; method?: string; apiProvider?: string }
export interface ProviderTelemetry { account?: CliAccount; models: ModelOption[]; limits: UsageWindow[]; fetchedAt: number; modelsError?: string; limitsError?: string }
export interface TokenUsage { input: number; output: number; cachedInput: number; cacheWrite: number }
export interface ConnectionResult {
  ok: boolean;
  providers?: Record<CliProvider, CliStatus>;
  telemetry?: ProviderTelemetry;
  usage?: TokenUsage;
  model?: string;
  text?: string;
  error?: string;
}
export type CliRequest =
  | { action: 'status' }
  | { action: 'telemetry'; provider: CliProvider }
  | { action: 'login'; provider: CliProvider }
  | { action: 'logout'; provider: CliProvider }
  | { action: 'generate'; provider: CliProvider; prompt: string; model?: string; image?: string };

export function connectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown connection error.');
  if (/not found|not registered|specified native messaging host/i.test(message)) {
    return 'Chrome could not find the local companion. Run the install command below for this extension ID, then retry.';
  }
  if (/forbidden|not allowed|access.*denied/i.test(message)) {
    return 'The companion is not registered for this extension ID. Run the install command below again, then retry.';
  }
  if (/not declared|optional_permissions|permission.*manifest/i.test(message)) {
    return 'Chrome is still using the old extension permissions. Reload PROMPTIFY at chrome://extensions, then reopen Connect.';
  }
  if (/native host has exited|failed to start|disconnected/i.test(message)) {
    return 'The local companion stopped. Reinstall it with the command below so it uses your current Node.js and CLI paths.';
  }
  return message;
}

export async function loadAiProvider(): Promise<AiProvider> {
  const { pf_ai_provider: provider } = await chrome.storage.local.get('pf_ai_provider');
  return provider === 'codex' || provider === 'claude' ? provider : 'openrouter';
}
export async function saveAiProvider(provider: AiProvider): Promise<void> {
  await chrome.storage.local.set({ pf_ai_provider: provider });
}

/** Only the background worker opens native ports. Credentials never cross this bridge. */
export async function nativeRequest(request: CliRequest): Promise<ConnectionResult> {
  try {
    if (!await chrome.permissions.contains({ permissions: ['nativeMessaging'] })) {
      return { ok: false, error: 'Chrome permission is needed. Open Connect and click Connect ChatGPT or Connect Claude.' };
    }
  } catch (error) { return { ok: false, error: connectionError(error) }; }

  // connectNative is only available when nativeMessaging was granted *before*
  // the service worker started. If the permission was added at runtime (optional
  // permission), Chrome exposes the API only after the worker restarts.
  if (typeof chrome.runtime.connectNative !== 'function') {
    return { ok: false, error: 'Chrome needs to reload the extension to activate the native messaging API. Go to chrome://extensions, click the reload button on PROMPTIFY, then try again.' };
  }

  return new Promise((resolve) => {
    let port: chrome.runtime.Port | undefined;
    let settled = false;
    const finish = (result: ConnectionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      port?.disconnect();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'CLI timed out. Finish signing in in your browser, then recheck.' }), 190_000);
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
      port.onMessage.addListener((result: ConnectionResult) => {
        finish(result && typeof result.ok === 'boolean' ? result : { ok: false, error: 'Invalid companion response. Reinstall the companion.' });
      });
      port.onDisconnect.addListener(() => {
        const reason = chrome.runtime.lastError?.message;
        finish({ ok: false, error: connectionError(reason || 'The local companion disconnected.') });
      });
      port.postMessage(request);
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : 'Could not reach the local companion.' });
    }
  });
}

export async function requestConnections(action: 'status' | 'login' | 'logout' | 'telemetry', provider?: CliProvider): Promise<ConnectionResult> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'cliConnection', action, provider });
    return result && typeof result.ok === 'boolean' ? result : { ok: false, error: 'No response from the extension. Reload it and try again.' };
  } catch {
    return { ok: false, error: 'Could not reach the extension. Reload it and try again.' };
  }
}

export async function loadCliModel(provider: CliProvider, purpose: 'text' | 'vision' = 'text'): Promise<string> {
  const stored = await chrome.storage.local.get(['pf_cli_models', `pf_cli_text_model_${provider}`, `pf_cli_vision_model_${provider}`]);
  const vision = stored[`pf_cli_vision_model_${provider}`];
  const text = stored[`pf_cli_text_model_${provider}`] ?? stored.pf_cli_models?.[provider];
  return purpose === 'vision' && typeof vision === 'string' && vision ? vision : typeof text === 'string' ? text : '';
}
export async function saveCliModel(provider: CliProvider, model: string, purpose: 'text' | 'vision' = 'text'): Promise<void> {
  const key = purpose === 'vision' ? `pf_cli_vision_model_${provider}` : `pf_cli_text_model_${provider}`;
  // Provider-specific keys prevent concurrent model selections overwriting each other.
  await chrome.storage.local.set({ [key]: model });
}

/** Account used by Vision. '' follows the main provider chosen in Connect. */
export type VisionProviderChoice = AiProvider | '';
export async function loadVisionProvider(): Promise<VisionProviderChoice> {
  const { pf_vision_provider: value } = await chrome.storage.local.get('pf_vision_provider');
  return value === 'codex' || value === 'claude' || value === 'openrouter' ? value : '';
}
export async function saveVisionProvider(value: VisionProviderChoice): Promise<void> {
  await chrome.storage.local.set({ pf_vision_provider: value });
}
/** The provider a vision job will actually use. */
export async function resolveVisionProvider(): Promise<AiProvider> {
  return (await loadVisionProvider()) || loadAiProvider();
}
