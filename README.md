# Comet AI Browser

A cross-platform desktop browser with a built-in AI assistant sidebar — inspired by Perplexity's Comet. Browse the web on the left, chat with an AI on the right. The AI can see the page you have open so you can ask "what is this page about?", "summarize this", or "translate this paragraph" without copy/paste.

Built with **Electron + React + TypeScript + Vite**.

![diagram](docs/diagram.png)

## Features

- **Multi-tab web browser** with address bar, back/forward/reload, and per-tab navigation.
- **AI chat sidebar** with streaming responses. Resizable. Stop/cancel mid-stream.
- **Multiple AI providers** out of the box:
  - Local **Ollama** (e.g. `llama3.2`, `mistral`, `qwen2.5`, …) — fully offline.
  - **OpenAI** (`gpt-4o-mini`, `gpt-4o`, …)
  - **Anthropic** (`claude-3-5-sonnet`, `claude-3-5-haiku`, …)
  - **OpenRouter** (any model behind it)
  - **Custom** OpenAI-compatible endpoint (LM Studio, vLLM, llama.cpp server, …)
- **Page-aware answers**: toggle "Use page context" and the AI receives the URL, title, current selection, and visible text of the active tab.
- **Local settings**: API keys and preferences are stored only on your machine in Electron's `userData` directory.
- **Persistent browsing session** via Electron's `persist:comet` partition (cookies & logins survive restarts).

## Quick start

```bash
# 1. Install
npm install

# 2. Run in dev mode
npm run dev
```

Open the **Settings** (gear icon, top right) and pick a provider:

### Use a local LLM (Ollama, recommended for privacy)
1. Install Ollama: <https://ollama.com>
2. Pull a model: `ollama pull llama3.2`
3. Make sure the daemon is running: `ollama serve`
4. In Settings, choose **Ollama (local)** → click *Refresh* → pick the model.

### Use a cloud API
1. Choose **OpenAI**, **Anthropic**, or **OpenRouter**.
2. Paste your API key.
3. Set the model name (defaults are reasonable).

## Build for distribution

```bash
npm run build:linux   # produces an AppImage / .deb / .snap
npm run build:win     # produces an .exe installer
npm run build:mac     # produces a .dmg (must be run on macOS)
```

Outputs land in `dist/`.

## How it works

```
┌─────────────────────── Electron BrowserWindow ───────────────────────┐
│                                                                      │
│  ┌──────────── Renderer (React) ────────────┐  ┌───── AI Chat ─────┐ │
│  │                                          │  │                   │ │
│  │   Tabs · Address bar                     │  │  Streaming msgs   │ │
│  │   ┌─────────────────────────────────┐    │  │  Input + Stop     │ │
│  │   │  <webview> – the actual web     │    │  │                   │ │
│  │   │  page being browsed             │    │  │  "Use page ctx"   │ │
│  │   └─────────────────────────────────┘    │  │                   │ │
│  └──────────────────────────────────────────┘  └───────────────────┘ │
│                       ▲                            ▲                 │
│              executeJavaScript                 IPC: chat:send        │
│              (extract DOM text)                IPC: chat:stream      │
│                                                IPC: settings:*       │
│                                                                      │
│  ┌────────────────── Main process (Node) ─────────────────────────┐  │
│  │   Settings persistence (JSON in userData)                      │  │
│  │   Provider dispatch: openai / anthropic / openrouter / ollama  │  │
│  │   SSE / NDJSON stream parsing → chunks back to renderer        │  │
│  │   AbortController per request (cancellable)                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

API keys never touch the renderer — every request is made from the Electron main process.

## Project structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # window + IPC wiring
│   ├── settings.ts    # JSON persistence
│   └── ai/            # provider implementations (streaming)
│       ├── openai.ts  # OpenAI / OpenRouter / custom (OpenAI-compatible)
│       ├── anthropic.ts
│       └── ollama.ts
├── preload/           # contextBridge → exposes `window.api`
├── shared/            # types shared between processes
└── renderer/          # React UI
    └── src/
        ├── App.tsx
        └── components/
            ├── Tabs.tsx
            ├── AddressBar.tsx
            ├── BrowserView.tsx   # <webview> wrapper
            ├── AIChat.tsx        # the AI sidebar
            └── Settings.tsx
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the app with hot reload |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (main + renderer) |
| `npm run build` | Typecheck + production bundle |
| `npm run build:linux` / `:win` / `:mac` | Package distributables |
| `npm run format` | Prettier |
| `npm run start` | Preview production bundle |

## Notes

- This is intentionally a small, hackable codebase — it is meant to be a starting point you can fork and extend.
- For privacy, prefer Ollama. Cloud providers receive your message and the page-context excerpt when "Use page context" is on.
- The webview uses Electron's persistent partition `persist:comet`, so logins persist across restarts.
- Pop-ups (`window.open`) from inside the embedded page are opened in your system browser by default. Change in `src/main/index.ts` if you want in-app tabs for them.
