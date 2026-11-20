# Festaview Roku channel

SceneGraph channel. Reads festivals, films, live feeds and the Festaview Cinemas schedule from Supabase (see components/Config.brs).

**Nothing in this channel has been tested on a real Roku yet.** It was written and reviewed by hand. Sideload it and test it before anything else.

## What is on the home screen
- **Festaview Cinemas row (first):** what is playing on each screen, from the public `cinema_board` view (the same schedule as festaview.com/cinema).
  Choosing a showing joins it through the database function `cinema_join` (components/CinemaTask.brs, components/Cinema.brs).
  - Everyone is on the server's clock, so the film starts at the same moment for all viewers; a viewer who arrives late joins at the live point;
    the TV is nudged back into step if it drifts more than a few seconds.
  - Doors open before showtime: a countdown card (and a sponsor ad pod when there is time) plays until the film starts. After the film, a Q&A card shows until the showing closes.
  - Free showings join straight away. A paid showing asks for the ticket code (FV-XXXX-XXXX-XXXX) bought at festaview.com/cinema. The code is typed once and remembered on the TV.
  - Press Back to leave the theater.
- **TV Guide row:** automatic festival channels. Logic in components/Channels.brs, mirrors web/src/channels.js (same shuffle hash, same wall-clock schedule). Change one, change the other.
- **Live Now row:** live_feeds with a stream link. **Festival rows:** each festival's films.
- Viewing reports: components/ViewLogTask.brs sends watch time (source "roku") to Supabase view_events; shows in each festival's analytics and the network dashboard. Failures are ignored so playback is never affected.

## Ads (the waterfall)
- components/AdTask.brs, AdTask.xml and AdTracking.brs are the proven ad task copied **byte for byte** from the working Fuego TV channel. Never edit them and never change the RAF parameters.
- components/SceneAds.brs only decides when an ad pod runs: one preroll before a film, a live channel or a TV Guide channel, and up to two ads in the Festaview Cinemas lobby before showtime (an ad is dropped the moment showtime arrives so nobody misses the film).
- The ad address in components/Config.brs is the website's `roku-vast` function (web/netlify/functions/roku-vast.mjs). It asks **Adtelligent first**; only if Adtelligent has no ad does it play one of Festaview's own spots, and if there is nothing to play it returns an empty ad so the slot is skipped.
- **Netlify environment variable `ROKU_ADTELLIGENT_TAG`** must be set to Festaview's own Adtelligent address, written with the placeholders `{w} {h} {cb} {ua} {uip} {model} {store} {tid}`. Until it is set, every slot plays one of Festaview's own spots. Never put the zone or channel id in the code.
- Own spots are managed by the network owner in the Network console, tab "Roku ads" (database tables from supabase/migrations/021_roku_ads.sql). Spots carry no tracking, so house ads never count toward a festival's revenue share.
- Impressions: AdTracking.brs reports each Adtelligent impression to `track_url` (manifest) = the `roku-track` function, which stores it against the festival that owns the film, live channel or showing (`roku_ad_events`), for the festival's share of ad revenue.
- **Not set yet:** the manifest has no `ad_app_bundle` because the real Roku channel id does not exist until the channel is created in the Roku developer dashboard. Add it (and put the same id in the Adtelligent tag) once it exists.

## Rules for this channel
- manifest: no minimum_firmware_version, and do not call initClientCertificates (Roku OS 16 rejects both).
- Leave other sites' Roku channels and feeds alone.

## Sideload for testing
Enable developer mode on the Roku, then build the zip (a real zip with the manifest at its root; Git Bash tar writes a tar file the Roku calls corrupt, so use this script):

    python roku/build-zip.py

Upload the zip at http://<roku-ip> (developer installer). Then check, in this order:
1. The home screen loads and shows a "Festaview Cinemas" row when a showing is scheduled.
2. A free showing: doors-open card, countdown, then the film starts on its own at showtime. Join a second showing late and confirm it starts at the live point.
3. A paid showing: the ticket code box appears; a wrong code is refused with a message.
4. A film from a festival row: an ad plays first (an internal spot while the Adtelligent tag is not set), then the film.
5. Back leaves the room and returns to the home screen.

## Still needed before publishing
Channel icons and splash image, a Roku channel id, the Adtelligent tag, and a full test on a real device.
