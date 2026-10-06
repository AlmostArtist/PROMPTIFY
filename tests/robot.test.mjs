import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/robot.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const { DEFAULT_ROBOT, ROBOT_MOODS, normalizeRobot } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('robot preferences expose every mood and safely normalize saved controls', () => {
  assert.deepEqual(ROBOT_MOODS, ['neutral', 'curious', 'happy', 'excited', 'angry', 'mischievous', 'sad', 'tired', 'sleepy', 'thinking', 'surprised', 'love', 'wink']);
  assert.deepEqual(normalizeRobot({ hue: 420, movement: -20, expression: 'love' }), { hue: 360, movement: 0, expression: 'love' });
  assert.deepEqual(normalizeRobot({ hue: 210.4, movement: 164.6, expression: 'unknown' }), { hue: 210, movement: 165, expression: 'auto' });
  assert.deepEqual(normalizeRobot(null), DEFAULT_ROBOT);
});

