import { ProviderHandler } from './types'
import { OllamaModel } from '../../shared/types'

export const ollama: ProviderHandler = async ({
  config,
  messages,
  temperature,
  signal,
  onChunk
}) => {
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/chat`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: config.model,
      stream: true,
      options: { temperature },
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string }
          done?: boolean
        }
        const delta = parsed.message?.content
        if (delta) onChunk(delta)
        if (parsed.done) return
      } catch {
        // Ignore malformed lines.
      }
    }
  }
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tags`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Ollama responded with ${res.status}`)
  }
  const data = (await res.json()) as { models?: Array<{ name: string; size?: number }> }
  return (data.models ?? []).map((m) => ({ name: m.name, size: m.size }))
}
