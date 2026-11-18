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
