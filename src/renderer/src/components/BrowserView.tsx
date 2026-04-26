import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Tab } from '../types'

export interface BrowserViewHandle {
  getElement: () => Electron.WebviewTag | null
}

interface Props {
  tab: Tab
  active: boolean
  onUpdate: (patch: Partial<Tab>) => void
}

const BrowserView = forwardRef<BrowserViewHandle, Props>(function BrowserView(
  { tab, active, onUpdate },
  ref
) {
  const wvRef = useRef<Electron.WebviewTag | null>(null)
  const domReadyRef = useRef(false)

  useImperativeHandle(ref, () => ({
    getElement: () => wvRef.current
  }))

  useEffect(() => {
    const el = wvRef.current
    if (!el) return

    // Electron requires `allowpopups` as a bare attribute. The JSX boolean form
    // emits an HTML attribute warning, so set it imperatively.
    el.setAttribute('allowpopups', '')

    const safeGet = <T,>(fn: () => T, fallback: T): T => {
      try {
        return fn()
      } catch {
        return fallback
      }
    }

    const handleDomReady = (): void => {
      domReadyRef.current = true
      onUpdate({
        canGoBack: safeGet(() => el.canGoBack(), false),
        canGoForward: safeGet(() => el.canGoForward(), false),
        url: safeGet(() => el.getURL(), tab.url)
      })
    }
    const handleStartLoading = (): void => onUpdate({ loading: true })
    const handleStopLoading = (): void => {
      if (!domReadyRef.current) {
        onUpdate({ loading: false })
        return
      }
      onUpdate({
        loading: false,
        canGoBack: safeGet(() => el.canGoBack(), false),
        canGoForward: safeGet(() => el.canGoForward(), false),
        url: safeGet(() => el.getURL(), tab.url)
      })
    }
    const handleTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      onUpdate({ title: e.title })
    }
    const handleNavigate = (e: Electron.DidNavigateEvent): void => {
      onUpdate({
        url: e.url,
        canGoBack: safeGet(() => el.canGoBack(), false),
        canGoForward: safeGet(() => el.canGoForward(), false)
      })
    }
    const handleNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      if (!e.isMainFrame) return
      onUpdate({
        url: e.url,
        canGoBack: safeGet(() => el.canGoBack(), false),
        canGoForward: safeGet(() => el.canGoForward(), false)
      })
    }

    el.addEventListener('dom-ready', handleDomReady)
    el.addEventListener('did-start-loading', handleStartLoading)
    el.addEventListener('did-stop-loading', handleStopLoading)
    el.addEventListener('page-title-updated', handleTitleUpdated)
    el.addEventListener('did-navigate', handleNavigate)
    el.addEventListener('did-navigate-in-page', handleNavigateInPage)

    return () => {
      el.removeEventListener('dom-ready', handleDomReady)
      el.removeEventListener('did-start-loading', handleStartLoading)
      el.removeEventListener('did-stop-loading', handleStopLoading)
      el.removeEventListener('page-title-updated', handleTitleUpdated)
      el.removeEventListener('did-navigate', handleNavigate)
      el.removeEventListener('did-navigate-in-page', handleNavigateInPage)
    }
  }, [onUpdate, tab.url])

  useEffect(() => {
    const el = wvRef.current
    if (!el) return
    if (!domReadyRef.current) return
    let current = ''
    try {
      current = el.getURL()
    } catch {
      return
    }
    if (current && current !== tab.url && tab.url && tab.url !== 'about:blank') {
      try {
        el.loadURL(tab.url)
      } catch {
        // ignore
      }
    }
  }, [tab.url])

  return (
    <div className={`browser-view ${active ? 'active' : ''}`}>
      <webview
        ref={wvRef as unknown as React.RefObject<HTMLElement>}
        src={tab.url || 'about:blank'}
        /* eslint-disable-next-line react/no-unknown-property */
        partition="persist:comet"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  )
})

export default BrowserView
