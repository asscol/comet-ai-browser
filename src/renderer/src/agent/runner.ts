import type { AgentAction, AgentSnapshot, ChatMessage } from '../../../shared/types'
import { clickScript, scrollScript, SNAPSHOT_SCRIPT, typeScript } from './scripts'
import { uid } from '../utils'

export interface AgentStepUI {
  id: string
  step: number
  thought: string
  action: AgentAction
  result?: string
  error?: string
  status: 'pending' | 'awaiting' | 'rejected' | 'done' | 'error'
}

export interface ConfirmRequest {
  step: number
  action: AgentAction
  reason: string
  resolve: (approved: boolean) => void
}

export interface AgentCallbacks {
  getWebview: () => Electron.WebviewTag | null
  onStep: (step: AgentStepUI) => void
  onUpdateStep: (id: string, patch: Partial<AgentStepUI>) => void
  onConfirm: (req: ConfirmRequest) => void
  onLog: (msg: string) => void
  onSnapshot?: (snapshot: AgentSnapshot, step: number) => void
}

export interface AgentResult {
  status: 'done' | 'cancelled' | 'error' | 'max-steps'
  summary?: string
  message?: string
}

const MAX_STEPS = 25
const SAFE_HISTORY_TURNS = 8 // keep only recent N (snapshot, action) pairs to limit token use

const DANGEROUS_TEXT_RE =
  /\b(submit|register|sign[\s-]?up|sign[\s-]?in|log[\s-]?in|create[\s-]?account|pay|buy|purchase|checkout|delete|remove|confirm|order|subscribe|send|publish|post|tweet)\b/i

function isDangerous(
  action: AgentAction,
  snapshot?: AgentSnapshot
): { dangerous: boolean; reason: string } {
  if (action.action === 'execute_js') {
    return { dangerous: true, reason: 'Run arbitrary JavaScript on the page' }
  }
  if (action.action === 'navigate') {
    const url = String(action.args.url ?? '')
    if (/^(javascript|data|file):/i.test(url)) {
      return { dangerous: true, reason: `Non-http navigation to ${url.slice(0, 80)}` }
    }
  }
  if (action.action === 'click') {
    const id = Number(action.args.id)
    const el = snapshot?.elements.find((e) => e.id === id)
    const text = `${el?.text || ''} ${el?.ariaLabel || ''} ${el?.value || ''}`
    if (el?.tag === 'button' && el.type === 'submit') {
      return { dangerous: true, reason: 'Form submit button' }
    }
    if (DANGEROUS_TEXT_RE.test(text)) {
      const label = (el?.text || el?.ariaLabel || el?.value || '').slice(0, 60) || `#${id}`
      return { dangerous: true, reason: `About to click "${label}"` }
    }
  }
  if (action.action === 'type' && action.args.submit === true) {
    return { dangerous: true, reason: 'Pressing Enter after typing (will submit form)' }
  }
  return { dangerous: false, reason: '' }
}

function formatSnapshot(snap: AgentSnapshot, step: number): string {
  const els = snap.elements
    .map((e) => {
      const parts = [`#${e.id}`, `<${e.tag}${e.type ? ` type="${e.type}"` : ''}>`]
      if (e.text) parts.push(`text=${JSON.stringify(e.text)}`)
      if (e.placeholder) parts.push(`placeholder=${JSON.stringify(e.placeholder)}`)
      if (e.value) parts.push(`value=${JSON.stringify(e.value)}`)
      if (e.ariaLabel && e.ariaLabel !== e.text) parts.push(`aria=${JSON.stringify(e.ariaLabel)}`)
      if (e.href) parts.push(`href=${JSON.stringify(e.href)}`)
      return parts.join(' ')
    })
    .join('\n')
  return [
    `--- snapshot (step ${step}) ---`,
    `URL: ${snap.url}`,
    `Title: ${snap.title}`,
    `Scroll: ${snap.scrollY}/${Math.max(0, snap.scrollHeight - snap.innerHeight)} (viewport ${snap.innerHeight}px)`,
    `Interactive elements (${snap.elements.length}):`,
    els || '(none visible)',
    `Text preview:\n${snap.textPreview.slice(0, 1500)}`
  ].join('\n')
}

async function captureSnapshot(wv: Electron.WebviewTag): Promise<AgentSnapshot> {
  const result = (await wv.executeJavaScript(SNAPSHOT_SCRIPT, true)) as AgentSnapshot
  return result
}

async function executeAction(
  wv: Electron.WebviewTag,
  action: AgentAction
): Promise<{ ok: boolean; message: string }> {
  switch (action.action) {
    case 'navigate': {
      const url = String(action.args.url ?? '')
      if (!url) return { ok: false, message: 'navigate: missing url' }
      try {
        await wv.loadURL(url)
        return { ok: true, message: `navigated to ${url}` }
      } catch (e) {
        return { ok: false, message: `navigate failed: ${(e as Error).message}` }
      }
    }
    case 'click': {
      const id = Number(action.args.id)
      if (!Number.isFinite(id)) return { ok: false, message: 'click: missing id' }
      const r = (await wv.executeJavaScript(clickScript(id), true)) as {
        ok: boolean
        error?: string
        tag?: string
      }
      return r.ok
        ? { ok: true, message: `clicked element #${id} (${r.tag})` }
        : { ok: false, message: r.error || 'click failed' }
    }
    case 'type': {
      const id = Number(action.args.id)
      const text = String(action.args.text ?? '')
      const submit = action.args.submit === true
      if (!Number.isFinite(id)) return { ok: false, message: 'type: missing id' }
      const r = (await wv.executeJavaScript(typeScript(id, text, submit), true)) as {
        ok: boolean
        error?: string
      }
      return r.ok
        ? {
            ok: true,
            message: `typed ${JSON.stringify(text.slice(0, 60))} into #${id}${submit ? ' + Enter' : ''}`
          }
        : { ok: false, message: r.error || 'type failed' }
    }
    case 'scroll': {
      const dir = action.args.direction === 'up' ? 'up' : 'down'
      const amount = Math.min(5000, Math.max(50, Number(action.args.amount) || 600))
      const r = (await wv.executeJavaScript(scrollScript(dir, amount), true)) as {
        ok: boolean
        scrollY: number
      }
      return { ok: r.ok, message: `scrolled ${dir} ${amount}px (now y=${r.scrollY})` }
    }
    case 'wait': {
      const ms = Math.min(5000, Math.max(0, Number(action.args.ms) || 1000))
      await new Promise((resolve) => setTimeout(resolve, ms))
      return { ok: true, message: `waited ${ms}ms` }
    }
    case 'read': {
      return { ok: true, message: 're-read page' }
    }
    case 'execute_js': {
      const code = String(action.args.code ?? '')
      if (!code) return { ok: false, message: 'execute_js: missing code' }
      try {
        const r = await wv.executeJavaScript(code, true)
        const out = (() => {
          try {
            return JSON.stringify(r)
          } catch {
            return String(r)
          }
        })()
        return { ok: true, message: `js result: ${(out || '').slice(0, 400)}` }
      } catch (e) {
        return { ok: false, message: `js error: ${(e as Error).message}` }
      }
    }
    case 'done': {
      return { ok: true, message: String(action.args.summary ?? '') }
    }
  }
}

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  // Always keep the system prompt + the original user task. Then keep the most
  // recent SAFE_HISTORY_TURNS×2 messages (each turn = snapshot + assistant action).
  if (messages.length <= 2) return messages
  const head = messages.slice(0, 2) // system + first user task
  const tail = messages.slice(2)
  const keep = SAFE_HISTORY_TURNS * 2
  if (tail.length <= keep) return messages
  return [...head, ...tail.slice(tail.length - keep)]
}

export interface AgentRunOptions {
  task: string
  systemPrompt: string
  cancelToken: { cancelled: boolean }
}

export async function runAgent(
  options: AgentRunOptions,
  callbacks: AgentCallbacks
): Promise<AgentResult> {
  const { task, systemPrompt, cancelToken } = options
  const messages: ChatMessage[] = [
    { id: uid(), role: 'system', content: systemPrompt },
    { id: uid(), role: 'user', content: `Task: ${task}` }
  ]

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (cancelToken.cancelled) return { status: 'cancelled' }

    const wv = callbacks.getWebview()
    if (!wv) {
      callbacks.onLog('No active tab — aborting.')
      return { status: 'error', message: 'no-active-tab' }
    }

    let snapshot: AgentSnapshot
    try {
      snapshot = await captureSnapshot(wv)
    } catch (e) {
      const msg = (e as Error).message
      callbacks.onLog(`Snapshot failed: ${msg}`)
      return { status: 'error', message: msg }
    }
    callbacks.onSnapshot?.(snapshot, step)
    messages.push({
      id: uid(),
      role: 'user',
      content: formatSnapshot(snapshot, step)
    })

    if (cancelToken.cancelled) return { status: 'cancelled' }

    let parsed: { action: AgentAction; raw: string }
    try {
      parsed = await window.api.agent.step({
        requestId: uid(),
        messages: trimHistory(messages)
      })
    } catch (e) {
      const msg = (e as Error).message
      callbacks.onLog(`LLM step failed: ${msg}`)
      return { status: 'error', message: msg }
    }
    if (cancelToken.cancelled) return { status: 'cancelled' }

    const stepUI: AgentStepUI = {
      id: uid(),
      step,
      thought: parsed.action.thought,
      action: parsed.action,
      status: 'pending'
    }
    callbacks.onStep(stepUI)

    messages.push({ id: uid(), role: 'assistant', content: parsed.raw })

    const danger = isDangerous(parsed.action, snapshot)
    if (danger.dangerous) {
      callbacks.onUpdateStep(stepUI.id, { status: 'awaiting' })
      const approved = await new Promise<boolean>((resolve) => {
        callbacks.onConfirm({ step, action: parsed.action, reason: danger.reason, resolve })
      })
      if (cancelToken.cancelled) return { status: 'cancelled' }
      if (!approved) {
        callbacks.onUpdateStep(stepUI.id, {
          status: 'rejected',
          result: 'User rejected this action.'
        })
        messages.push({
          id: uid(),
          role: 'user',
          content:
            'The user rejected the previous action. Choose a safer or different next action — do not retry the same one.'
        })
        continue
      }
    }

    if (parsed.action.action === 'done') {
      const summary = String(parsed.action.args.summary ?? '')
      callbacks.onUpdateStep(stepUI.id, { status: 'done', result: summary })
      return { status: 'done', summary }
    }

    let exec: { ok: boolean; message: string }
    try {
      exec = await executeAction(wv, parsed.action)
    } catch (e) {
      exec = { ok: false, message: (e as Error).message }
    }
    callbacks.onUpdateStep(stepUI.id, {
      status: exec.ok ? 'done' : 'error',
      result: exec.ok ? exec.message : undefined,
      error: exec.ok ? undefined : exec.message
    })
    messages.push({
      id: uid(),
      role: 'user',
      content: `Action result (ok=${exec.ok}): ${exec.message}`
    })

    // Small delay so SPA pages have a chance to update before next snapshot.
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  callbacks.onLog(`Max steps (${MAX_STEPS}) reached without "done".`)
  return { status: 'max-steps' }
}
