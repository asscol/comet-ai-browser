export interface Tab {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface ChatMessageUI {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  error?: string
}
