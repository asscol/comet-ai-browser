import type { AgentStepUI } from './agent/runner'

export interface Tab {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export type ChatMessageUI =
  | {
      id: string
      kind: 'chat'
      role: 'user' | 'assistant'
      content: string
      pending?: boolean
      error?: string
    }
  | {
      id: string
      kind: 'agent-task'
      task: string
    }
  | {
      id: string
      kind: 'agent-step'
      step: AgentStepUI
    }
  | {
      id: string
      kind: 'agent-final'
      status: 'done' | 'cancelled' | 'error' | 'max-steps'
      summary?: string
      message?: string
    }
