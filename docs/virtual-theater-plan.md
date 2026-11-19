# Festaview Virtual Theater: plan (decisions locked 2026-11-19)

The world's largest virtual movie theater. Scheduled showings on numbered screens, a "now showing" board, doors that open
before showtime, and everyone watching together, like walking up to a Harkins. Open to every festival AND to filmmakers
and distributors releasing new titles.

## Decisions (from the owner)
1. Everyone together. A showing starts at one time for all viewers (synchronized).
2. Late entry allowed. A viewer who arrives after the start joins at the live point (for example 23 minutes in).
3. Times shown in each viewer's own time zone (stored in UTC, displayed locally, with the zone name).
4. Rights: a title added for the theater is already authorized. No per-showing rights check. (Suggested, optional: one
   checkbox at booking, "I confirm I have the right to screen this title", which costs nothing and protects Festaview.)
5. Screens belong to the whole network, not to one festival. Any festival, filmmaker or distributor can book showings.

## How it feels
- Home and /cinema show a marquee: every screen, what is playing now, what is starting soon, and today's showtimes.
- Each showing has: poster, runtime, rating, local start time, seats left (or Sold out), price (or Free), a Reserve or
  Buy button, and a countdown. In progress shows "Join now at 23:10".
- The room opens 10 to 15 minutes early (the lobby): sponsor message and trailers, chat. At showtime the film starts for
  everyone at the same point. After the film: optional Q&A time with chat, then the screen closes.
- Empty screens are never dark: when nothing is booked, a screen plays the festival or Mix channel (optional switch).

## Building blocks we already have (reused)
- Wall-clock synchronized playback (the automatic channels' offset logic).
- Virtual events: capacity, access codes, tickets and passes (Stripe), sponsor pre-roll, chat and Q&A, region rules,
  analytics, SEO event pages and sitemap.
- Self-serve festival accounts (extended so a "festival" can also be a filmmaker or distributor account).

## What is new
- Screens: numbered auditoriums owned by Festaview (start with about 12, owner adds more).
- Showings: one title (film, program or live event) on one screen at one start time, with seats, price or free, lobby
  minutes, and who booked it. The database blocks overlapping bookings on a screen (lobby + runtime + a short buffer).
- Booking tool for festivals, filmmakers and distributors: pick a title, pick an open slot, set seats and price.
  Owner controls: approval on or off, minimum notice (for example 24 hours), limits for new accounts, cancel or move.
- Account type: festival, filmmaker or distributor (filmmakers add their title like a one-film festival, then book).
- Seats: free showings reserve a seat (capacity enforced); paid showings sell tickets; "Sold out" shown.
- Public pages (real addresses, SEO): /cinema (the board), /cinema/<showing id>/<title> (showing page with online ScreeningEvent
  data). /theater/<festival> stays the private tool for physical venues.

## Phases
1. Screens, showings, owner and festival booking, the /cinema board, synchronized room with late entry, local time zones,
   free showings with seat limits. (Biggest step; the rest builds on it.)
2. Paid tickets and sold-out status (reuse Stripe checkout, code per showing).
3. Self-serve booking for filmmakers and distributors with owner approval and limits; account types.
4. Lobby pre-show and post-show Q&A polish; empty-screen channel filler; calendar downloads and reminder emails.
5. Roku and other TV apps for the theater; DRM and watermarking via the video host.

## Risks and open items
- Sync accuracy: viewers will be within a few seconds of each other (normal for streaming). Not frame-perfect.
- Big audiences: chat polling every 3 seconds is fine for hundreds; thousands need real-time channels.
- Content protection: still no DRM or forensic watermark. Needs the video host (verify Bunny MediaCage, token links).
- Email: reminders need an email service. Supabase's default email sender is very rate-limited.
- Abuse: open booking needs the owner approval switch and limits from day one.
- Time zones: always store UTC; test daylight saving changes.
- Payouts: ticket money is collected by Festaview; payouts to festivals and filmmakers are manual until Stripe Connect.
