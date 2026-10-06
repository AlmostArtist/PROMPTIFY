import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/connections.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { nativeRequest, connectionError } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('a worker missing native API bindings returns recovery instructions instead of throwing', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  globalThis.chrome = { runtime: {} };
  const result = await nativeRequest({ action: 'status' });
  assert.equal(result.ok, false);
  assert.match(result.error, /reload/i);
});

test('native requests connect directly because nativeMessaging is a manifest permission', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  let sent;
  const listeners = {};
  const port = {
    disconnect() {},
    postMessage(message) { sent = message; queueMicrotask(() => listeners.message({ ok: true })); },
    onMessage: { addListener(listener) { listeners.message = listener; } },
    onDisconnect: { addListener(listener) { listeners.disconnect = listener; } },
  };
  globalThis.chrome = { runtime: { connectNative: (name) => { assert.equal(name, 'com.promptify.cli'); return port; } } };
  const result = await nativeRequest({ action: 'status' });
  assert.deepEqual(sent, { action: 'status' });
  assert.deepEqual(result, { ok: true });
});

test('native registration errors point to the appropriate recovery action', () => {
  assert.match(connectionError('Specified native messaging host not found.'), /install command/);
  assert.match(connectionError('Access to the specified native messaging host is forbidden.'), /extension ID/);
  assert.match(connectionError('Permission is not declared in optional_permissions'), /Reload/);
});
