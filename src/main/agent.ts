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

function parseAction(raw: string): AgentAction {
  const obj = extractJson(raw) as Record<string, unknown>
  const action = obj.action
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as AgentActionType)) {
    throw new Error(`agent: invalid action "${String(action)}"`)
  }
  const thought = typeof obj.thought === 'string' ? obj.thought : ''
  const args = obj.args && typeof obj.args === 'object' ? (obj.args as Record<string, unknown>) : {}
  return { thought, action: action as AgentActionType, args }
}

export async function runAgentStep(
  settings: AppSettings,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<AgentStepResponse> {
  const config = settings.providers[settings.activeProvider]
  const handler = providerHandlers[settings.activeProvider]
  if (!handler) throw new Error(`Unsupported provider: ${settings.activeProvider}`)

  let buffer = ''
  await handler({
    config,
    messages,
    temperature: 0.2,
    signal,
    onChunk: (delta) => {
      buffer += delta
    }
  })

  const action = parseAction(buffer)
  return { action, raw: buffer }
}
