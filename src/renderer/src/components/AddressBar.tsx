import { useState } from 'react'
import { Tab } from '../types'

interface Props {
  tab: Tab | null
  onNavigate: (url: string) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onToggleSettings: () => void
}

function AddressBarInner({
  tab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onToggleSettings
}: Props): React.JSX.Element {
  const initial = tab?.url === 'about:blank' ? '' : (tab?.url ?? '')
  const [value, setValue] = useState(initial)

  return (
    <div className="address-bar">
      <button
        className="nav-btn"
        onClick={onBack}
        disabled={!tab?.canGoBack}
        title="Back"
        aria-label="Back"
      >
        ←
      </button>
      <button
        className="nav-btn"
        onClick={onForward}
        disabled={!tab?.canGoForward}
        title="Forward"
        aria-label="Forward"
      >
        →
      </button>
      <button className="nav-btn" onClick={onReload} title="Reload" aria-label="Reload">
        ↻
      </button>
      <form
        className="address-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onNavigate(value)
        }}
      >
        <input
          className="address-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search or enter URL"
          spellCheck={false}
        />
      </form>
      <button
        className="nav-btn settings-btn"
        onClick={onToggleSettings}
        title="Settings"
        aria-label="Settings"
      >
        ⚙
      </button>
    </div>
  )
}

// Remount the inner bar when the active tab changes so the input value
// stays in sync without an effect-driven setState.
export default function AddressBar(props: Props): React.JSX.Element {
  const key = `${props.tab?.id ?? 'none'}::${props.tab?.url ?? ''}`
  return <AddressBarInner key={key} {...props} />
}
