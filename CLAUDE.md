# Festaview

White-label streaming network for film festivals. One huge Roku hub channel (Festaview) where every
festival has its own branded category, its own live-feed channel, and a synced white-label website.

Tagline: "Every festival. Every screen."
Domain target: festaview.com (free as of 2026-11-18; also check .tv/.app, socials, USPTO).

## Business model
- Ads via Adtelligent on Roku (RAF). Festival gets 80% of ad revenue attributed to its content/live feed;
  Festaview keeps 20%. Plus SaaS fee tiers and festival-sold direct sponsor slots (festival keeps 100%).
- Per-film filmmaker payout dashboard (festival passes share to filmmakers).
- Network effect: pooled audience and inventory across festivals.

## Core features (ranked, see docs/roadmap.md)
Phase 1: hub channel + per-festival categories, white-label site synced to same library, festival admin
(upload/metadata/schedule), scheduled "live" replay channel.
Phase 2: revenue attribution dashboard, true live feeds, premiere/geo/date locks, sponsor slots, filmmaker portal.
Phase 3: AI subtitles, jury/screener portal, distributor portal, voting by QR, other TV platforms.

## Structure
- roku/      Roku SceneGraph hub channel
- web/       White-label festival website + festival admin
- supabase/  Schema + migrations (multi-tenant: festivals, films, live_feeds, attribution)
- docs/      Pitch deck outline, outreach copy, revenue model, roadmap

## Rules (carried from the user's standing preferences)
- Do NOT modify ad code (AdTask.brs / RAF parameters) once copied in from another project unless fixing a
  confirmed ad bug. Any RAF change can silently break ad revenue.
- Supabase PostgREST FK joins are unreliable: fetch flat and merge in JS.
- No emoji in code or UI strings.
- Deploy path: build, commit, push to GitHub main; Netlify auto-deploys. No netlify CLI deploys.
- Leave Roku alone on other sites; never touch other projects' channels/feeds.
- Never guess about the user's other projects; read the code first.

## Open decisions
- Base project to clone from (QUANio / BrainMelt-TV style Roku + web stack) vs. fresh build.
- GitHub repo name and Supabase project (new, not shared).
- Revenue numbers are placeholders until real Adtelligent CPM/fill data exists.
