import { Tab } from '../types'

interface Props {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export default function Tabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew
}: Props): React.JSX.Element {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab ${t.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span className="tab-title">{t.loading ? '…' : t.title || 'New tab'}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              onClose(t.id)
            }}
            aria-label="Close tab"
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} aria-label="New tab">
        +
      </button>
    </div>
  )
}
