import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types'

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function mergeWithDefaults(partial: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...partial,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      ...(partial.providers ?? {})
    }
  }
  return merged
}

export async function loadSettings(): Promise<AppSettings> {
  if (cached) return cached
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    cached = mergeWithDefaults(parsed)
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  return cached
}

export async function saveSettings(next: AppSettings): Promise<AppSettings> {
  cached = mergeWithDefaults(next)
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(cached, null, 2), 'utf8')
  return cached
}
