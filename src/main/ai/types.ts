import { ChatMessage, ProviderConfig } from '../../shared/types'

export interface ProviderRequest {
  config: ProviderConfig
  messages: ChatMessage[]
  temperature: number
  signal: AbortSignal
  onChunk: (delta: string) => void
}

export type ProviderHandler = (req: ProviderRequest) => Promise<void>
