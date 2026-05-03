import { ProviderHandler } from './types'

export const anthropic: ProviderHandler = async ({
  config,
  messages,
  temperature,
  signal,
  onChunk
}) => {
  const url = `${config.baseUrl.replace(/\/$/, '')}/messages`
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    signal,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      temperature,
      system: system || undefined,
      stream: true,
      messages: convo
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
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data) continue
      try {
        const parsed = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.type === 'text_delta' &&
          parsed.delta.text
        ) {
          onChunk(parsed.delta.text)
        }
      } catch {
        // Ignore malformed events.
      }
    }
  }
}
