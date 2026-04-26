export type ProviderId = 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom'

export interface ProviderConfig {
  id: ProviderId
  label: string
  apiKey: string
  baseUrl: string
  model: string
}

export interface AppSettings {
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  temperature: number
  systemPrompt: string
  attachPageContext: boolean
  pageContextChars: number
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PageContext {
  url: string
  title: string
  text: string
  selection: string
}

export interface ChatRequest {
  requestId: string
  messages: ChatMessage[]
  context?: PageContext | null
}

export type ChatStreamEvent =
  | { requestId: string; type: 'chunk'; delta: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; message: string }

export interface OllamaModel {
  name: string
  size?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'ollama',
  providers: {
    openai: {
      id: 'openai',
      label: 'OpenAI',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-latest'
    },
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini'
    },
    ollama: {
      id: 'ollama',
      label: 'Ollama (local)',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2'
    },
    custom: {
      id: 'custom',
      label: 'Custom (OpenAI-compatible)',
      apiKey: '',
      baseUrl: 'http://localhost:8000/v1',
      model: 'local-model'
    }
  },
  temperature: 0.7,
  systemPrompt:
    'You are a helpful AI assistant embedded in a web browser. When the user provides page context, use it to answer questions about the current page. Be concise.',
  attachPageContext: true,
  pageContextChars: 8000
}
