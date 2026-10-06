#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readTelemetry, normalizeTokens, normalizeAccount, CLAUDE_SAFE_ARGS } from './telemetry.mjs';
import { decodeImage, claudeImageMessage, REQUEST_LIMIT } from './images.mjs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 512 * 1024;
const children = new Set();
const MIN_SAFE_CLAUDE_IMAGE_VERSION = [2, 1, 265];

export function claudeImageVersionIsSafe(versionOutput, operatingSystem = platform()) {
  if (operatingSystem !== 'darwin') return true;
  const match = typeof versionOutput === 'string' && versionOutput.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) return false;
  const installed = match.slice(1).map(Number);
  for (let index = 0; index < MIN_SAFE_CLAUDE_IMAGE_VERSION.length; index += 1) {
    if (installed[index] !== MIN_SAFE_CLAUDE_IMAGE_VERSION[index]) {
      return installed[index] > MIN_SAFE_CLAUDE_IMAGE_VERSION[index];
    }
  }
  return true;
}

export function run(command, args, { input = '', cwd, timeout = 150_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    let output = '';
    let bytes = 0;
    let failure;
    const timer = setTimeout(() => { failure = 'CLI timed out. Try again after completing login.'; child.kill('SIGKILL'); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
      bytes += data.length;
      if (bytes > LIMIT) { failure = 'CLI output exceeded the limit.'; child.kill('SIGKILL'); return; }
      // Raw logs stay inside the companion; only whitelisted response fields leave it.
      if (stream === child.stdout) output += data.toString();
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => { failure = error.code === 'ENOENT' ? 'CLI is not installed or is not on PATH.' : 'Could not start the CLI.'; });
    child.on('close', (code) => {
      clearTimeout(timer); children.delete(child);
      resolve({ ok: code === 0 && !failure, output, error: failure });
    });
    child.stdin.end(input);
  });
}

// Turn a failed CLI run into the CLI's own explanation (usage limits, expired
// login…) instead of a generic guess. Only the error text leaves the companion.
export function cliFailure(provider, output = '') {
  const clean = (text) => typeof text === 'string' && text.trim() ? text.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined;
  if (provider === 'codex') {
    let message;
    for (const line of output.split('\n')) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'turn.failed') message = clean(event.error?.message) || message;
        else if (event.type === 'error') message = clean(event.message) || message;
      } catch { /* Non-JSON diagnostics are ignored. */ }
    }
    return message;
  }
  const lines = output.split('\n').filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type !== 'result' && !('is_error' in event)) continue;
      if (!event.is_error) return undefined;
      const text = clean(event.result);
      // e.g. "Claude AI usage limit reached|1760000000"
      const limit = text && /^(.*usage limit reached)\|(\d{9,})$/i.exec(text);
      if (limit) return `${limit[1]}. Resets at ${new Date(Number(limit[2]) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      return text;
    } catch { /* keep looking */ }
  }
  return undefined;
}

export async function dispatch(message, execute = run, operatingSystem = platform()) {
  if (!message || typeof message !== 'object') return { ok: false, error: 'Invalid request.' };
  const { action, provider } = message;
  if (action === 'status') {
    const entries = await Promise.all(['codex', 'claude'].map(async (id) => {
      const version = await execute(id, ['--version'], { timeout: 8000 });
      if (!version.ok) return [id, { installed: false, authenticated: false, error: version.error || 'CLI unavailable.' }];
      const auth = await execute(id, id === 'codex' ? ['login', 'status'] : ['auth', 'status'], { timeout: 12_000 });
      return [id, { installed: true, authenticated: auth.ok, ...(version.output?.match(/\b\d+\.\d+\.\d+\b/) ? { version: version.output.match(/\b\d+\.\d+\.\d+\b/)[0] } : {}), ...(auth.error ? { error: auth.error } : {}) }];
    }));
    return { ok: true, providers: Object.fromEntries(entries) };
  }
  if (provider !== 'codex' && provider !== 'claude') return { ok: false, error: 'Unknown CLI provider.' };
  if (action === 'telemetry') {
    try {
      const [telemetry, auth] = await Promise.all([readTelemetry(provider), provider === 'claude' ? execute('claude', ['auth', 'status'], { timeout: 12000 }) : Promise.resolve(null)]);
      if (auth?.ok) { try { telemetry.account = normalizeAccount(provider, JSON.parse(auth.output)) || telemetry.account; } catch { /* Older CLI output is not copied. */ } }
      return { ok: true, telemetry };
    }
    catch { return { ok: false, error: 'Could not read models and limits. Check your CLI login, update the CLI, then refresh.' }; }
  }
  if (action === 'logout') {
    // Signs the CLI out on this computer (removes its stored credentials).
    const result = await execute(provider, provider === 'codex' ? ['logout'] : ['auth', 'logout'], { timeout: 30_000 });
    return result.ok ? { ok: true } : { ok: false, error: result.error || 'Sign-out did not complete. Run the logout command in your terminal.' };
  }
  if (action === 'login') {
    const result = await execute(provider, provider === 'codex' ? ['login'] : ['auth', 'login'], { timeout: 180_000 });
    return result.ok ? { ok: true } : { ok: false, error: result.error || 'Login did not complete. Run the login command in your terminal, then recheck.' };
  }
  if (action !== 'generate') return { ok: false, error: 'Unknown companion action.' };
  if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 100_000) {
    return { ok: false, error: 'Provide a prompt between 1 and 100,000 characters.' };
  }
  if (message.model !== undefined && (typeof message.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]-]{0,160}$/.test(message.model))) {
    return { ok: false, error: 'Invalid model selection.' };
  }
  let image;
  try { image = decodeImage(message.image); } catch (error) { return { ok: false, error: error.message }; }
  if (image && provider === 'claude' && operatingSystem === 'darwin') {
    const versionCheck = await execute('claude', ['--version'], { timeout: 8_000 });
    const version = versionCheck.output?.match(/\b\d+\.\d+\.\d+\b/)?.[0];
    if (!versionCheck.ok || !claudeImageVersionIsSafe(versionCheck.output, operatingSystem)) {
      return {
        ok: false,
        error: `Claude Code${version ? ` ${version}` : ''} cannot safely process screenshots on macOS. Update to 2.1.265 or newer with “claude update”, then retry. You can also select Codex or OpenRouter for Vision.`,
      };
    }
  }
  const modelArgs = message.model && message.model !== 'default' ? ['--model', message.model] : [];
  const cwd = await mkdtemp(join(tmpdir(), 'promptify-'));
  try {
    const outputPath = join(cwd, 'answer.txt');
    const imagePath = image && provider === 'codex' ? join(cwd, `attachment.${image.extension}`) : undefined;
    if (imagePath) await writeFile(imagePath, image.bytes, { mode: 0o600 });
    const args = provider === 'codex'
      ? ['exec', '--json', ...modelArgs, ...(imagePath ? ['--image', imagePath] : []), '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--disable', 'shell_tool', '--output-last-message', outputPath, '-']
      : ['--print', '--output-format', image ? 'stream-json' : 'json', ...(image ? ['--input-format', 'stream-json', '--verbose'] : []), ...modelArgs, ...CLAUDE_SAFE_ARGS];
    const result = await execute(provider, args, { cwd, input: image && provider === 'claude' ? claudeImageMessage(message.prompt, image) : message.prompt });
    if (!result.ok) return { ok: false, error: result.error || cliFailure(provider, result.output) || (image ? 'Image request failed. Choose an image-capable model in Connect, and check your CLI login and limits.' : 'CLI request failed. Check your CLI version, login and plan limits in your terminal.') };
    let text, usage, model;
    if (provider === 'codex') {
      text = await readFile(outputPath, 'utf8');
      for (const line of result.output.split('\n')) {
        try { const event = JSON.parse(line); if (event.type === 'turn.completed') usage = normalizeTokens(provider, event.usage); } catch { /* Non-JSON diagnostics are ignored. */ }
      }
    }
    else {
      const response = image ? result.output.split('\n').flatMap(line => { try { const event = JSON.parse(line); return event.type === 'result' ? [event] : []; } catch { return []; } }).at(-1) : JSON.parse(result.output);
      if (!response) return { ok: false, error: 'Claude returned no final response. Update Claude Code and retry.' };
      if (response.is_error) return { ok: false, error: cliFailure(provider, JSON.stringify(response)) || 'Claude could not complete this request. Check your account limits in the CLI.' };
      text = response.result;
      usage = normalizeTokens(provider, response.usage);
      const models = Object.keys(response.modelUsage || {});
      if (models.length === 1) model = models[0];
    }
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The CLI returned no answer.' };
    if (Buffer.byteLength(text) > LIMIT) return { ok: false, error: 'The answer is too large. Ask for a shorter response.' };
    return { ok: true, text: text.trim(), ...(usage ? { usage } : {}), ...(model || message.model ? { model: model || message.model } : {}) };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export function startHost() {
  let buffer = Buffer.alloc(0);
  let processing = false;
  const reply = (value) => {
    const body = Buffer.from(JSON.stringify(value));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    process.stdout.write(Buffer.concat([header, body]));
  };
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4) return;
    const length = buffer.readUInt32LE();
    if (length > REQUEST_LIMIT) { reply({ ok: false, error: 'Request too large.' }); process.exitCode = 1; process.stdin.destroy(); return; }
    if (buffer.length < length + 4) return;
    if (processing) return;
    processing = true;
    let request;
    try { request = JSON.parse(buffer.subarray(4, length + 4).toString()); }
    catch { reply({ ok: false, error: 'Invalid JSON.' }); return; }
    void dispatch(request).then(reply).catch(() => reply({ ok: false, error: 'Companion failed. Update your CLI and retry.' }));
  });
  process.stdin.on('end', () => { for (const child of children) child.kill('SIGKILL'); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startHost();
