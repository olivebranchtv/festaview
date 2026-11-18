# Video hosting: recommend Bunny Stream to festivals

Festaview does not host video files itself. Each festival hosts its films and pastes the HLS (.m3u8) or MP4
link into the admin. We recommend Bunny Stream (bunny.net) as the default host.

## Why Bunny
- Low-cost, pay-as-you-go: small festivals can start cheaply with no big contract.
- Upload a film once; Bunny transcodes it to adaptive-bitrate HLS, which Roku plays natively.
- Global CDN, so viewers worldwide get fast playback.
- Access controls useful to festivals: token-signed URLs, geo-blocking, hotlink protection (supports premiere
  locks and territory rules). Verify current feature set and pricing on bunny.net before quoting to festivals.

## Festival workflow
1. Create a Bunny account and a Stream library for the festival.
2. Upload the film; wait for transcoding to finish.
3. Copy the HLS playlist URL (ends in playlist.m3u8).
4. In Festaview admin > Films, paste it into "Video URL", set status to Published.

## Open items to verify before promising features
- Live streaming: confirm whether Bunny offers live ingest suitable for festival live channels. If not, recommend
  a dedicated live provider for the live feed, and use Bunny for on-demand films and replay loops.
- Token-signed URLs: needed for hard premiere/geo locks; Roku requests must carry the token.
- Captions: Bunny supports caption tracks; confirm the URL format Roku needs for sidecar captions.

## Possible later integration (not built)
Direct upload from the Festaview admin to Bunny via a server-side function (the Bunny API key must never reach
the browser), auto-filling the Video URL when transcoding completes.
