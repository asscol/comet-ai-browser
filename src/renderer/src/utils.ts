export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('about:')) return trimmed
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed) || trimmed.startsWith('localhost')) {
    return `https://${trimmed}`
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

export function displayUrl(url: string): string {
  if (url === 'about:blank') return ''
  return url
}
