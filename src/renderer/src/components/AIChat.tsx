import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ChatStreamEvent, PageContext } from '../../../shared/types'
import { ChatMessageUI } from '../types'
import { uid } from '../utils'
import { runAgent, type AgentStepUI, type ConfirmRequest } from '../agent/runner'

interface Props {
  settings: AppSettings
  getPageContext: () => Promise<PageContext | null>
  getWebview: () => Electron.WebviewTag | null
}

export default function AIChat({ settings, getPageContext, getWebview }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessageUI[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [includeContext, setIncludeContext] = useState(settings.attachPageContext)
  const [agentMode, setAgentMode] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null)
  const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.api.chat.onStream((ev: ChatStreamEvent) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === ev.requestId && m.kind === 'chat')
        if (idx === -1) return prev
        const target = prev[idx]
        if (target.kind !== 'chat') return prev
        const copy = [...prev]
        const next = { ...target }
        if (ev.type === 'chunk') {
          next.content += ev.delta
        } else if (ev.type === 'done') {
          next.pending = false
        } else if (ev.type === 'error') {
          next.pending = false
          next.error = ev.message
        }
        copy[idx] = next
        return copy
      })
      if (ev.type !== 'chunk') {
        setBusy(false)
        setRequestId(null)
      }
    })
    return off
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingConfirm])

  function appendStep(step: AgentStepUI): void {
    setMessages((prev) => [...prev, { id: step.id, kind: 'agent-step', step }])
  }

  function patchStep(id: string, patch: Partial<AgentStepUI>): void {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'agent-step' && m.step.id === id ? { ...m, step: { ...m.step, ...patch } } : m
      )
    )
  }

  async function sendChat(text: string): Promise<void> {
    const userMsg: ChatMessageUI = { id: uid(), kind: 'chat', role: 'user', content: text }
    const assistantId = uid()
    const assistantMsg: ChatMessageUI = {
      id: assistantId,
      kind: 'chat',
      role: 'assistant',
      content: '',
      pending: true
    }
    const next: ChatMessageUI[] = [...messages, userMsg, assistantMsg]
    setMessages(next)
    setBusy(true)
    setRequestId(assistantId)

    const context = includeContext ? await getPageContext().catch(() => null) : null
    const history = next
      .filter(
        (m): m is Extract<ChatMessageUI, { kind: 'chat' }> =>
          m.kind === 'chat' && !m.pending && !m.error
      )
      .map((m) => ({ id: m.id, role: m.role, content: m.content }))

    try {
      await window.api.chat.send({
        requestId: assistantId,
        messages: history,
        context
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.kind === 'chat' ? { ...m, pending: false, error: message } : m
        )
      )
      setBusy(false)
      setRequestId(null)
    }
  }

  async function sendAgent(task: string): Promise<void> {
    setMessages((prev) => [...prev, { id: uid(), kind: 'agent-task', task }])
    setBusy(true)
    cancelTokenRef.current = { cancelled: false }

    let systemPrompt: string
    try {
      systemPrompt = await window.api.agent.systemPrompt()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'agent-final', status: 'error', message: msg }
      ])
      setBusy(false)
      return
    }

    const result = await runAgent(
      { task, systemPrompt, cancelToken: cancelTokenRef.current },
      {
        getWebview,
        onStep: appendStep,
        onUpdateStep: patchStep,
        onConfirm: (req) => setPendingConfirm(req),
        onLog: () => {
          /* noop for now */
        }
      }
    )

    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        kind: 'agent-final',
        status: result.status,
        summary: result.summary,
        message: result.message
      }
    ])
    setBusy(false)
  }

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    if (agentMode) {
      const wv = getWebview()
      if (!wv) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            kind: 'agent-final',
            status: 'error',
            message: 'No active tab. Open a page first, then start the agent.'
          }
        ])
        return
      }
      await sendAgent(text)
    } else {
      await sendChat(text)
    }
  }

  function cancel(): void {
    if (agentMode || cancelTokenRef.current) {
      cancelTokenRef.current.cancelled = true
    }
    if (pendingConfirm) {
      pendingConfirm.resolve(false)
      setPendingConfirm(null)
    }
    if (requestId) window.api.chat.cancel(requestId)
    setBusy(false)
  }

  function clear(): void {
    if (busy) cancel()
    setMessages([])
  }

  function handleApprove(): void {
    if (!pendingConfirm) return
    pendingConfirm.resolve(true)
    setPendingConfirm(null)
  }

  function handleReject(): void {
    if (!pendingConfirm) return
    pendingConfirm.resolve(false)
    setPendingConfirm(null)
  }

  const provider = settings.providers[settings.activeProvider]

  return (
    <div className="ai-chat">
      <div className="ai-header">
        <div>
          <div className="ai-title">
            AI Assistant {agentMode && <span className="agent-badge">AGENT</span>}
          </div>
          <div className="ai-subtitle">
            {provider.label} · {provider.model || 'no model'}
          </div>
        </div>
        <button className="ghost-btn" onClick={clear} title="Clear chat">
          Clear
        </button>
      </div>
      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            {agentMode ? (
              <>
                <p>Agent mode: describe a task and the AI will operate the browser for you.</p>
                <p className="hint">
                  Example: «Найди расписание автобусов на завтра», «Зарегистрируйся на сайте X с
                  email …», «Заполни форму обратной связи».
                </p>
                <p className="hint">
                  Перед каждым опасным действием (submit, регистрация, оплата) появится
                  подтверждение.
                </p>
              </>
            ) : (
              <>
                <p>Ask anything about the current page or anything else.</p>
                <p className="hint">
                  Tip: toggle &ldquo;Use page context&rdquo; below to ground answers in the open
                  tab.
                </p>
              </>
            )}
          </div>
        )}
        {messages.map((m) => {
          if (m.kind === 'chat') {
            return (
              <div key={m.id} className={`msg ${m.role}`}>
                <div className="msg-role">{m.role === 'user' ? 'You' : 'AI'}</div>
                <div className="msg-content">
                  {m.content || (m.pending ? <span className="dots">…</span> : '')}
                  {m.error && <div className="msg-error">Error: {m.error}</div>}
                </div>
              </div>
            )
          }
          if (m.kind === 'agent-task') {
            return (
              <div key={m.id} className="msg user">
                <div className="msg-role">You · agent task</div>
                <div className="msg-content">{m.task}</div>
              </div>
            )
          }
          if (m.kind === 'agent-step') {
            const s = m.step
            const argsLine = formatArgs(s.action.action, s.action.args)
            return (
              <div key={m.id} className={`msg agent-step status-${s.status}`}>
                <div className="msg-role">
                  Step {s.step} · <span className="agent-action">{s.action.action}</span>
                </div>
                <div className="msg-content">
                  {s.thought && <div className="agent-thought">{s.thought}</div>}
                  {argsLine && <div className="agent-args">{argsLine}</div>}
                  {s.result && <div className="agent-result">→ {s.result}</div>}
                  {s.error && <div className="msg-error">{s.error}</div>}
                  {s.status === 'awaiting' && (
                    <div className="agent-pending">awaiting your approval…</div>
                  )}
                  {s.status === 'rejected' && (
                    <div className="agent-rejected">rejected by user</div>
                  )}
                </div>
              </div>
            )
          }
          // agent-final
          return (
            <div key={m.id} className={`msg agent-final status-${m.status}`}>
              <div className="msg-role">Agent · {m.status}</div>
              <div className="msg-content">{m.summary || m.message || '(no summary)'}</div>
            </div>
          )
        })}
      </div>
      {pendingConfirm && (
        <div className="agent-confirm">
          <div className="agent-confirm-title">Confirm action</div>
          <div className="agent-confirm-reason">{pendingConfirm.reason}</div>
          <div className="agent-confirm-detail">
            {pendingConfirm.action.action}:{' '}
            {formatArgs(pendingConfirm.action.action, pendingConfirm.action.args)}
          </div>
          <div className="agent-confirm-actions">
            <button className="ghost-btn" onClick={handleReject}>
              Reject
            </button>
            <button className="primary-btn" onClick={handleApprove}>
              Approve
            </button>
          </div>
        </div>
      )}
      <div className="ai-input-area">
        <div className="ai-toggles">
          <label className="ctx-toggle">
            <input
              type="checkbox"
              checked={agentMode}
              onChange={(e) => setAgentMode(e.target.checked)}
              disabled={busy}
            />
            Agent mode
          </label>
          {!agentMode && (
            <label className="ctx-toggle">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
              />
              Use page context
            </label>
          )}
        </div>
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={agentMode ? 'Describe a task for the agent…' : 'Message the AI…'}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="ai-actions">
          {busy ? (
            <button className="primary-btn" onClick={cancel}>
              Stop
            </button>
          ) : (
            <button className="primary-btn" onClick={send} disabled={!input.trim()}>
              {agentMode ? 'Run' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatArgs(action: string, args: Record<string, unknown>): string {
  switch (action) {
    case 'navigate':
      return String(args.url ?? '')
    case 'click':
      return `#${args.id}`
    case 'type':
      return `#${args.id} ← ${JSON.stringify(args.text ?? '')}${args.submit ? ' + Enter' : ''}`
    case 'scroll':
      return `${args.direction ?? 'down'} ${args.amount ?? 600}px`
    case 'wait':
      return `${args.ms ?? 0}ms`
    case 'execute_js':
      return String(args.code ?? '').slice(0, 200)
    case 'done':
      return ''
    default:
      return JSON.stringify(args)
  }
}
