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
  globalThis.chrome = { permissions: { contains: async () => true }, runtime: {} };
  const result = await nativeRequest({ action: 'status' });
  assert.equal(result.ok, false);
  assert.match(result.error, /reload/i);
});

test('permission denial never attempts to open the native host', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  globalThis.chrome = { permissions: { contains: async () => false }, runtime: { connectNative: () => { throw new Error('Must not be called'); } } };
  const result = await nativeRequest({ action: 'status' });
  assert.equal(result.ok, false);
  assert.match(result.error, /permission/i);
});

test('permission API failures are returned to the connection screen', async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  globalThis.chrome = { permissions: { contains: async () => { throw new Error('Extension context invalidated'); } } };
  const result = await nativeRequest({ action: 'status' });
  assert.equal(result.ok, false);
  assert.match(result.error, /context invalidated/);
});

test('native registration errors point to the appropriate recovery action', () => {
  assert.match(connectionError('Specified native messaging host not found.'), /install command/);
  assert.match(connectionError('Access to the specified native messaging host is forbidden.'), /extension ID/);
  assert.match(connectionError('Permission is not declared in optional_permissions'), /Reload/);
});
