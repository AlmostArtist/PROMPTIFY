import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/aiTasks.ts', import.meta.url), 'utf8');

test('every built-in system prompt receives the shared reliability guardrails', () => {
  assert.match(source, /Object\.entries\(TASK_DEFINITIONS\)/);
  assert.match(source, /system: `\$\{definition\.system\}\\n\\n\$\{SYSTEM_GUARDRAILS\}`/);
  for (const phrase of ['untrusted data', 'Do not present invented details as facts', 'Do not expose chain-of-thought']) {
    assert.ok(source.includes(phrase), `missing shared rule: ${phrase}`);
  }
});

test('enhancer prompts avoid duplicated rules and requests for private reasoning', () => {
  const detailed = source.slice(source.indexOf("'enhance-detailed':"), source.indexOf("'enhance-structured':"));
  assert.equal((detailed.match(/Be written TO the AI/g) ?? []).length, 1);
  const power = source.slice(source.indexOf('power: {'), source.indexOf("'translate-en':"));
  assert.doesNotMatch(power, /explicit chain-of-thought directive/i);
  assert.match(power, /concise rationale or verification summary/i);
});
