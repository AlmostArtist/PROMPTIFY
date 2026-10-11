#!/usr/bin/env node
// PROMPTIFY local CLI companion installer.
//
// Works two ways:
//   • From the project source:   npm run companion:install -- [extension-id] [browser]
//   • From a shared download:    double-click companion/Install Companion.command,
//                                or run  node companion/install.mjs
// No npm or project source is needed — only Node.js. When no extension ID is
// given, it is found automatically by reading the browser profiles for the
// unpacked PROMPTIFY folder this installer ships in.
import { mkdir, writeFile, copyFile, rm, readFile, readdir, realpath, access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const ID_RE = /^[a-p]{32}$/;
export const BROWSERS = {
  darwin: { chrome: 'Google/Chrome', chromium: 'Chromium', edge: 'Microsoft Edge', brave: 'BraveSoftware/Brave-Browser' },
  linux: { chrome: 'google-chrome', chromium: 'chromium', edge: 'microsoft-edge', brave: 'BraveSoftware/Brave-Browser' },
};
const HOST_FILES = ['host.mjs', 'telemetry.mjs', 'images.mjs'];

export function userDataBase(os = platform(), home = homedir(), env = process.env) {
  return os === 'darwin' ? join(home, 'Library/Application Support') : env.XDG_CONFIG_HOME || join(home, '.config');
}

/** Parse `[id] [browser]` in any order. */
export function parseArgs(argv) {
  const out = { id: undefined, browser: undefined };
  for (const arg of argv) {
    if (ID_RE.test(arg)) out.id = arg;
    else if (Object.keys(BROWSERS.darwin).includes(arg)) out.browser = arg;
    else if (arg) throw new Error(`Unrecognised argument "${arg}". Usage: node install.mjs [extension-id] [chrome|chromium|edge|brave]`);
  }
  return out;
}

const readJson = async (file) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return undefined; } };
const canonical = async (p) => { try { return await realpath(p); } catch { return resolve(p); } };

/**
 * Find PROMPTIFY's extension ID in every installed browser profile.
 * Prefers the unpacked install whose folder is `extensionDir`; otherwise any
 * unpacked extension named PROMPTIFY. Returns [{ browser, id, profile, exact }].
 */
export async function findInstalls(extensionDir, { os = platform(), base = userDataBase(os) } = {}) {
  const target = extensionDir ? await canonical(extensionDir) : undefined;
  const found = [];
  for (const [browser, folder] of Object.entries(BROWSERS[os] ?? {})) {
    const root = join(base, folder);
    let profiles;
    try { profiles = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name))).map((d) => d.name); }
    catch { continue; }
    for (const profile of profiles) {
      for (const file of ['Secure Preferences', 'Preferences']) {
        const settings = (await readJson(join(root, profile, file)))?.extensions?.settings;
        if (!settings || typeof settings !== 'object') continue;
        for (const [id, s] of Object.entries(settings)) {
          if (!ID_RE.test(id) || typeof s?.path !== 'string' || s.location !== 4) continue; // 4 = unpacked
          const exact = Boolean(target) && (await canonical(s.path)) === target;
          const named = s.manifest?.name === 'PROMPTIFY' || (await readJson(join(s.path, 'manifest.json')))?.name === 'PROMPTIFY';
          if ((exact || named) && !found.some((f) => f.browser === browser && f.id === id)) found.push({ browser, id, profile, exact });
        }
      }
    }
  }
  // When this installer sits inside a specific install, only that one counts.
  return found.some((f) => f.exact) ? found.filter((f) => f.exact) : found;
}

/** Copy the host files and register the native-messaging host for one browser. */
export async function registerHost({ ids, browser, sourceDir, os = platform(), base = userDataBase(os), node = process.execPath }) {
  const folder = BROWSERS[os]?.[browser];
  if (!folder) throw new Error('The companion supports Chrome, Chromium, Edge and Brave on macOS and Linux.');
  const installDir = join(base, 'PROMPTIFY', 'companion');
  const manifestDir = join(base, folder, 'NativeMessagingHosts');
  await mkdir(installDir, { recursive: true, mode: 0o700 });
  await mkdir(manifestDir, { recursive: true });
  for (const file of HOST_FILES) await copyFile(join(sourceDir, file), join(installDir, file));
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  const launcher = join(installDir, 'launch.sh');
  // Prefer the official user-local native CLI over an older npm-global shim.
  const cliPath = [join(homedir(), '.local/bin'), dirname(node), process.env.PATH || '', '/usr/local/bin', '/opt/homebrew/bin', join(homedir(), '.npm-global/bin')].join(delimiter);
  await writeFile(launcher, `#!/bin/sh\nexport PATH=${quote(cliPath)}\nexec ${quote(node)} ${quote(join(installDir, 'host.mjs'))}\n`, { mode: 0o700 });
  await writeFile(join(manifestDir, 'com.promptify.cli.json'), JSON.stringify({
    name: 'com.promptify.cli', description: 'PROMPTIFY local CLI companion',
    path: launcher, type: 'stdio', allowed_origins: [...new Set(ids)].map((id) => `chrome-extension://${id}/`),
  }, null, 2), { mode: 0o600 });
  // The pre-rebrand registration cannot serve PROMPTIFY and confuses upgrades.
  await rm(join(manifestDir, 'com.promptkido.cli.json'), { force: true });
  return { manifest: join(manifestDir, 'com.promptify.cli.json'), launcher };
}

async function onPath(cmd) {
  for (const dir of [join(homedir(), '.local/bin'), ...(process.env.PATH || '').split(delimiter), '/usr/local/bin', '/opt/homebrew/bin', join(homedir(), '.npm-global/bin')]) {
    try { await access(join(dir, cmd)); return true; } catch { /* keep looking */ }
  }
  return false;
}

async function main() {
  const os = platform();
  if (!BROWSERS[os]) throw new Error('The companion installer supports macOS and Linux. On Windows, use OpenRouter in Connect instead.');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`Node.js 20 or newer is required (found ${process.version}). Install the LTS version from https://nodejs.org and run this again.`);

  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const { id: argId, browser: argBrowser } = parseArgs(process.argv.slice(2));
  // In a shared download the installer lives in <extension>/companion/.
  const extensionDir = dirname(sourceDir);

  let targets; // [{ browser, ids }]
  if (argId) {
    targets = [{ browser: argBrowser ?? 'chrome', ids: [argId] }];
  } else {
    const found = (await findInstalls(extensionDir, { os })).filter((f) => !argBrowser || f.browser === argBrowser);
    if (found.length) {
      const byBrowser = new Map();
      for (const f of found) byBrowser.set(f.browser, [...(byBrowser.get(f.browser) ?? []), f.id]);
      targets = [...byBrowser].map(([browser, ids]) => ({ browser, ids }));
      for (const f of found) console.log(`Found PROMPTIFY in ${f.browser} (${f.profile}): ${f.id}`);
    } else {
      console.log('Could not find PROMPTIFY in your browser automatically.');
      console.log('Open chrome://extensions, turn on Developer mode, and copy the ID shown under PROMPTIFY.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('Paste the extension ID: ')).trim();
      rl.close();
      if (!ID_RE.test(answer)) throw new Error('That is not a valid extension ID (32 letters a–p).');
      targets = [{ browser: argBrowser ?? 'chrome', ids: [answer] }];
    }
  }

  for (const { browser, ids } of targets) {
    await registerHost({ ids, browser, sourceDir, os });
    console.log(`✓ Companion registered for ${browser}`);
  }
  const clis = [['codex', 'Codex CLI (ChatGPT)', 'https://developers.openai.com/codex/cli'], ['claude', 'Claude Code', 'https://code.claude.com/docs/en/setup']];
  for (const [cmd, name, url] of clis) {
    console.log((await onPath(cmd)) ? `✓ ${name} found` : `• ${name} not found — install it to use that account: ${url}`);
  }
  console.log('\nDone. Reload PROMPTIFY at chrome://extensions, then open Connect in the side panel.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`\n✗ ${err instanceof Error ? err.message : err}`); process.exitCode = 1; });
}
