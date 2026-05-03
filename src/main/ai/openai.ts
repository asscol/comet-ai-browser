import { ProviderHandler } from './types'

// Works for OpenAI, OpenRouter, and any OpenAI-compatible endpoint.
export const openAICompatible: ProviderHandler = async ({
  config,
  messages,
  temperature,
  signal,
  onChunk,
  jsonMode
}) => {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  if (config.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/asscol/comet-ai-browser'
    headers['X-Title'] = 'Comet AI Browser'
  }

  const body: Record<string, unknown> = {
    model: config.model,
    temperature,
    stream: true,
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body)
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
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) onChunk(delta)
      } catch {
        // Ignore malformed SSE chunks.
      }
    }
  }
}
