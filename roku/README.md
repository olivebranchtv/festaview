# Festaview Roku channel

SceneGraph channel. Reads festivals, films and live feeds from Supabase (see components/Config.brs).

- TV Guide row (first): automatic festival channels. Logic in components/Channels.brs, mirrors web/src/channels.js
  (same shuffle hash, same wall-clock schedule). Change one, change the other.
- Live Now row: live_feeds with a stream link. Festival rows: each festival's films.
- Ads are NOT included. Copy the proven ad task from a working channel unmodified; never alter RAF parameters.
- manifest: no minimum_firmware_version, and do not call initClientCertificates (Roku OS 16 rejects both).

## Sideload for testing
Enable developer mode on the Roku, then zip the CONTENTS of this folder (manifest must be at the zip root):

    tar -a -c -f festaview-roku-sideload.zip -C roku .

Upload the zip at http://<roku-ip> (developer installer).

## Still needed before publishing
Channel icons and splash image, a Roku channel id, ads, and a test on a real device.
