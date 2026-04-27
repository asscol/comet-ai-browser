import { providerHandlers } from './ai'
import type {
  AgentAction,
  AgentActionType,
  AgentStepResponse,
  AppSettings,
  ChatMessage
} from '../shared/types'

export const AGENT_SYSTEM_PROMPT = `You are a browser-automation agent embedded in a desktop browser.
You control the active tab on behalf of the user. You CANNOT see the page as an image — only as a structured snapshot.

EACH TURN you receive a snapshot:
  URL, page title, scroll position, a list of interactive elements (each with a numeric \`id\`), and a short text preview.

EACH TURN you respond with EXACTLY ONE JSON object describing your next action.
Output only a JSON object — no prose, no markdown, no commentary outside the JSON.

Schema:
{
  "thought": "<one short sentence about why this action>",
  "action": "<one of: navigate | click | type | scroll | wait | read | execute_js | done>",
  "args": { ... }
}

Action arg shapes:
- navigate     { "url": "https://..." }
- click        { "id": <number from snapshot.elements> }
- type         { "id": <number>, "text": "<string to type>", "submit": <bool, default false> }
- scroll       { "direction": "up" | "down", "amount": <pixels, default 600> }
- wait         { "ms": <number, max 5000> }
- read         { }                                     // re-read the page
- execute_js   { "code": "<javascript expression>" }   // last value is returned to you
- done         { "summary": "<final answer for the user>" }

Rules:
- Prefer click / type / scroll over execute_js. Only use execute_js when the structured tools cannot achieve the goal.
- IDs are valid only for the most recent snapshot. After any action that may change the DOM, expect the next snapshot to have new IDs.
- If the page is still loading or empty, return { "action": "wait", "args": { "ms": 1500 } }.
- When the task is finished or blocked, return { "action": "done", "args": { "summary": "..." } }.
- NEVER include text outside the JSON object.
`

const VALID_ACTIONS: AgentActionType[] = [
  'navigate',
  'click',
  'type',
  'scroll',
  'wait',
  'read',
  'execute_js',
  'done'
]

function extractJson(raw: string): unknown {
  // Strip code fences if present.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : raw
  // Find first { and last } for tolerant parsing.
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('agent: no JSON object found in model output')
  }
  const slice = candidate.slice(start, end + 1)
  return JSON.parse(slice)
}

function coerceAction(obj: Record<string, unknown>): AgentAction | null {
  const rawAction = obj.action
  const action =
    typeof rawAction === 'string' && VALID_ACTIONS.includes(rawAction as AgentActionType)
      ? (rawAction as AgentActionType)
      : null
  if (!action) {
    // Some small models skip "action" and put a plain answer in "summary"/"answer"/"response".
    // Treat those as a final `done`.
    const fallbackSummary =
      typeof obj.summary === 'string'
        ? obj.summary
        : typeof obj.answer === 'string'
          ? obj.answer
          : typeof obj.response === 'string'
            ? obj.response
            : null
    if (fallbackSummary) {
      return { thought: '', action: 'done', args: { summary: fallbackSummary } }
    }
    return null
  }
  const thought = typeof obj.thought === 'string' ? obj.thought : ''
  const args = obj.args && typeof obj.args === 'object' ? (obj.args as Record<string, unknown>) : {}
  return { thought, action, args }
}

function parseAction(raw: string): AgentAction {
  const obj = extractJson(raw) as Record<string, unknown>
  const coerced = coerceAction(obj)
  if (!coerced) {
    const preview = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw
    throw new Error(`agent: model returned no usable action. Raw: ${preview}`)
  }
  return coerced
}

async function callLLM(
  settings: AppSettings,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const config = settings.providers[settings.activeProvider]
  const handler = providerHandlers[settings.activeProvider]
  if (!handler) throw new Error(`Unsupported provider: ${settings.activeProvider}`)
  let buffer = ''
  await handler({
    config,
    messages,
    temperature: 0.2,
    signal,
    jsonMode: true,
    onChunk: (delta) => {
      buffer += delta
    }
  })
  return buffer
}

export async function runAgentStep(
  settings: AppSettings,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<AgentStepResponse> {
  let buffer = await callLLM(settings, messages, signal)
  console.log('[agent] model raw output (first attempt):', buffer.slice(0, 400))

  try {
    const action = parseAction(buffer)
    return { action, raw: buffer }
  } catch {
    // Retry once with a corrective system reminder when the schema isn't followed.
    // Small models (e.g. llama3.2:1b) frequently miss the `action` field on the first try.
    const correction: ChatMessage = {
      id: 'agent-correction',
      role: 'user',
      content: `Your previous response was not a valid action JSON object. Reply ONLY with a JSON object of the form {"thought":"...","action":"navigate|click|type|scroll|wait|read|execute_js|done","args":{...}}. The action field is REQUIRED and must be one of those exact strings. Your previous output was:\n${buffer.slice(0, 800)}`
    }
    const priorAssistant: ChatMessage = {
      id: 'agent-prior',
      role: 'assistant',
      content: buffer
    }
    const retryMessages: ChatMessage[] = [...messages, priorAssistant, correction]
    buffer = await callLLM(settings, retryMessages, signal)
    console.log('[agent] model raw output (retry):', buffer.slice(0, 400))
    const action = parseAction(buffer)
    return { action, raw: buffer }
  }
}
