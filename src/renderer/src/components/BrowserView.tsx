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

  useImperativeHandle(ref, () => ({
    getElement: () => wvRef.current
  }))

  useEffect(() => {
    const el = wvRef.current
    if (!el) return

    const handleStartLoading = (): void => onUpdate({ loading: true })
    const handleStopLoading = (): void => {
      onUpdate({
        loading: false,
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward(),
        url: el.getURL()
      })
    }
    const handleTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      onUpdate({ title: e.title })
    }
    const handleNavigate = (e: Electron.DidNavigateEvent): void => {
      onUpdate({
        url: e.url,
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward()
      })
    }
    const handleNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      if (!e.isMainFrame) return
      onUpdate({
        url: e.url,
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward()
      })
    }

    el.addEventListener('did-start-loading', handleStartLoading)
    el.addEventListener('did-stop-loading', handleStopLoading)
    el.addEventListener('page-title-updated', handleTitleUpdated)
    el.addEventListener('did-navigate', handleNavigate)
    el.addEventListener('did-navigate-in-page', handleNavigateInPage)

    return () => {
      el.removeEventListener('did-start-loading', handleStartLoading)
      el.removeEventListener('did-stop-loading', handleStopLoading)
      el.removeEventListener('page-title-updated', handleTitleUpdated)
      el.removeEventListener('did-navigate', handleNavigate)
      el.removeEventListener('did-navigate-in-page', handleNavigateInPage)
    }
  }, [onUpdate])

  useEffect(() => {
    const el = wvRef.current
    if (!el) return
    if (el.getURL && el.getURL() && el.getURL() !== tab.url && tab.url !== 'about:blank') {
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
        allowpopups={true}
        /* eslint-disable-next-line react/no-unknown-property */
        partition="persist:comet"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  )
})

export default BrowserView
