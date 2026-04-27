# Test Plan — Agent mode (PR #1)

## What changed (user-visible)

A new **Agent mode** toggle in the AI sidebar. When enabled, the user types a goal in natural language and the AI drives the active browser tab — clicking, typing, scrolling, navigating — until the goal is met. Each step renders as a card showing the model's `thought`, the structured `action`, its `args`, and the result. Before any dangerous action (Submit / Register / Pay / Delete / arbitrary JS) a confirm modal blocks the loop and asks the user to Approve or Reject.

## Provider for tests

- Ollama (local), model **`llama3.2:1b`**, base `http://localhost:11434`.
- 7B and 3B both took multiple minutes per step on this 8-core VM, blowing past practical test budgets. 1B is fast (~1-3 s/step). Reliable JSON is now guaranteed by Ollama's `format: "json"` mode — see commit `6c4d08d` which adds `jsonMode: true` to the agent path. The previous `extractJson` failure on 3B/7B was because they returned prose; with `format=json` even 1B is forced to emit a JSON object.
- Two prerequisite fixes that this run validates:
  - `f2f5c22` — disable undici headers/body timeouts in `src/main/ai/ollama.ts` (slow CPU eval no longer kills the request).
  - `6c4d08d` — pass `jsonMode` from agent → ollama provider so the model is constrained to JSON.

## Tests

### Test 1 — Primary agent loop: navigate → read → done

**Goal:** prove the snapshot/LLM/execute loop works end-to-end and that `done` produces a final summary card grounded in real page content.

1. Open the app. Click the gear icon, switch provider to **Ollama (local)**, pick model `llama3.2:1b`, Save.
2. Tick the **Agent mode** checkbox in the sidebar. Verify:
   - Header shows the badge `AGENT` next to "AI Assistant" (`AIChat.tsx:265-268`, `.agent-badge` style).
   - The Send button changes to **Run**.
   - The "Use page context" toggle disappears (only shown in chat mode).
3. Type exactly: `Navigate to https://example.com and tell me the exact text of the H1 heading on that page.`
4. Click **Run**.

**Pass criteria (all must hold):**

- A `Step 1 · NAVIGATE` card appears with `https://example.com` (or `example.com`) in the args line.
- The active tab loads `example.com` (URL bar reflects this; page title becomes `Example Domain`).
- Within ≤4 more steps an `agent-final` card with class `status-done` appears containing the substring **`Example Domain`** (case-insensitive).
- The Stop button reverts back to **Run** (busy state cleared).
- No card has `status-error`.

**Why this would fail if broken:**

- Snapshot capture broken → model never sees `<h1>Example Domain</h1>` → summary won't contain it.
- JSON parsing broken → every step lands in `status-error`.
- `executeAction(navigate)` broken → URL bar never changes.
- `done` handling broken → no `status-done` card (loop hits max-steps).

### Test 2 — Safety: confirm modal blocks before a Submit-class click

**Goal:** prove `isDangerous()` correctly intercepts a click on a button matching the dangerous-text regex and that Reject feeds back to the loop.

1. With Agent mode still on, click **Clear**.
2. Manually navigate the active tab to `https://httpbin.org/forms/post` (faster than letting the agent navigate; we are testing the *click confirm* specifically).
3. In the agent input, type: `Click the "Submit order" button on this page.`
4. Click **Run**.

**Pass criteria:**

- A step card appears with action `CLICK` and args showing some `#<id>`.
- A panel appears at the bottom of the sidebar titled **"Confirm action"**, reason text containing `submit` or `order` (case-insensitive), with **Reject** and **Approve** buttons. The step's status badge reads `awaiting your approval…`.
- The form is **not** submitted (URL still `/forms/post`, not `/post`).
- Click **Reject** → the step transitions to status `rejected by user` and the loop continues OR returns `done` mentioning rejection. URL still `/forms/post`.

**Why this would fail if broken:**

- If the regex misses "Submit order", the click executes silently → httpbin redirects to `/post`.
- If the confirm Promise resolution is broken, Reject doesn't unblock the loop → spinner forever.

### Test 3 — Stop cancels mid-loop (lightweight)

**Goal:** prove the cancel token + Stop button terminate the loop cleanly with no error final card and busy state cleared.

1. Click **Clear**. Agent mode still on.
2. Type: `Read every link on this page and summarize them all.`
3. Click **Run**.
4. Wait for `Step 1` card to appear, then click **Stop**.

**Pass criteria:**

- Within ~3 s, busy state clears and the input button reverts to **Run**.
- No new step cards appear after Stop.
- A final card may or may not appear; if it does, status is `cancelled` or `error` (NOT `done`).
- Typing a new task and clicking Run starts a fresh agent run with a new Step 1.

**Why this would fail if broken:**

- If `cancelToken.cancelled` is not checked, the loop continues silently.
- If `setBusy(false)` is missed, the button stays on **Stop** forever.
