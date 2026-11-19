# Virtual cinema

Online screenings, programs and live events. Modeled on what Eventive Virtual offers (https://eventive.org/virtual),
adapted to Festaview. Festival admin: Virtual cinema tab. Viewers: Virtual cinema section on the home page and on each
festival page, and a screening room at #/virtual/<event id>.

## What it does
- Types: screening (one film), program (several films, one unlock, plays in order), live event (HLS stream).
- Windows: availability (from / until; before it opens viewers can leave an email), live start time (room opens 15 minutes
  early), watch window (hours to finish after pressing play; recorded per viewer on first play).
- Capacity: most viewers who can press play. Existing viewers can always resume.
- Access: free, or ticketed with an access code (bought or free codes; codes can be for one event or a pass).
- Region rules: allow-list or block-list of countries, checked by the netlify function virtual-start using Netlify's
  location data (cannot be faked by the browser; a VPN can still change apparent location). Press and industry codes
  can skip region rules.
- Sponsor message: a pre-roll video with the sponsor named, plays before the show (no controls).
- Chat and Q&A: viewers who pressed play can post (one message per 2 seconds); questions have their own tab; the festival
  can hide messages and mark questions answered. Messages refresh every 3 seconds.
- Reservations: emails collected before an event opens; festival downloads them as CSV (no emails are sent by Festaview yet).
- Analytics: watch time is recorded with source "virtual" and appears in festival and network analytics.

## Setup
1. Run supabase/migrations/009_virtual.sql (after 008). Region-checked events need the Netlify env var
   SUPABASE_SERVICE_ROLE_KEY (same one the payment functions use, see docs/paid-access.md). Events without region rules
   work without it.
2. Films used in a TICKETED event must not also be free and public: set them to Ticketed or Draft under Films. The event
   editor warns if a chosen film is still free and published.

## Not included (compared with Eventive)
- Real copy protection: multi-DRM (FairPlay, Widevine, PlayReady) and forensic watermarking. Once a viewer is allowed to
  watch, the video link is returned to their browser and could be copied. Stronger protection needs the video host
  (verify Bunny token authentication and MediaCage DRM) and signed expiring links.
- Per-device or per-viewer play limits beyond the watch window.
- Captions UI for events (films keep their own caption links).
- Emailing reminders, and Roku or other TV apps for virtual events.
- Live chat is polling, not real-time push; very large audiences would need real-time channels.

## Testing status
Browser-tested in demo mode: gate, windows, free and ticketed flows, program order, sponsor message, live event, chat and
questions, reservations, admin tab. The database functions (virtual_start, post_chat) and the region function have not been
run against real Supabase and Netlify; the region function and payment functions have automated tests with fake responses
(npm run test:functions in web/).
