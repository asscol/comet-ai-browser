import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentStepRequest,
  AgentStepResponse,
  AppSettings,
  ChatRequest,
  ChatStreamEvent,
  OllamaModel
} from '../shared/types'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (next: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:set', next)
  },
  ollama: {
    listModels: (baseUrl: string): Promise<OllamaModel[]> =>
      ipcRenderer.invoke('ollama:listModels', baseUrl)
  },
  chat: {
    send: (req: ChatRequest): Promise<void> => ipcRenderer.invoke('chat:send', req),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('chat:cancel', requestId),
    onStream: (cb: (event: ChatStreamEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, ev: ChatStreamEvent): void => cb(ev)
      ipcRenderer.on('chat:stream', listener)
      return () => ipcRenderer.removeListener('chat:stream', listener)
    }
  },
  agent: {
    step: (req: AgentStepRequest): Promise<AgentStepResponse> =>
      ipcRenderer.invoke('agent:step', req),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('chat:cancel', requestId),
    systemPrompt: (): Promise<string> => ipcRenderer.invoke('agent:systemPrompt')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type Api = typeof api
