import { ProviderId } from '../../shared/types'
import { ProviderHandler } from './types'
import { openAICompatible } from './openai'
import { anthropic } from './anthropic'
import { ollama } from './ollama'

export const providerHandlers: Record<ProviderId, ProviderHandler> = {
  openai: openAICompatible,
  openrouter: openAICompatible,
  custom: openAICompatible,
  anthropic,
  ollama
}

export { listOllamaModels } from './ollama'
