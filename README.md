# PROMPTIFY

![PROMPTIFY logo](src/assets/promptify-logo.svg)

PROMPTIFY is an open-source Chrome extension for writing, improving, organizing,
and reusing prompts across ChatGPT, Claude, Gemini, Grok, Perplexity, Copilot,
and other AI tools.

## Features

- Prompt enhancer with concise, detailed, structured, tone, and translation modes.
- Quick-tools dock for page summaries, key points, explanations, and screenshots.
- Prompt library, searchable history, draft recovery, and reusable roles.
- Screenshot analysis, Prompt DNA, and image/video/UI prompt generation.
- Optional browser recall, tab actions, voice commands, and selection tools.
- Light, dark, and system appearances with six customizable visual presets.
- ChatGPT and Claude connections through their official CLIs.
- OpenRouter support with your own API key.

## Privacy model

PROMPTIFY stores settings, prompts, and history in Chrome extension storage on
your device. AI requests are sent only to the provider you select. OpenRouter
keys remain in local extension storage and are never committed to this project.
The optional native companion passes requests to official local CLI tools; it
does not expose a localhost server or copy CLI credentials into the extension.

Read the full [privacy policy](index.html) before distributing a build.

## Install from source

Requirements: Node.js 20.19 or newer and npm.

```sh
git clone https://github.com/AlmostArtist/PROMPTIFY.git
cd PROMPTIFY
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select the generated `dist/` directory.

## Connect an AI provider

### OpenRouter

Open **Settings**, add an [OpenRouter API key](https://openrouter.ai/keys), and
select a model. The key is stored in Chrome local extension storage.

### ChatGPT or Claude account

The optional native companion supports macOS and Linux. Install a current
[Codex CLI](https://developers.openai.com/codex/cli) or
[Claude Code](https://code.claude.com/docs/en/setup), sign in through the
official CLI, then run this command from the PROMPTIFY project directory:

```sh
npm run companion:install -- <extension-id>
```

Chrome is the default. Append `edge`, `brave`, or `chromium` for another
supported Chromium browser. Reload the extension after installation. The
companion registration is restricted to the extension ID you provide. Running
the installer again also migrates installations from the former Prompt Kido
native-host name.

To remove it, delete `com.promptify.cli.json` from your browser's
`NativeMessagingHosts` directory and remove the `PROMPTIFY/companion` directory
from your user application/configuration folder.

## Development

```sh
npm run dev        # Vite development server on port 5180
npm run typecheck  # TypeScript validation
npm test           # unit and native-companion tests
npm run test:ui    # production build and Playwright UI tests
```

The production build is generated in `dist/`. Release archives should contain
the contents of that directory, not the repository root.

## Permissions

PROMPTIFY uses storage, side-panel, downloads, scripting, active-tab,
context-menu, and native-messaging permissions for its core features. History,
tabs, and broader host access are optional and requested only when a related
feature is enabled. Content scripts provide the toolbar, selection actions, and
opt-in memory features on supported pages.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow. Report
security issues through GitHub's private security advisory flow as described in
[SECURITY.md](SECURITY.md).

## License

PROMPTIFY is released under the [MIT License](LICENSE).
