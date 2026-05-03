import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, PageContext } from '../../shared/types'
import AddressBar from './components/AddressBar'
import Tabs from './components/Tabs'
import BrowserView, { BrowserViewHandle } from './components/BrowserView'
import AIChat from './components/AIChat'
import Settings from './components/Settings'
import { Tab } from './types'
import { normalizeUrl, uid } from './utils'

const HOMEPAGE = 'https://duckduckgo.com'

function newTab(url: string = HOMEPAGE): Tab {
  return {
    id: uid(),
    url,
    title: 'New tab',
    loading: false,
    canGoBack: false,
    canGoForward: false
  }
}

const initialTab = newTab()

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tabs, setTabs] = useState<Tab[]>(() => [initialTab])
  const [activeId, setActiveId] = useState<string>(() => initialTab.id)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(380)
  const viewRefs = useRef<Map<string, BrowserViewHandle>>(new Map())

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const navigate = useCallback(
    (input: string) => {
      if (!activeTab) return
      const url = normalizeUrl(input)
      const wv = viewRefs.current.get(activeTab.id)?.getElement()
      if (wv) {
        try {
          wv.loadURL(url)
        } catch {
          updateTab(activeTab.id, { url })
        }
      }
      updateTab(activeTab.id, { url })
    },
    [activeTab, updateTab]
  )

  const goBack = useCallback(() => {
    if (!activeTab) return
    const wv = viewRefs.current.get(activeTab.id)?.getElement()
    if (wv && wv.canGoBack()) wv.goBack()
  }, [activeTab])

  const goForward = useCallback(() => {
    if (!activeTab) return
    const wv = viewRefs.current.get(activeTab.id)?.getElement()
    if (wv && wv.canGoForward()) wv.goForward()
  }, [activeTab])

  const reload = useCallback(() => {
    if (!activeTab) return
    const wv = viewRefs.current.get(activeTab.id)?.getElement()
    if (wv) wv.reload()
  }, [activeTab])

  const addTab = useCallback(() => {
    const tab = newTab()
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id)
        if (filtered.length === 0) {
          const tab = newTab()
          setActiveId(tab.id)
          return [tab]
        }
        if (id === activeId) {
          const next = filtered[filtered.length - 1]
          setActiveId(next.id)
        }
        return filtered
      })
      viewRefs.current.delete(id)
    },
    [activeId]
  )

  const getWebview = useCallback((): Electron.WebviewTag | null => {
    if (!activeTab) return null
    return viewRefs.current.get(activeTab.id)?.getElement() ?? null
  }, [activeTab])

  const getPageContext = useCallback(async (): Promise<PageContext | null> => {
    if (!activeTab) return null
    const wv = viewRefs.current.get(activeTab.id)?.getElement()
    if (!wv) return null
    try {
      const script = `(() => {
        const text = (document.body && document.body.innerText) || '';
        const sel = (window.getSelection && window.getSelection().toString()) || '';
        return { url: location.href, title: document.title, text, selection: sel };
      })()`
      const result = (await wv.executeJavaScript(script, true)) as PageContext
      return result
    } catch {
      return {
        url: activeTab.url,
        title: activeTab.title,
        text: '',
        selection: ''
      }
    }
  }, [activeTab])

  const handleSaveSettings = useCallback(async (next: AppSettings) => {
    const saved = await window.api.settings.set(next)
    setSettings(saved)
  }, [])

  // Resizer
  const resizingRef = useRef(false)
  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!resizingRef.current) return
      const w = window.innerWidth - e.clientX
      setSidebarWidth(Math.min(720, Math.max(280, w)))
    }
    function onUp(): void {
      resizingRef.current = false
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const setRef = useCallback((id: string, handle: BrowserViewHandle | null) => {
    if (handle) viewRefs.current.set(id, handle)
    else viewRefs.current.delete(id)
  }, [])

  if (!settings) {
    return <div className="loading">Loading…</div>
  }

  return (
    <div className="app">
      <div className="browser-pane" style={{ width: `calc(100% - ${sidebarWidth}px)` }}>
        <Tabs
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onNew={addTab}
        />
        <AddressBar
          tab={activeTab}
          onNavigate={navigate}
          onBack={goBack}
          onForward={goForward}
          onReload={reload}
          onToggleSettings={() => setShowSettings(true)}
        />
        <div className="views">
          {tabs.map((t) => (
            <BrowserView
              key={t.id}
              ref={(h) => setRef(t.id, h)}
              tab={t}
              active={t.id === activeId}
              onUpdate={(patch) => updateTab(t.id, patch)}
            />
          ))}
        </div>
      </div>
      <div
        className="resizer"
        onMouseDown={() => {
          resizingRef.current = true
          document.body.classList.add('resizing')
        }}
      />
      <div className="sidebar" style={{ width: sidebarWidth }}>
        <AIChat settings={settings} getPageContext={getPageContext} getWebview={getWebview} />
      </div>
      {showSettings && (
        <Settings
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default App
