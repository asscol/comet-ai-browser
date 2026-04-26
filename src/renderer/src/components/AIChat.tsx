import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ChatStreamEvent, PageContext } from '../../../shared/types'
import { ChatMessageUI } from '../types'
import { uid } from '../utils'

interface Props {
  settings: AppSettings
  getPageContext: () => Promise<PageContext | null>
}

export default function AIChat({ settings, getPageContext }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessageUI[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [includeContext, setIncludeContext] = useState(settings.attachPageContext)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.api.chat.onStream((ev: ChatStreamEvent) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === ev.requestId)
        if (idx === -1) return prev
        const copy = [...prev]
        const target = { ...copy[idx] }
        if (ev.type === 'chunk') {
          target.content += ev.delta
        } else if (ev.type === 'done') {
          target.pending = false
        } else if (ev.type === 'error') {
          target.pending = false
          target.error = ev.message
        }
        copy[idx] = target
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
  }, [messages])

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy) return
    const userMsg: ChatMessageUI = { id: uid(), role: 'user', content: text }
    const assistantId = uid()
    const assistantMsg: ChatMessageUI = {
      id: assistantId,
      role: 'assistant',
      content: '',
      pending: true
    }
    const next = [...messages, userMsg, assistantMsg]
    setMessages(next)
    setInput('')
    setBusy(true)
    setRequestId(assistantId)

    const context = includeContext ? await getPageContext().catch(() => null) : null
    const history = next
      .filter((m) => !m.pending && !m.error)
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
        prev.map((m) => (m.id === assistantId ? { ...m, pending: false, error: message } : m))
      )
      setBusy(false)
      setRequestId(null)
    }
  }

  function cancel(): void {
    if (requestId) window.api.chat.cancel(requestId)
  }

  function clear(): void {
    if (busy) cancel()
    setMessages([])
  }

  const provider = settings.providers[settings.activeProvider]

  return (
    <div className="ai-chat">
      <div className="ai-header">
        <div>
          <div className="ai-title">AI Assistant</div>
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
            <p>Ask anything about the current page or anything else.</p>
            <p className="hint">
              Tip: toggle &ldquo;Use page context&rdquo; below to ground answers in the open tab.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? 'You' : 'AI'}</div>
            <div className="msg-content">
              {m.content || (m.pending ? <span className="dots">…</span> : '')}
              {m.error && <div className="msg-error">Error: {m.error}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="ai-input-area">
        <label className="ctx-toggle">
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
          />
          Use page context
        </label>
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the AI…"
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
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
