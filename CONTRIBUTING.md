# Contributing to PROMPTIFY

Thanks for helping improve PROMPTIFY.

## Development

1. Fork and clone the repository.
2. Install Node.js 20 or newer and run `npm ci`.
3. Run `npm run build` and load `dist/` from `chrome://extensions`.
4. Before opening a pull request, run `npm test` and `npm run test:ui`.

Keep pull requests focused, explain user-visible changes, and add regression
coverage for bug fixes. Never include API keys, account data, generated build
folders, or native-host registrations.
