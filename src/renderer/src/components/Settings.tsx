import { useEffect, useState } from 'react'
import type { AppSettings, OllamaModel, ProviderId } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onSave: (next: AppSettings) => Promise<void>
  onClose: () => void
}

const PROVIDER_ORDER: ProviderId[] = ['ollama', 'openai', 'anthropic', 'openrouter', 'custom']

function SettingsInner({ settings, onSave, onClose }: Props): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const provider = draft.providers[draft.activeProvider]

  async function refreshOllamaModels(): Promise<void> {
    try {
      const list = await window.api.ollama.listModels(draft.providers.ollama.baseUrl)
      setModels(list)
      setOllamaError(null)
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (draft.activeProvider !== 'ollama') return
    let cancelled = false
    void (async () => {
      try {
        const list = await window.api.ollama.listModels(draft.providers.ollama.baseUrl)
        if (cancelled) return
        setModels(list)
        setOllamaError(null)
      } catch (err) {
        if (cancelled) return
        setOllamaError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draft.activeProvider, draft.providers.ollama.baseUrl])

  function patchProvider(patch: Partial<typeof provider>): void {
    setDraft({
      ...draft,
      providers: {
        ...draft.providers,
        [draft.activeProvider]: { ...provider, ...patch }
      }
    })
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="ghost-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <section className="form-section">
            <label className="form-label">Provider</label>
            <select
              className="form-input"
              value={draft.activeProvider}
              onChange={(e) => setDraft({ ...draft, activeProvider: e.target.value as ProviderId })}
            >
              {PROVIDER_ORDER.map((id) => (
                <option key={id} value={id}>
                  {draft.providers[id].label}
                </option>
              ))}
            </select>
          </section>

          {draft.activeProvider !== 'ollama' && (
            <section className="form-section">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                value={provider.apiKey}
                onChange={(e) => patchProvider({ apiKey: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
              />
            </section>
          )}

          <section className="form-section">
            <label className="form-label">Base URL</label>
            <input
              className="form-input"
              type="text"
              value={provider.baseUrl}
              onChange={(e) => patchProvider({ baseUrl: e.target.value })}
              spellCheck={false}
            />
          </section>

          <section className="form-section">
            <label className="form-label">Model</label>
            {draft.activeProvider === 'ollama' ? (
              <div className="row">
                <select
                  className="form-input"
                  value={provider.model}
                  onChange={(e) => patchProvider({ model: e.target.value })}
                >
                  {models.length === 0 && <option value={provider.model}>{provider.model}</option>}
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button className="ghost-btn" onClick={refreshOllamaModels}>
                  Refresh
                </button>
              </div>
            ) : (
              <input
                className="form-input"
                type="text"
                value={provider.model}
                onChange={(e) => patchProvider({ model: e.target.value })}
                spellCheck={false}
              />
            )}
            {draft.activeProvider === 'ollama' && ollamaError && (
              <div className="form-error">
                Could not connect to Ollama: {ollamaError}
                <br />
                Run <code>ollama serve</code> and pull a model with{' '}
                <code>ollama pull llama3.2</code>.
              </div>
            )}
          </section>

          <section className="form-section">
            <label className="form-label">
              Temperature: <span>{draft.temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
            />
          </section>

          <section className="form-section">
            <label className="form-label">System prompt</label>
            <textarea
              className="form-input"
              rows={4}
              value={draft.systemPrompt}
              onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
            />
          </section>

          <section className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.attachPageContext}
                onChange={(e) => setDraft({ ...draft, attachPageContext: e.target.checked })}
              />
              Attach current page context to messages by default
            </label>
          </section>

          <section className="form-section">
            <label className="form-label">
              Max page context length: <span>{draft.pageContextChars} chars</span>
            </label>
            <input
              type="range"
              min={1000}
              max={32000}
              step={1000}
              value={draft.pageContextChars}
              onChange={(e) => setDraft({ ...draft, pageContextChars: Number(e.target.value) })}
            />
          </section>
        </div>

        <div className="modal-footer">
          <button className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Remount when the source settings reference changes so the draft re-initializes
// without an effect-driven setState.
let settingsRevision = 0
const settingsRevisions = new WeakMap<AppSettings, number>()
function revisionFor(s: AppSettings): number {
  const existing = settingsRevisions.get(s)
  if (existing !== undefined) return existing
  settingsRevision += 1
  settingsRevisions.set(s, settingsRevision)
  return settingsRevision
}

export default function Settings(props: Props): React.JSX.Element {
  return <SettingsInner key={revisionFor(props.settings)} {...props} />
}
