# Eventive Virtual: what it is and where Festaview stands (2026-11-19)

Sources read: eventive.org/virtual, /pricing, /filmmakers, /distributors, /film-festivals; search summaries of Eventive
help articles ("All About Unlock, Watch, and Availability Windows", "Geographic Restrictions", "DRM Security") and a
festival audience FAQ. The help-center pages themselves return 403 to automated readers, so details marked (summary)
come from search summaries, not the full articles. Re-verify before quoting any of this to customers.

## How Eventive Virtual works
- Screening types: video on demand, live stream, or both (live Q&A with a film). Programs: one unlock, several films, one player.
- THREE windows, per screening:
  - Availability window: when the screening can be unlocked and watched. When it ends, unused tickets expire.
  - Unlock window: how long a ticket holder has to START the screening before the ticket expires. If the availability
    window is shorter, availability wins.
  - Watch window: how long to FINISH once started ("Watch now"). It overrides the availability window, so someone who
    started in time can finish. Examples seen: 24 hours.
- Geoblocking per screening using country and continent codes, with press and industry overrides. VPNs are not allowed
  by their content protection (summary).
- Capacity control from the event dashboard (no numbers published).
- Security: multi-DRM (FairPlay, Widevine, PlayReady) and invisible forensic watermarking on every virtual screening;
  screen mirroring is blocked and some smart-TV browsers cannot play protected video (summary).
- Delivery: Eventive requests a file from the filmmaker or distributor, who uploads once; it is converted to all formats.
- Live: chat only for ticketed viewers; Premium 1080p DRM live at $10/hour with optional automatic live captions;
  live Q&As recorded automatically and archived for on-demand.
- Devices: web, plus Eventive TV apps (Roku, Apple TV, Fire TV, Chromecast), screencasting.
- Extras: pre-rolls and trailers (unlimited), sponsor videos, advance orders with "ready" email, free unlocks for
  giveaways and screeners (100 on Single Film), pay-what-you-can, group sales, subscriptions (distributors), a public
  Virtual Catalog, Letterboxd and JustWatch links, white-label site builder, custom domain ($500).
- Rights holders: automatic BOR and revenue-split reports, direct-deposit payouts to third parties, per-session
  watermarking for pre-release content, control of release windows and partner (exhibitor) screenings, bulk screenings
  from one uploaded asset.
- Pricing (verify): Virtual Unlimited $975 per year (refundable), $350 ingest credit (10 features, 20 shorts; then $25 per
  feature, $5 per short), $0.99 per DRM unlock, unlimited free non-DRM live streams; Single Film $299 one time with 100
  free unlocks; ticketing 5% + $0.99 per paid item (card fees included); Balloting free; Premium Support from $1,800 per month.

## Festaview today
| Eventive Virtual capability | Festaview |
|---|---|
| Screenings, programs, live events | Built |
| Availability window | Built |
| Watch window | Built (see fix below: it must override availability) |
| Unlock window (time to start after buying) | Was missing; added (010) |
| Geoblocking with press/industry overrides | Built (server-checked; needs service key setup). VPN not blocked |
| Capacity | Built |
| Pre-roll and sponsor video | Built (one per event) |
| Chat and Q&A with moderation | Built (open to free viewers too; polling) |
| Advance reservation | Partial: collects emails, does not send "ready" email |
| Tickets, passes, free codes, press codes | Built (Stripe untested) |
| DRM (multi-DRM) | Missing. Needs the video host (check Bunny MediaCage) |
| Forensic watermarking | Missing. Host or specialist vendor |
| TV apps for virtual events (Roku etc.) | Missing |
| Filmmaker / distributor file request and upload | Missing |
| Rights-holder reports (BOR, splits) and payouts | Partial: festival payout estimates only |
| Distributor channels, exhibitor rentals, subscriptions | Missing |
| Pay-what-you-can, group sales, donations | Missing |
| Recorded live Q&A archived for on-demand | Missing |
| Live captions | Missing |
| Public catalog / Letterboxd / JustWatch | Missing |
| Custom festival domain, white-label builder | Missing |
| Cancel or postpone an event with notices | Missing |
| Hybrid: in-person plus virtual | Partial (theater tools exist, no box office or scanning) |

## Recommended order to become a true Eventive Virtual alternative
1. Correct window rules (done in 010). 2. DRM and watermarking via the video host. 3. Filmmaker file request and rights-holder
reports. 4. Emails (reservation "ready", reminders, receipts) via an email service. 5. Roku/TV app support for events.
6. Pay-what-you-can and donations. 7. Archive live Q&As. 8. Custom domains. 9. Distributor channels and exhibitor rentals.
