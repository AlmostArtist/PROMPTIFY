import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_SAFE_ARGS = ['--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands', '--no-chrome'];

// Read-only control messages only: no user prompt or model turn is created.
export async function withControl(provider, work) {
  const cwd = await mkdtemp(join(tmpdir(), 'promptify-status-'));
  const args = provider === 'codex' ? ['app-server', '--stdio']
    : ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', ...CLAUDE_SAFE_ARGS];
  const child = spawn(provider, args, { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', bytes = 0, nextId = 0;
  const pending = new Map();
  const fail = () => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('CLI metadata connection closed.')); } pending.clear(); };
  child.stdin.on('error', () => {});
  child.stderr.on('data', () => {});
  child.on('error', fail); child.on('close', fail);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4 * 1024 * 1024) { fail(); child.kill(); return; }
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const id = provider === 'codex' ? msg.id : msg.response?.request_id;
      const task = pending.get(String(id));
      if (!task) continue;
      pending.delete(String(id)); clearTimeout(task.timer);
      if (msg.error || msg.response?.subtype === 'error') task.reject(new Error('This CLI does not expose the requested metadata.'));
      else task.resolve(provider === 'codex' ? msg.result : msg.response?.response);
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++nextId);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CLI metadata timed out.')); }, 18000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify(provider === 'codex' ? { id, method, params } : { type: 'control_request', request_id: id, request: { subtype: method, ...params } }) + '\n');
  });
  try {
    const initialized = await request('initialize', provider === 'codex'
      ? { clientInfo: { name: 'promptify', title: 'PROMPTIFY', version: '1.0.0' }, capabilities: { experimentalApi: true } }
      : { hooks: {}, agents: {}, skills: [] });
    if (provider === 'codex') child.stdin.write('{"method":"initialized"}\n');
    return await work(request, initialized);
  } finally {
    child.kill('SIGKILL'); fail();
    await rm(cwd, { recursive: true, force: true });
  }
}

const percent = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
const timestamp = value => {
  const n = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
export function normalizeModels(provider, models = []) {
  return [...new Map(models.filter(m => typeof (m.model ?? m.value) === 'string').map(m => {
    const id = provider === 'codex' ? m.model : m.value;
    return [id, { id, label: m.displayName || id, description: m.description || '', isDefault: Boolean(m.isDefault || id === 'default'), ...(Array.isArray(m.inputModalities) ? { supportsVision: m.inputModalities.includes('image') } : {}) }];
  })).values()];
}
export function normalizeLimits(provider, data) {
  if (provider === 'claude') {
    const limits = data?.rate_limits;
    return Object.entries(limits || {}).flatMap(([id, value]) => {
      if (!['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus'].includes(id) || percent(value?.utilization) === null) return [];
      return [{ id, label: ({ five_hour: '5-hour limit', seven_day: 'Weekly limit', seven_day_sonnet: 'Sonnet weekly', seven_day_opus: 'Opus weekly' })[id], usedPercent: percent(value.utilization), windowMinutes: id === 'five_hour' ? 300 : 10080, resetsAt: timestamp(value.resets_at) }];
    });
  }
  const buckets = Object.values(data?.rateLimitsByLimitId || {});
  return (buckets.length ? buckets : data?.rateLimits ? [data.rateLimits] : []).flatMap((bucket, index) => ['primary', 'secondary'].flatMap(key => {
    const window = bucket[key];
    if (percent(window?.usedPercent) === null) return [];
    const duration = window.windowDurationMins;
    const label = duration === 300 ? '5-hour limit' : duration === 10080 ? 'Weekly limit' : duration ? `${duration / 60}-hour limit` : 'Account limit';
    return [{ id: `${bucket.limitId || index}-${key}`, label: buckets.length > 1 ? `${bucket.limitName || bucket.limitId} · ${label}` : label,
      usedPercent: percent(window.usedPercent), windowMinutes: duration || null, resetsAt: timestamp(window.resetsAt) }];
  }));
}

export async function readTelemetry(provider, control = withControl) {
  return control(provider, async (request, initialized) => {
    const modelsTask = async () => {
      if (provider === 'claude') return normalizeModels(provider, initialized.models);
      const models = [], seen = new Set();
      let cursor;
      do {
        const page = await request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
        models.push(...(page.data || []));
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error('Repeated model page.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      return normalizeModels(provider, models);
    };
    const [catalog, limits, identity] = await Promise.allSettled([modelsTask(), request(provider === 'codex' ? 'account/rateLimits/read' : 'get_usage'),
      provider === 'codex' ? request('account/read', { refreshToken: false }) : Promise.resolve(initialized.account)]);
    const models = catalog.status === 'fulfilled' ? catalog.value : [];
    const windows = limits.status === 'fulfilled' ? normalizeLimits(provider, limits.value) : [];
    return { models, limits: windows, fetchedAt: Date.now(),
      account: identity.status === 'fulfilled' ? normalizeAccount(provider, provider === 'codex' ? identity.value?.account : identity.value) : undefined,
      ...(!models.length ? { modelsError: 'Model catalog unavailable. Update your CLI, then refresh.' } : {}),
      ...(!windows.length ? { limitsError: 'This CLI or account does not report subscription limits.' } : {}) };
  });
}

// Input includes cached reads and cache writes; these are subsets, not extra totals.
export function normalizeTokens(provider, usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  if (typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') return undefined;
  const cachedInput = number(provider === 'codex' ? usage.cached_input_tokens : usage.cache_read_input_tokens);
  const cacheWrite = provider === 'claude' ? number(usage.cache_creation_input_tokens) : 0;
  return { input: number(usage.input_tokens) + (provider === 'claude' ? cachedInput + cacheWrite : 0), output: number(usage.output_tokens), cachedInput, cacheWrite };
}

// Identity is only returned to the extension's account-management page. Never copy
// auth objects: keys, tokens, account IDs and billing details are intentionally omitted.
export function normalizeAccount(provider, account) {
  if (!account || typeof account !== 'object') return undefined;
  const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : undefined;
  const email = text(account.email);
  const plan = text(provider === 'codex' ? account.planType : account.subscriptionType);
  const organization = provider === 'claude' ? text(account.orgName || account.organization) : undefined;
  const method = provider === 'codex' ? ({ chatgpt: 'ChatGPT account', apiKey: 'API key', amazonBedrock: 'Amazon Bedrock' })[account.type]
    : ({ oauth: 'Claude account', 'oauth_token': 'Claude account', 'claude.ai': 'Claude account', console: 'Anthropic Console', api_key: 'API key' })[account.authMethod];
  const apiProvider = provider === 'claude' ? text(account.apiProvider) : undefined;
  if (!email && !plan && !organization && !method && !apiProvider) return undefined;
  return { ...(email ? { email } : {}), ...(plan ? { plan } : {}), ...(organization ? { organization } : {}), ...(method ? { method } : {}), ...(apiProvider ? { apiProvider } : {}) };
}
