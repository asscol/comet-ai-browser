import { app, shell, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings } from './settings'
import { providerHandlers, listOllamaModels } from './ai'
import { runAgentStep, AGENT_SYSTEM_PROMPT } from './agent'
import {
  AgentStepRequest,
  AgentStepResponse,
  AppSettings,
  ChatRequest,
  ChatStreamEvent,
  PageContext
} from '../shared/types'

if (process.env.ELECTRON_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

const activeRequests = new Map<string, AbortController>()

function buildSystemPrompt(base: string, ctx?: PageContext | null, maxChars = 8000): string {
  if (!ctx) return base
  const text = (ctx.text ?? '').slice(0, maxChars)
  const selection = ctx.selection?.trim()
  const parts = [
    base,
    '',
    '--- Current page context ---',
    `URL: ${ctx.url}`,
    `Title: ${ctx.title}`,
    selection ? `User selection:\n${selection}` : '',
    text ? `Page text (truncated):\n${text}` : ''
  ].filter(Boolean)
  return parts.join('\n')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'Comet AI Browser',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => loadSettings())
  ipcMain.handle('settings:set', async (_e, next: AppSettings) => saveSettings(next))

  ipcMain.handle('ollama:listModels', async (_e, baseUrl: string) => {
    return listOllamaModels(baseUrl)
  })

  ipcMain.handle('chat:cancel', async (_e, requestId: string) => {
    const ctrl = activeRequests.get(requestId)
    if (ctrl) {
      ctrl.abort()
      activeRequests.delete(requestId)
    }
  })

  ipcMain.handle(
    'agent:step',
    async (_e, payload: AgentStepRequest): Promise<AgentStepResponse> => {
      const settings = await loadSettings()
      const controller = new AbortController()
      activeRequests.set(payload.requestId, controller)
      try {
        return await runAgentStep(settings, payload.messages, controller.signal)
      } finally {
        activeRequests.delete(payload.requestId)
      }
    }
  )

  ipcMain.handle('agent:systemPrompt', async () => AGENT_SYSTEM_PROMPT)

  ipcMain.handle('chat:send', async (event: IpcMainInvokeEvent, payload: ChatRequest) => {
    const settings = await loadSettings()
    const config = settings.providers[settings.activeProvider]
    const handler = providerHandlers[settings.activeProvider]
    if (!handler) {
      throw new Error(`Unsupported provider: ${settings.activeProvider}`)
    }

    const controller = new AbortController()
    activeRequests.set(payload.requestId, controller)
    const sender = event.sender
    const send = (e: ChatStreamEvent): void => {
      if (!sender.isDestroyed()) sender.send('chat:stream', e)
    }

    const messages = [...payload.messages]
    const baseSystem = settings.systemPrompt
    const systemContent = settings.attachPageContext
      ? buildSystemPrompt(baseSystem, payload.context, settings.pageContextChars)
      : baseSystem
    if (systemContent) {
      messages.unshift({ id: 'system', role: 'system', content: systemContent })
    }

    try {
      await handler({
        config,
        messages,
        temperature: settings.temperature,
        signal: controller.signal,
        onChunk: (delta) => send({ requestId: payload.requestId, type: 'chunk', delta })
      })
      send({ requestId: payload.requestId, type: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (controller.signal.aborted) {
        send({ requestId: payload.requestId, type: 'done' })
      } else {
        send({ requestId: payload.requestId, type: 'error', message })
      }
    } finally {
      activeRequests.delete(payload.requestId)
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cometaibrowser')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
