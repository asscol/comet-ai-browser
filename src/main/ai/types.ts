import { ChatMessage, ProviderConfig } from '../../shared/types'

export interface ProviderRequest {
  config: ProviderConfig
  messages: ChatMessage[]
  temperature: number
  signal: AbortSignal
  onChunk: (delta: string) => void
  /** If true, ask the provider to constrain output to a single JSON object
   *  (Ollama: `format: "json"`, OpenAI: `response_format: { type: "json_object" }`).
   *  Used by the agent loop. Other providers ignore the flag and rely on prompting. */
  jsonMode?: boolean
}

export type ProviderHandler = (req: ProviderRequest) => Promise<void>
