import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLimits, normalizeModels, normalizeTokens, readTelemetry } from './telemetry.mjs';
import { dispatch } from './host.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import ts from 'typescript';

test('limits preserve actual windows and reset times without exposing account details', () => {
  const limits = normalizeLimits('codex', { accountId: 'private', rateLimits: { primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 2000000000 }, secondary: { usedPercent: 81, windowDurationMins: 10080, resetsAt: null } } });
  assert.equal(limits[0].label, '5-hour limit');
  assert.equal(limits[0].resetsAt, 2000000000000);
  assert.equal(limits[1].resetsAt, null);
  assert.ok(!JSON.stringify(limits).includes('private'));
  assert.deepEqual(normalizeLimits('codex', {}), []);
  const claude = normalizeLimits('claude', { rate_limits: { five_hour: { utilization: 0, resets_at: '2030-01-01T00:00:00Z' }, seven_day: null, extra_usage: { utilization: 90 }, email: 'private' } });
  assert.equal(claude.length, 1);
  assert.equal(claude[0].usedPercent, 0);
  assert.equal(claude[0].resetsAt, Date.parse('2030-01-01T00:00:00Z'));
});

test('model discovery paginates and allows newer account model IDs', async () => {
  const calls = [];
  const data = await readTelemetry('codex', async (_, work) => work(async (method, args) => {
    calls.push([method, args]);
    if (method === 'account/rateLimits/read') throw new Error('Unavailable');
    return args.cursor ? { data: [{ model: 'gpt-6-astra', displayName: 'Astra' }] } : { data: [{ model: 'gpt-new', displayName: 'New' }], nextCursor: 'next' };
  }, {}));
  assert.deepEqual(data.models.map(m => m.id), ['gpt-new', 'gpt-6-astra']);
  assert.match(data.limitsError, /does not report/);
  assert.equal(calls.filter(([method]) => method === 'model/list').length, 2);
  assert.deepEqual(normalizeModels('claude', [{ value: 'claude-fable-5[1m]', displayName: 'Fable', secret: 'private' }]), [{ id: 'claude-fable-5[1m]', label: 'Fable', description: '', isDefault: false }]);
});

test('Claude models remain usable when older CLI cannot report usage', async () => {
  const account = { email: 'me@example.com', subscriptionType: 'pro', authMethod: 'claude.ai', accessToken: 'secret-token', orgId: 'secret-org-id', uuid: 'secret-uuid' };
  const data = await readTelemetry('claude', async (_, work) => work(async () => { throw new Error('Unknown request'); }, { models: [{ value: 'sonnet', displayName: 'Sonnet' }], account }));
  assert.equal(data.models[0].id, 'sonnet');
  assert.equal(data.limits.length, 0);
  // Display fields are shown on the Connect page; credentials and ids never leave the companion.
  assert.deepEqual(data.account, { email: 'me@example.com', plan: 'pro', method: 'Claude account' });
  assert.ok(!JSON.stringify(data).includes('secret'));
});

test('token totals handle provider cache semantics without double counting', () => {
  assert.deepEqual(normalizeTokens('codex', { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20 }), { input: 100, output: 20, cachedInput: 60, cacheWrite: 0 });
  assert.deepEqual(normalizeTokens('claude', { input_tokens: 10, cache_read_input_tokens: 60, cache_creation_input_tokens: 30, output_tokens: 20 }), { input: 100, output: 20, cachedInput: 60, cacheWrite: 30 });
  assert.equal(normalizeTokens('claude', undefined), undefined);
});

test('selected models reach both CLIs and real response tokens are returned', async () => {
  for (const [provider, model] of [['codex', 'gpt-6-astra'], ['claude', 'claude-fable-5[1m]']]) {
    const result = await dispatch({ action: 'generate', provider, model, prompt: 'Hello' }, async (_, args) => {
      assert.equal(args[args.indexOf('--model') + 1], model);
      if (provider === 'codex') {
        assert.ok(args.includes('--json'));
        await writeFile(args[args.indexOf('--output-last-message') + 1], 'Hi');
        return { ok: true, output: JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 5 } }) };
      }
      return { ok: true, output: JSON.stringify({ result: 'Hi', usage: { input_tokens: 50, output_tokens: 5 }, modelUsage: { [model]: {} } }) };
    });
    assert.equal(result.model, model);
    assert.equal(result.usage.input, 50);
    assert.equal(result.usage.output, 5);
  }
  const invalid = await dispatch({ action: 'generate', provider: 'claude', model: '--tools=all', prompt: 'Hi' }, () => { throw new Error('Must not execute'); });
  assert.equal(invalid.ok, false);
});

test('concurrent token updates preserve totals and distinguish unreported requests', async () => {
  const source = await readFile(new URL('../src/lib/token-usage.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const storage = {};
  globalThis.chrome = { storage: { local: {
    get: async key => { await new Promise(resolve => setTimeout(resolve, 3)); return structuredClone({ [key]: storage[key] }); },
    set: async value => { Object.assign(storage, structuredClone(value)); },
  } } };
  const { recordTokenUsage, USAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  await Promise.all([
    recordTokenUsage('codex', { input: 100, output: 20, cachedInput: 60, cacheWrite: 0 }),
    recordTokenUsage('codex', { input: 200, output: 40, cachedInput: 100, cacheWrite: 0 }),
    recordTokenUsage('codex'),
  ]);
  assert.equal(storage[USAGE_KEY].codex.input, 300);
  assert.equal(storage[USAGE_KEY].codex.output, 60);
  assert.equal(storage[USAGE_KEY].codex.requests, 3);
  assert.equal(storage[USAGE_KEY].codex.unreported, 1);
  delete globalThis.chrome;
});
