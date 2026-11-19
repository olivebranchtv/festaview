# SEO and AI search

## Structure
Every section is its own real page (no # addresses):
/ , /festivals , /festival/<slug> , /films , /film/<id>/<title-slug> , /virtual , /virtual/<id>/<title-slug> , /tv-guide ,
/channel/<slug> , /live , /live/<id>/<name-slug> , /watch , /for-festivals , /about.
Private (never indexed, noindex header and meta): /admin , /network , /theater/<slug> , /access.
Old #/... links are converted to real addresses when the site opens.
Shared address rules: web/src/paths.js (used by the browser and the server code).

## How crawlers get real content
A Netlify edge function (web/netlify/edge-functions/seo.mjs) runs in front of every page and writes into the HTML itself:
title, description, canonical, Open Graph and Twitter tags, JSON-LD structured data, and a crawlable copy of the page
content with real links. Search and AI crawlers that do not run JavaScript still see the full page. Unknown festival, film,
event, channel and live-feed addresses return a true 404 with noindex. If the database is briefly unreachable the page is
served normally (no false 404s). Core code: web/netlify/lib/seo.mjs (fully unit tested: npm run test:seo).

## Structured data (schema.org JSON-LD)
Home: Organization, WebSite. Festival page: Festival (dates, location, organizer). Film page: Movie, plus VideoObject for
free films and trailers (ticketed films never expose a stream link). Virtual event: Event (online, offers with the real
ticket price). Lists: CollectionPage with ItemList. Channels: BroadcastService. For-festivals: FAQPage (matches the visible
questions). Every inner page: BreadcrumbList.

## Files for crawlers
- /sitemap.xml  generated live from the database (festivals, films, current events, channels, live feeds, main pages).
- /robots.txt   allows search engines and AI search/answer bots (OAI-SearchBot, ChatGPT-User, GPTBot, PerplexityBot,
                ClaudeBot, Claude-SearchBot, Google-Extended, Applebot, and others); blocks private areas; lists the sitemap.
                To stop AI model TRAINING but keep AI SEARCH, change GPTBot, ClaudeBot, Google-Extended and Applebot-Extended
                to Disallow: / (decision for the owner).
- /llms.txt     plain-text guide for AI assistants: what Festaview is, main pages, festivals and films with links.
- Social share image: public/og-default.png (placeholder symbol; replace with branded artwork that includes the name).

## After deploying: do these once
1. Google Search Console: add the property for https://festaview.com, verify, submit https://festaview.com/sitemap.xml.
2. Bing Webmaster Tools: add the site (import from Search Console), submit the sitemap. Bing also feeds ChatGPT-style search.
3. Make festaview.com the primary domain in Netlify so festaview.netlify.app redirects to it.
4. Replace placeholder images and add real text content: every festival should add a description, banner and film synopses.
   Thin pages rank poorly; unique, descriptive text per festival and film is the biggest ranking lever.
5. Add Terms and Privacy pages (needs a lawyer) and link them in the footer.

## Not done
- Server-side rendering of the full interactive app (the page is content-complete for crawlers, then the app takes over).
- Genre and location landing pages, a search page, per-language versions, a blog.
- Image optimisation service (posters are served from the video host as-is).
