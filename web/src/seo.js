import { useEffect } from 'react'
import { SITE_URL, SITE_NAME } from './paths.js'

function setTag(selector, create, attrs, content) {
  let el = document.head.querySelector(selector)
  if (!el) { el = document.createElement(create); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el) }
  if (content !== undefined) el.setAttribute('content', content)
  return el
}

// Keeps the browser tab title and the page's tags right while the visitor moves between pages.
// The server also writes these tags into the HTML itself, which is what search and AI crawlers read.
export function useSeo({ title, description, canonicalPath, image, robots = 'index,follow', type = 'website' }) {
  useEffect(() => {
    // Keep titles under about 60 characters: drop the brand suffix when it would make the title too long.
    const full = title ? (title.includes(SITE_NAME) || title.length + SITE_NAME.length + 3 > 60 ? title : title + ' | ' + SITE_NAME) : SITE_NAME
    document.title = full
    const canonical = SITE_URL + (canonicalPath || window.location.pathname)
    if (description) {
      setTag('meta[name="description"]', 'meta', { name: 'description' }, description)
      setTag('meta[property="og:description"]', 'meta', { property: 'og:description' }, description)
      setTag('meta[name="twitter:description"]', 'meta', { name: 'twitter:description' }, description)
    }
    setTag('meta[name="robots"]', 'meta', { name: 'robots' }, robots)
    setTag('meta[property="og:title"]', 'meta', { property: 'og:title' }, full)
    setTag('meta[name="twitter:title"]', 'meta', { name: 'twitter:title' }, full)
    setTag('meta[property="og:type"]', 'meta', { property: 'og:type' }, type)
    setTag('meta[property="og:url"]', 'meta', { property: 'og:url' }, canonical)
    if (image) {
      setTag('meta[property="og:image"]', 'meta', { property: 'og:image' }, image)
      setTag('meta[name="twitter:image"]', 'meta', { name: 'twitter:image' }, image)
    }
    const link = document.head.querySelector('link[rel="canonical"]') || (() => { const l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); return l })()
    link.href = canonical
  }, [title, description, canonicalPath, image, robots, type])
}
