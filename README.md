# Kairo

Kairo is a cross-browser extension that captures context from supported AI chat platforms and saves it as reusable capsules. It is designed to reduce repetition when moving between Claude, ChatGPT, Gemini, and DeepSeek.

## Features

- One-click capture from supported chat pages
- Search and filter saved capsules by title, summary, tag, platform, or folder
- Inject saved context back into a chat input
- Optional Claude API enrichment for structured metadata
- JSON export and import for backup and migration
- Keyboard shortcut support for fast capture
- Chrome, Firefox, Edge, Brave, and Opera support through the same codebase

## Supported Platforms

| Platform | Status |
| --- | --- |
| Claude (`claude.ai`) | Supported |
| ChatGPT (`chat.openai.com`, `chatgpt.com`) | Supported |
| Gemini (`gemini.google.com`) | Supported |
| DeepSeek (`chat.deepseek.com`) | Supported |

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A Chromium-based browser or Firefox for local testing

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts a watch build for the Chrome target. For Firefox builds, use:

```bash
npm run dev:firefox
```

## Production Builds

```bash
npm run build
npm run build:firefox
```

## Loading the Extension

### Chrome, Edge, or Brave

1. Run `npm run build`.
2. Open the browser extensions page.
3. Enable Developer mode.
4. Load the `dist-chrome/` folder as an unpacked extension.

### Firefox

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Load the extension from `dist-firefox/`.

## Configuration

Open the extension settings page to configure:

- Claude API key for optional enrichment
- Automatic enrichment on capture
- Visibility of the floating capture button

The capture shortcut is `Ctrl+Shift+S`.

## Project Structure

```
background/        Service worker and enrichment flow
content/           Content scripts, injectors, and extractors
options/           Settings UI
popup/             Capsule browser UI
shared/            Data model, storage, messaging, and helpers
assets/            Extension icons and branded assets
scripts/           Build-time utilities
```

## Data Handling

- Capsules are stored locally in browser storage.
- Settings are stored in sync storage when the browser supports it.
- Claude API enrichment is optional and only runs when a user provides an API key.
- No backend service is required for core extension features.

## Documentation

- [Contributing guide](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Architecture overview](docs/architecture.md)
- [Changelog](CHANGELOG.md)

## License

MIT


Test
