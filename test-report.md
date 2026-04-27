# Comet AI Browser — Test Report

PR: https://github.com/asscol/comet-ai-browser/pull/1
Devin session: https://app.devin.ai/sessions/78ebe4c63c5b48168efe046b4bc06eac
Plan: [test-plan.md](./test-plan.md)

## Escalations / things found during testing

1. **Bug found and fixed mid-test** — when the saved Ollama model name was not present in the freshly fetched `/api/tags` list, the dropdown visually showed the first available model but the underlying React state still held the stale value, so clicking **Save** silently kept the old model. Reproduced live, then fixed in commit [`9d1b23d`](https://github.com/asscol/comet-ai-browser/commit/9d1b23d) (`src/renderer/src/components/Settings.tsx`) by auto-syncing the draft to the first available model whenever the saved one is missing from the fetched list. Verified post-fix that **Save** now persists `llama3.2:1b` and the AI sidebar subtitle updates accordingly.
2. The `did-stop-loading` / page-title-updated handlers in `BrowserView` previously called `webview.canGoBack()` / `getURL()` before the webview's `dom-ready` event, which could throw and unmount the React tree. Fixed in commit [`3be8f28`](https://github.com/asscol/comet-ai-browser/commit/3be8f28) by guarding all such calls with a `domReadyRef` and `try/catch`. Verified post-fix that the app renders in dev and the address bar back/forward state updates correctly.
3. (Non-issue, just noting) On this VM Electron's GPU process fails to initialize under Xvfb, leading to a black window. Worked around by setting `ELECTRON_DISABLE_GPU=1` which calls `app.disableHardwareAcceleration()` and adds `--disable-gpu`. Same commit as #2.

## Result summary

| Test | Result |
|---|---|
| Test 1 — Settings: switch Ollama model from `llama3.2` → `llama3.2:1b` and verify subtitle updates and value persists | ✅ passed (after fix) |
| Test 2 — End-to-end streaming chat grounded in current page (DuckDuckGo) | ✅ passed |
| Test 2 sanity check — toggle "Use page context" off, ask same question, verify response no longer references the page | ✅ passed |
| Test 3 — Stop button cancels streaming cleanly, partial text retained, no error, follow-up message still works | ✅ passed |

## Evidence

### Test 1 — Settings → Ollama model

Picked `llama3.2:1b` in the Settings modal (only model installed on this VM). After clicking **Save**, the AI sidebar subtitle updates to `Ollama (local) · llama3.2:1b`.

| Settings modal showing only locally pulled model | AI subtitle after Save |
|---|---|
| ![Settings modal](https://app.devin.ai/attachments/3ebb4166-2448-46ea-af14-8a811aedafa0/screenshot_f1f4a7d9c7d1472e8269297ff7994061.png) | ![AI subtitle](https://app.devin.ai/attachments/95fa90de-257c-45cb-8c6e-1789ced20f93/screenshot_zoom_93caaf9c553f4c4cb76fbb5fb738d1d3.png) |

### Test 2 — Page-context grounding

With **Use page context** ON, asked: *"What is the exact title of the web page I am currently viewing?"* The model answered with the actual `<title>` of the open tab, proving the page text was sent through the system message:

| 🟢 Reply with page context ON |
|---|
| ![Reply with context](https://app.devin.ai/attachments/1d621d81-00b5-472c-8bad-cdc99ccea8a5/screenshot_zoom_58c60d51f0a840659df9dca1e05a2dfd.png) |
| Reply contains the substring `DuckDuckGo` and the full page title `Protection. Privacy. Peace of mind.` — only possible if the page text reached the model. |

### Test 2 sanity — context toggled off

After `Clear`-ing the chat and unchecking **Use page context**, the same question now has no clue what page is open. The model hallucinated `Help Center` — which is exactly the failure mode we want when the context is *not* attached:

| 🔴 Reply with page context OFF (after Clear) |
|---|
| ![Hallucinated reply](https://app.devin.ai/attachments/5213ccf9-793e-45d1-91aa-5906fddf9085/screenshot_zoom_1f10a2c26327440f884af2589f111dae.png) |
| Reply does NOT contain `DuckDuckGo`. Confirms the page-context toggle actually controls whether the page text is included. |

### Test 3 — Stop button cancels streaming

Asked for a 300-word essay, clicked **Stop** mid-stream. Streaming halted at "associated with goddess" (mid-sentence). The Stop button reverted to **Send**, no `Error:` line appeared, and a follow-up `say ok` produced a normal reply:

| 🟢 After Stop, Send button restored | 🟢 Follow-up message works after cancel |
|---|---|
| ![Send restored](https://app.devin.ai/attachments/011a0dd1-cbf1-44f0-b1aa-70eb8aec2df3/screenshot_zoom_b990f1a74ec34f868021179748a5b353.png) | ![Follow-up reply](https://app.devin.ai/attachments/fa604437-7f15-4bb2-b392-cdd6d3227f40/screenshot_63f2761449624f2b934130e074370df8.png) |

## Test environment

- VM: Linux + Xvfb display `:0`, Electron run with `ELECTRON_DISABLE_GPU=1 LIBGL_ALWAYS_SOFTWARE=1`
- Provider: **Ollama (local)** at `http://localhost:11434`
- Model: `llama3.2:1b` (1.2B params, Q8_0, ~1.3 GB) — only model pulled on this VM
- Cloud providers (OpenAI / Anthropic / OpenRouter) were **not** tested because no API keys were provisioned; the IPC path is shared (`src/main/index.ts:81-124`) so behavior should be identical assuming valid keys.
