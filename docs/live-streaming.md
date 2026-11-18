# Live streaming for festival channels

Festaview plays any HLS (.m3u8) link. A live channel is a name plus a stream link. Two kinds:

- Replay channel: a looping playlist of recorded films. Works today with any HLS playlist.
- Live event: a broadcast (camera or OBS) sent to a live streaming service, which returns a playback .m3u8 link.

The admin Live channels tab has a "Test this stream" button (reads the link as a viewer's browser would and reports
live vs recorded vs broken) and a built-in "How to run a live channel" guide for festivals.

## Provider options (researched 2026-11-18; verify current terms and prices before recommending)

| Provider | Ingest | Playback | Notes |
|---|---|---|---|
| Cloudflare Stream Live | RTMPS, SRT | HLS, DASH | Official docs: billed like Stream VOD ($5 per 1,000 stored minutes, $1 per 1,000 delivered minutes); ingest listed as free at launch. A third-party site claims a live-input fee; confirm on Cloudflare's pricing page. |
| Mux | RTMP, RTMPS | HLS (stream.mux.com/{playback id}.m3u8) | Marketing page lists live input from about $0.025 per minute; low-latency option exists. Confirm on mux.com/pricing. |
| Bunny Stream | Unconfirmed | HLS (VOD confirmed) | Third-party sources conflict on whether Bunny offers live ingest. Ask Bunny support or check docs.bunny.net before promising live on Bunny. Bunny remains the recommended host for recorded films. |

Sources: Cloudflare Stream pricing docs and launch post, Mux live-streaming docs and product page, Bunny docs.

## Not built
- Switching "Live right now" automatically when a broadcast starts or ends (needs provider webhooks).
- Creating live inputs from inside Festaview via a provider API (needs the provider account and a server-side function
  so API keys never reach the browser).
- Low-latency playback tuning.
