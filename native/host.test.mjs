import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { claudeImageVersionIsSafe, dispatch, run } from './host.mjs';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('rejects unknown actions, providers and invalid prompts without executing commands', async () => {
  const execute = () => { throw new Error('Must not run'); };
  for (const request of [null, { action: 'exec', provider: 'codex' }, { action: 'login', provider: 'bash' },
    { action: 'generate', provider: 'claude', prompt: '' }, { action: 'generate', provider: 'codex', prompt: 'a'.repeat(100001) }]) {
    assert.equal((await dispatch(request, execute)).ok, false);
  }
});

test('status distinguishes missing CLI and signed-out CLI and never exposes account data', async () => {
  const result = await dispatch({ action: 'status' }, async (command, args) => {
    if (command === 'codex') return { ok: false, error: 'CLI unavailable.' };
    return { ok: args[0] === '--version', output: 'secret-account-info' };
  });
  assert.equal(result.providers.codex.installed, false);
  assert.deepEqual(result.providers.claude, { installed: true, authenticated: false });
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('login invokes only official commands and does not return login output', async () => {
  for (const provider of ['codex', 'claude']) {
    const result = await dispatch({ action: 'login', provider }, async (command, args) => {
      assert.equal(command, provider);
      assert.deepEqual(args, provider === 'codex' ? ['login'] : ['auth', 'login']);
      return { ok: true, output: 'sensitive-login-output' };
    });
    assert.deepEqual(result, { ok: true });
  }
});

test('Claude prompt is stdin data, tools and MCP are disabled, temp folder is removed', async () => {
  let folder;
  const prompt = '$(touch unsafe); --dangerously-skip-permissions';
  const result = await dispatch({ action: 'generate', provider: 'claude', prompt }, async (command, args, options) => {
    assert.equal(command, 'claude');
    assert.ok(!args.includes(prompt));
    assert.equal(options.input, prompt);
    assert.equal(args[args.indexOf('--tools') + 1], '');
    assert.ok(args.includes('--strict-mcp-config'));
    folder = options.cwd;
    return { ok: true, output: JSON.stringify({ result: 'Useful answer', is_error: false }) };
  });
  assert.deepEqual(result, { ok: true, text: 'Useful answer' });
  await assert.rejects(access(folder));
});

test('Codex uses read-only mode and reads final output rather than CLI logs', async () => {
  const result = await dispatch({ action: 'generate', provider: 'codex', prompt: 'Rewrite this.' }, async (_, args) => {
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.ok(args.includes('--ignore-user-config'));
    assert.equal(args[args.indexOf('--disable') + 1], 'shell_tool');
    await writeFile(args[args.indexOf('--output-last-message') + 1], 'Final answer');
    return { ok: true, output: 'Internal logs' };
  });
  assert.deepEqual(result, { ok: true, text: 'Final answer' });
});

test('provider failures return actionable errors without raw CLI output', async () => {
  const result = await dispatch({ action: 'generate', provider: 'claude', prompt: 'Hello' }, async () => ({ ok: false, output: 'private logs' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /CLI request failed/);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('macOS screenshot requests stop before old Claude Code extracts an unsigned native module', async () => {
  const calls = [];
  const result = await dispatch({ action: 'generate', provider: 'claude', prompt: 'Describe this.', image: TINY_PNG }, async (command, args) => {
    calls.push([command, args]);
    return { ok: true, output: '2.1.177 (Claude Code)' };
  }, 'darwin');
  assert.equal(result.ok, false);
  assert.match(result.error, /2\.1\.265 or newer/);
  assert.match(result.error, /claude update/);
  assert.deepEqual(calls, [['claude', ['--version']]]);
});

test('Claude image compatibility accepts the fixed release and later versions', () => {
  assert.equal(claudeImageVersionIsSafe('2.1.177 (Claude Code)', 'darwin'), false);
  assert.equal(claudeImageVersionIsSafe('2.1.265 (Claude Code)', 'darwin'), true);
  assert.equal(claudeImageVersionIsSafe('claude 2.2.0', 'darwin'), true);
  assert.equal(claudeImageVersionIsSafe('unknown', 'darwin'), false);
  assert.equal(claudeImageVersionIsSafe('2.0.1', 'linux'), true);
});

test('run handles missing executables and enforces process timeout', async () => {
  const missing = await run('/nonexistent/promptify-executable', []);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not installed/);
  const timed = await run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 30 });
  assert.equal(timed.ok, false);
  assert.match(timed.error, /timed out/);
});

test('native messaging handles fragmented UTF-8 frames and keeps stdout protocol-only', async () => {
  const body = Buffer.from(JSON.stringify({ action: 'unknown', provider: 'claude', prompt: '你好' }));
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  const frame = Buffer.concat([header, body]);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./host.mjs', import.meta.url))]);
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('No native reply')); }, 3000);
    let data = Buffer.alloc(0);
    child.stdout.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length >= 4 && data.length >= data.readUInt32LE() + 4) {
        clearTimeout(timeout); child.stdin.end(); resolve(JSON.parse(data.subarray(4).toString()));
      }
    });
    child.on('error', reject);
    child.stdin.write(frame.subarray(0, 2));
    setTimeout(() => child.stdin.write(frame.subarray(2)), 10);
  });
  assert.deepEqual(response, { ok: false, error: 'Unknown companion action.' });
});

test('logout invokes only the official sign-out commands and does not return their output', async () => {
  for (const provider of ['codex', 'claude']) {
    const result = await dispatch({ action: 'logout', provider }, async (command, args) => {
      assert.equal(command, provider);
      assert.deepEqual(args, provider === 'codex' ? ['logout'] : ['auth', 'logout']);
      return { ok: true, output: 'sensitive-logout-output' };
    });
    assert.deepEqual(result, { ok: true });
  }
  assert.equal((await dispatch({ action: 'logout', provider: 'bash' }, () => { throw new Error('Must not run'); })).ok, false);
});

test('failed requests surface the CLI explanation (e.g. usage limits) instead of a generic guess', async () => {
  const limit = 'You’ve hit your usage limit. Try again at 1:37 AM.';
  const codex = await dispatch({ action: 'generate', provider: 'codex', prompt: 'Hi' }, async () => ({
    ok: false,
    output: ['{"type":"turn.started"}', `{"type":"error","message":"${limit}"}`, `{"type":"turn.failed","error":{"message":"${limit}"}}`].join('\n'),
  }));
  assert.deepEqual(codex, { ok: false, error: limit });

  const claude = await dispatch({ action: 'generate', provider: 'claude', prompt: 'Hi' }, async () => ({
    ok: true, output: JSON.stringify({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1760000000' }),
  }));
  assert.equal(claude.ok, false);
  assert.match(claude.error, /^Claude AI usage limit reached\. Resets at /);
});
