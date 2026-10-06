import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [extensionId, browser = 'chrome'] = process.argv.slice(2);
if (!/^[a-p]{32}$/.test(extensionId || '')) throw new Error('Usage: npm run companion:install -- <extension-id> [chrome|chromium|edge|brave]');
const locations = {
  darwin: { chrome: 'Google/Chrome', chromium: 'Chromium', edge: 'Microsoft Edge', brave: 'BraveSoftware/Brave-Browser' },
  linux: { chrome: 'google-chrome', chromium: 'chromium', edge: 'microsoft-edge', brave: 'BraveSoftware/Brave-Browser' },
};
const folder = locations[platform()]?.[browser];
if (!folder) throw new Error('The companion installer supports Chrome, Chromium, Edge and Brave on macOS and Linux.');
const base = platform() === 'darwin' ? join(homedir(), 'Library/Application Support') : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
const installDir = join(base, 'PROMPTIFY', 'companion');
const manifestDir = join(base, folder, 'NativeMessagingHosts');
await mkdir(installDir, { recursive: true, mode: 0o700 });
await mkdir(manifestDir, { recursive: true });
for (const file of ['host.mjs', 'telemetry.mjs', 'images.mjs']) await copyFile(join(dirname(fileURLToPath(import.meta.url)), file), join(installDir, file));
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const launcher = join(installDir, 'launch.sh');
// Prefer the official user-local native CLI over an older npm-global shim.
// This is especially important on macOS: Claude Code <2.1.265 extracted an
// unsigned image module that Gatekeeper blocked during screenshot requests.
const cliPath = [join(homedir(), '.local/bin'), dirname(process.execPath), process.env.PATH || '', '/usr/local/bin', '/opt/homebrew/bin', join(homedir(), '.npm-global/bin')].join(delimiter);
await writeFile(launcher, `#!/bin/sh\nexport PATH=${quote(cliPath)}\nexec ${quote(process.execPath)} ${quote(join(installDir, 'host.mjs'))}\n`, { mode: 0o700 });
await writeFile(join(manifestDir, 'com.promptify.cli.json'), JSON.stringify({
  name: 'com.promptify.cli', description: 'PROMPTIFY local CLI companion',
  path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`],
}, null, 2), { mode: 0o600 });
// Remove the obsolete pre-rebrand registration after the new host is safely
// installed. It cannot serve PROMPTIFY and otherwise makes upgrades confusing.
await rm(join(manifestDir, 'com.promptkido.cli.json'), { force: true });
console.log(`Companion installed for ${browser}. Reload PROMPTIFY, then open Connections.`);
