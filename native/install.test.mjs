import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findInstalls, parseArgs, registerHost } from './install.mjs';

const ID_A = 'abcdefghijklmnopabcdefghijklmnop';
const ID_B = 'impfllhbgjdbcgmmojmfmjmgfjdahbbj';
const ID_X = 'ppppppppppppppppppppppppppppppppp'.slice(0, 32);

async function fakeProfile(base, browserFolder, profile, settings, file = 'Secure Preferences') {
  const dir = join(base, browserFolder, profile);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), JSON.stringify({ extensions: { settings } }));
}

test('parseArgs accepts id and browser in any order and rejects junk', () => {
  assert.deepEqual(parseArgs([]), { id: undefined, browser: undefined });
  assert.deepEqual(parseArgs([ID_A, 'brave']), { id: ID_A, browser: 'brave' });
  assert.deepEqual(parseArgs(['edge', ID_A]), { id: ID_A, browser: 'edge' });
  assert.throws(() => parseArgs(['--rm-rf']), /Unrecognised argument/);
});

test('finds the unpacked install whose folder contains the installer, ignoring other PROMPTIFY copies', async () => {
  const base = await mkdtemp(join(tmpdir(), 'pk-install-'));
  try {
    const mine = join(base, 'Downloads', 'PROMPTIFY');
    const other = join(base, 'Old', 'PROMPTIFY');
    await mkdir(mine, { recursive: true }); await mkdir(other, { recursive: true });
    await fakeProfile(base, 'Google/Chrome', 'Default', {
      [ID_B]: { location: 4, path: mine, manifest: { name: 'PROMPTIFY' } },
      [ID_A]: { location: 4, path: other, manifest: { name: 'PROMPTIFY' } },
      [ID_X]: { location: 1, path: `${ID_X}/1.0`, manifest: { name: 'Some store extension' } },
    });
    const found = await findInstalls(mine, { os: 'darwin', base });
    assert.deepEqual(found.map((f) => [f.browser, f.id, f.exact]), [['chrome', ID_B, true]]);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('falls back to any unpacked extension named PROMPTIFY, across browsers and profiles', async () => {
  const base = await mkdtemp(join(tmpdir(), 'pk-install-'));
  try {
    const ext = join(base, 'ext');
    await mkdir(ext, { recursive: true });
    await writeFile(join(ext, 'manifest.json'), JSON.stringify({ name: 'PROMPTIFY' }));
    await fakeProfile(base, 'Google/Chrome', 'Profile 2', { [ID_A]: { location: 4, path: ext } }, 'Preferences');
    await fakeProfile(base, 'BraveSoftware/Brave-Browser', 'Default', { [ID_A]: { location: 4, path: ext, manifest: { name: 'PROMPTIFY' } } });
    await fakeProfile(base, 'Microsoft Edge', 'Default', { [ID_X]: { location: 4, path: join(base, 'nope'), manifest: { name: 'Other' } } });
    const found = await findInstalls(join(base, 'source-checkout'), { os: 'darwin', base });
    assert.deepEqual(found.map((f) => f.browser).sort(), ['brave', 'chrome']);
    assert.ok(found.every((f) => f.id === ID_A && !f.exact));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('returns nothing when no browser profile exists (installer then asks for the ID)', async () => {
  const base = await mkdtemp(join(tmpdir(), 'pk-install-'));
  try { assert.deepEqual(await findInstalls(join(base, 'x'), { os: 'linux', base }), []); }
  finally { await rm(base, { recursive: true, force: true }); }
});

test('registerHost copies the host files and allows only the given extension ids', async () => {
  const base = await mkdtemp(join(tmpdir(), 'pk-install-'));
  try {
    const sourceDir = dirname(fileURLToPath(import.meta.url));
    const { manifest, launcher } = await registerHost({ ids: [ID_B, ID_B], browser: 'chrome', sourceDir, os: 'darwin', base, node: '/usr/local/bin/node' });
    const json = JSON.parse(await readFile(manifest, 'utf8'));
    assert.equal(json.name, 'com.promptify.cli');
    assert.deepEqual(json.allowed_origins, [`chrome-extension://${ID_B}/`]);
    assert.equal(json.path, launcher);
    for (const f of ['host.mjs', 'telemetry.mjs', 'images.mjs']) await access(join(base, 'PROMPTIFY', 'companion', f));
    assert.match(await readFile(launcher, 'utf8'), /exec '\/usr\/local\/bin\/node' '.*host\.mjs'/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
