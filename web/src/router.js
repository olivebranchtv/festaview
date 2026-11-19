import { useEffect, useState } from 'react'

// Real addresses (no # in the URL) so every page can be found, shared and indexed.
// Old links that used #/page are converted once when the site opens.
if (typeof window !== 'undefined' && window.location.hash.startsWith('#/')) {
  try { window.history.replaceState(null, '', window.location.hash.slice(1)) } catch { /* ignore */ }
}

const listeners = new Set()
const read = () => ({ path: window.location.pathname, search: window.location.search })

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  const hash = to.includes('#') ? to.slice(to.indexOf('#') + 1) : ''
  if (hash) setTimeout(() => { const el = document.getElementById(hash); if (el) el.scrollIntoView() }, 30)
  else window.scrollTo(0, 0)
  listeners.forEach((f) => f())
}

export function usePath() {
  const [loc, setLoc] = useState(read)
  useEffect(() => {
    const on = () => setLoc(read())
    window.addEventListener('popstate', on)
    listeners.add(on)
    return () => { window.removeEventListener('popstate', on); listeners.delete(on) }
  }, [])
  return loc
}

// One click handler makes every normal link on the site switch pages without reloading,
// while the links stay real <a href> addresses that search engines can follow.
export function installLinkHandler() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = e.target.closest && e.target.closest('a')
    if (!a || a.target || a.hasAttribute('download')) return
    const href = a.getAttribute('href')
    if (!href || !href.startsWith('/') || href.startsWith('//')) return
    e.preventDefault()
    navigate(href)
  })
}
