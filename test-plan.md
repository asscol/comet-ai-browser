# Comet AI Browser — Test Plan

PR under test: https://github.com/asscol/comet-ai-browser/pull/1

Primary intent (per user prompt): a desktop browser with an AI chat sidebar where the user can write to the AI in the right pane and the AI can reason about the currently open page, with both API providers and a local Ollama backend.

This plan focuses on the single most important end-to-end flow that proves the feature works as a whole.

## Preconditions (already done; not part of recording)
- App is launched in dev mode (`ELECTRON_DISABLE_GPU=1 LIBGL_ALWAYS_SOFTWARE=1 npm run dev`).
- Ollama daemon is running locally (`http://localhost:11434`) and `llama3.2:1b` is pulled.
- Default provider is **Ollama (local)** (per `DEFAULT_SETTINGS.activeProvider`, `src/shared/types.ts:50`).

## What changed (user-visible)
- New Electron app: left pane = multi-tab webview browser, right pane = AI chat sidebar.
- Settings modal (gear button in the address bar, `src/renderer/src/components/AddressBar.tsx:63-70`) configures provider/model/key/temperature/system prompt.
- "Use page context" checkbox in the chat input area (`src/renderer/src/components/AIChat.tsx:131-138`) toggles whether `URL`, `Title`, current selection and `document.body.innerText` are prepended to the system message before being sent to the model (`src/main/index.ts:11-25, 96-103`).
- Streaming chat with a **Stop** button that aborts the in-flight request (`src/renderer/src/components/AIChat.tsx:152-157`, `src/main/index.ts:73-79, 89-123`).

## Test 1 — Settings: switch model from default `llama3.2` to pulled tag `llama3.2:1b`

**Why this test exists:** the default model name in `DEFAULT_SETTINGS.providers.ollama.model` is `'llama3.2'` (`src/shared/types.ts:78`) but the only model available locally is `llama3.2:1b`. The settings modal must (a) load current settings, (b) refresh the Ollama model list from `/api/tags` via IPC `ollama:listModels`, (c) persist the change to disk, and (d) reflect the new value in the AI chat header subtitle (`src/renderer/src/components/AIChat.tsx:103-105`).

| Step | Action | Expected (concrete) |
|------|--------|---------------------|
| 1.1 | Observe the AI sidebar header before opening Settings. | Header line 1: `AI Assistant`. Header line 2 (subtitle): exactly `Ollama (local) · llama3.2`. |
| 1.2 | Click the gear button (`⚙`) at the right end of the address bar. | A modal titled `Settings` appears, overlaying the page. The Provider dropdown is set to `Ollama (local)`. |
| 1.3 | In the Ollama section, click the **Refresh models** button. | A dropdown / list populates with at least one entry: `llama3.2:1b`. (Source: live `curl http://localhost:11434/api/tags` returns exactly this one model.) |
| 1.4 | Pick `llama3.2:1b`. Click **Save**. | Modal closes. AI sidebar subtitle now reads exactly `Ollama (local) · llama3.2:1b`. |
| 1.5 | Reopen the Settings modal. | The Ollama Model field shows `llama3.2:1b` (persisted across modal open/close). |

**Pass criteria:** all five rows above match exactly. **Fail** if subtitle still reads `llama3.2`, if the model list is empty, or if the change isn't persisted.

**Why this would look different if broken:** if the IPC `settings:set` were broken, step 1.4 would not change the subtitle. If `ollama:listModels` were broken, step 1.3 would show no models or an error.

## Test 2 — End-to-end: streaming chat grounded in the current page

**Why this test exists:** this is the headline feature — the AI sees what's on the page and answers about it. Streaming proves the SSE/NDJSON pipeline is wired through main → preload → renderer correctly. Grounding in page context proves the system-prompt builder + `executeJavaScript` extractor work.

| Step | Action | Expected (concrete) |
|------|--------|---------------------|
| 2.1 | Verify the active tab is loaded on `https://duckduckgo.com/` and the visible page text contains the strings `DuckDuckGo` and `Search privately`. | Tab title contains `DuckDuckGo`. Page renders the DuckDuckGo logo and the "Search privately" placeholder. |
| 2.2 | Verify the **Use page context** checkbox below the chat messages area is checked. | The checkbox is checked. (`AIChat.tsx:131-137` — initialized from `settings.attachPageContext`, default `true` per `DEFAULT_SETTINGS:91`.) |
| 2.3 | In the chat textarea, type exactly: `What is the exact title of the web page I am currently viewing? Answer in one sentence.` Press **Enter**. | A user bubble appears with that text. An assistant bubble appears with `…` placeholder, then visibly grows token-by-token (multiple intermediate render frames captured in the recording). |
| 2.4 | Wait for the response to finish (Stop button reverts to Send). | The final assistant message is non-empty and **contains the substring `DuckDuckGo`** (case-insensitive). No `Error:` text appears in the bubble. |
| 2.5 | Uncheck **Use page context**. Send a new message: `Without looking at any context, just say the word READY and stop.` | Assistant streams a response. The response **does NOT contain the substring `DuckDuckGo`**. (Sanity check that toggling context off actually removes it.) |

**Pass criteria:** 2.4 returns a response containing `DuckDuckGo`; 2.5's response does not. Streaming is visibly token-by-token (not a single chunk dropped at the end).

**Why this would look different if broken:**
- If page-context plumbing were broken (preload/IPC/`buildSystemPrompt`), step 2.4 would have no way to know the page title and would not contain `DuckDuckGo`.
- If streaming were broken (one-shot response), the recording would show no intermediate growth between the `…` placeholder and the final answer.
- If toggling the context toggle didn't actually drop the page text, both 2.4 and 2.5 would mention DuckDuckGo, making 2.5 fail.

## Test 3 — Cancel an in-flight request with the Stop button

**Why this test exists:** verifies `chat:cancel` IPC + `AbortController` wiring (`src/main/index.ts:73-79`, `89-123`).

| Step | Action | Expected (concrete) |
|------|--------|---------------------|
| 3.1 | In the chat textarea, type: `Write a 300-word essay about the history of cats. Be detailed.` Press Enter. | Streaming starts; assistant bubble grows. Send button is replaced by a **Stop** button. |
| 3.2 | After ~5–10 tokens are visible (well before the response naturally completes), click **Stop**. | The Stop button reverts to **Send** within ~2s. The partial assistant message is preserved (text remains visible). The bubble shows **no** `Error:` line (per `src/main/index.ts:116-117`, abort yields a `done` event, not `error`). |
| 3.3 | Send a follow-up trivial message, e.g. `say ok`. | New user/assistant pair appears below; the new assistant message streams to completion normally (proves the cancel didn't leave the chat in a broken state). |

**Pass criteria:** Stop visibly halts streaming, partial text is kept, no error line, and a subsequent message still works.

**Why this would look different if broken:** if cancel weren't wired, the response would keep streaming after Stop is clicked. If abort were treated as an error, an `Error: ...` line would appear in the cancelled bubble. If state weren't reset, step 3.3 would not be able to send a new message (Send disabled).
