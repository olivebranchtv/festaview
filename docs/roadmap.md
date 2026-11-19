# Festaview roadmap

| # | Feature | Effort | Impact | Phase |
|---|---|---|---|---|
| 1 | Hub channel with per-festival categories and branding | Medium | Very high | 1 |
| 2 | White-label festival website synced to same library | Medium | High | 1 |
| 3 | Per-festival admin (upload, metadata, scheduling) | Medium | High | 1 |
| 4 | Scheduled live-replay channel per festival | Low-Med | High | 1 |
| 5 | Revenue attribution dashboard | Medium | Very high | 2 |
| 6 | True live feeds | High | High | 2 |
| 7 | Premiere locks, geo and date windows | Medium | High | 2 |
| 8 | Direct sponsor slots + category exclusions | Medium | High | 2 |
| 9 | Filmmaker payout and analytics portal | Medium | High | 2 |
| 10 | AI subtitles and translation | Medium | High | 3 |
| 11 | Jury/screener portal with watermarking | High | Medium | 3 |
| 12 | Distributor/industry portal | High | Medium-High | 3 |
| 13 | Audience voting by QR code | Low | Medium | 3 |
| 14 | Fire TV, Android TV, Samsung, LG | High | Medium | 3 |

## Status (2026-11-18)

Built: hub + festival pages, festival admin (films, live channels, schedule editor, festival page, filmmaker
shares, analytics + payout estimate + CSV), web playback (HLS via hls.js, captions), audience voting,
availability windows (hidden outside window via RLS), founding-festival inquiry form, network owner console
(#/network: create/publish festivals, link admins, read inquiries), festival account sign-up.

Not built (needs external accounts or larger work):
- Ads / Adtelligent revenue reporting (copy proven RAF task unmodified; real impressions then feed view_events)
- True live ingest (provider TBD; Bunny live support unverified)
- Direct upload to Bunny Stream (needs server-side function + Bunny API key)
- AI subtitles/translation (needs an AI/subtitle provider)
- Jury/screener portal, distributor portal
- Geo blocking (needs edge/CDN or Bunny token rules; not enforceable in the database)
- Roku: sideload testing, icons/splash, channel publish; other TV platforms

## Theater screenings (2026-11-18)
Built: venues, theater screenings with ticket links, public "In theaters" list + calendar (.ics) download, private
screening package (master/DCP/subtitle links + tech notes) with downloadable per-screening package, Theater Mode
(#/theater/<festival-slug>: day/venue playlist, intro cards, fullscreen, pause/skip, MP4 preload, attendance log).
Notes: DCP/KDM creation is not built (use DCP-o-matic or a partner service); theatrical rights must be confirmed
with filmmakers separately from streaming rights; HDMI playback has no DCP-style encryption.

## Automatic festival channels (2026-11-18)
Modeled on WatchSpree TV FAST channels (read-only reference: WatchSpree-TV/public/js/app.js nowOn()).
Each festival can switch on a channel (festivals.auto_channel, channel_order listed|newest|shuffle). Films play back to
back on a wall-clock schedule: position = (now seconds) mod (sum of film lengths). Everyone sees the same film at the
same moment. Festaview Mix (channel 1) shuffles all opted-in festivals' films. Web: TV guide on home page, channel card
on festival pages, ChannelPlayer (joins at the right offset, auto-advances). Film lengths: films.duration_sec, detected
from the HLS playlist or MP4 metadata (fallback: runtime_min). Migration: 006_channels.sql.
Not built: the same channels on the Roku app (needs the schedule math ported to BrightScript); real live streams in
the guide; adding or removing films shifts the schedule for everyone (cycle length changes).

## Festaview-wide analytics (2026-11-19)
Network console (#/network, network owner only) now has Analytics / Festivals / Inquiries tabs. Analytics: unique viewers,
views, hours, modeled revenue and Festaview share (assumptions editable; real ad impressions used when present),
hours-per-day chart, festival leaderboard, top films, viewing sources (website player vs automatic channels),
"Needs attention" health list, CSV export. Backed by owner-only SQL functions (migration 007: network_totals,
network_overview, network_films, network_daily, network_sources) and view_events.source.
Not built: Roku viewing reports (the Roku app does not log views), real ad revenue import, uptime/error monitoring,
unique-viewer de-duplication across devices.

## Roku viewing reports (2026-11-19)
The Roku app records watch time (seconds, film or live feed, festival, device id from GetChannelClientId, source "roku")
to view_events through ViewLogTask. Appears in festival analytics and the network dashboard. Untested on a device.
Not built: ad impressions from Roku (needs the RAF ad task), de-duplicating devices across platforms.

## Virtual cinema (2026-11-19)
New admin tab and public screening room: screenings, programs, live events; availability and watch windows; capacity;
region rules (server-checked); sponsor pre-roll; chat and Q&A with moderation; email reservations; tickets and codes
can cover an event. See docs/virtual-cinema.md. Migration 009_virtual.sql. Not included: DRM and forensic watermarking,
reminder emails, TV apps for events.

## Virtual Theater (phase 1 built)
Numbered screens, scheduled showings, marquee at /cinema, synchronized room with late entry, local time zones, seat limits, festival booking tab, owner approvals. Needs supabase/migrations/012_cinema.sql. Plan and later phases: docs/virtual-theater-plan.md.
