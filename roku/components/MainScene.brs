' Festaview hub: a "Festaview Cinemas" row (what is playing now on each screen), the TV Guide, "Live Now", then one row per festival.
' Ads: the proven ad task (AdTask.brs, AdTracking.brs) is copied unchanged from the working channels and must not be edited.
' SceneAds.brs decides when an ad pod runs; Config.brs holds the ad address (the roku-vast waterfall on the website).

sub init()
  ' The Roku's default scene background is blue; use Festaview's dark colour instead.
  m.top.backgroundURI = ""
  m.top.backgroundColor = "0x0B0B12FF"
  m.rows = m.top.findNode("rows")
  m.status = m.top.findNode("status")
  m.player = m.top.findNode("player")
  m.rows.observeField("rowItemSelected", "onItemSelected")
  m.rows.observeField("rowItemFocused", "onRowFocus")

  ' Hero banner: shows the highlighted tile, and plays its trailer (muted) after a short pause
  m.heroArt = m.top.findNode("heroArt")
  m.heroTag = m.top.findNode("heroTag")
  m.heroTitle = m.top.findNode("heroTitle")
  m.heroMeta = m.top.findNode("heroMeta")
  m.heroDesc = m.top.findNode("heroDesc")
  m.heroVideo = m.top.findNode("heroVideo")
  m.heroHint = m.top.findNode("heroHint")
  m.heroMuted = heroMutePref()
  m.heroVideo.mute = m.heroMuted
  m.heroVideo.observeField("state", "onHeroVideoState")
  m.heroTimer = m.top.findNode("heroTimer")
  m.heroTimer.observeField("fire", "onHeroTimer")
  ' The trailer fades in from dark and fades out to dark (the "curtain") so it never cuts in or out
  m.heroEnding = false
  m.heroTrailer = invalid
  m.heroTried = ""

  ' Ad breaks: the defaults below are replaced by the Festaview admin settings when the feed loads (see loadAdSettings)
  m.adCfg = { preroll: 4, midBreaks: 2, midMinutes: 10, midAds: 1, lobby: 2 }
  m.midEligible = false
  m.midLeft = 0
  m.nextMid = 0
  m.currentItem = invalid
  m.heroCurtain = m.top.findNode("heroCurtain")
  m.curtainUp = m.top.findNode("curtainUp")
  m.curtainDown = m.top.findNode("curtainDown")
  m.curtainDown.observeField("state", "onCurtainDownState")

  m.player.observeField("state", "onPlayerState")
  m.player.observeField("position", "onPosition")
  m.channels = []
  m.guideRow = -1
  m.nowChannel = invalid

  ' Festaview Cinemas room, and ad plumbing (see Cinema.brs and SceneAds.brs)
  m.cinemaRow = -1
  m.room = invalid
  m.cinemaTask = invalid
  m.roomCard = m.top.findNode("roomCard")
  m.roomTitle = m.top.findNode("roomTitle")
  m.roomLine = m.top.findNode("roomLine")
  m.roomTimer = m.top.findNode("roomTimer")
  m.roomTimer.observeField("fire", "onRoomTick")
  m.roomErrors = 0
  m.inAd = false
  m.afterAd = invalid
  m.baseKids = invalid
  m.ad = invalid
  m.adIdle = 0
  m.adWatch = m.top.findNode("adWatch")
  m.adWatch.observeField("fire", "onAdWatch")

  ' Viewing reports: what is playing, where watching started, and the last position seen.
  m.nowItem = invalid
  m.watchStart = invalid
  m.lastPos = 0
  m.logTasks = []
  m.deviceId = CreateObject("roDeviceInfo").GetChannelClientId()

  m.feedTask = CreateObject("roSGNode", "FeedTask")
  m.feedTask.observeField("result", "onFeedResult")
  m.feedTask.observeField("error", "onFeedError")
  m.feedTask.control = "RUN"
end sub

sub onFeedError()
  m.status.text = m.feedTask.error
end sub

' If building the home screen ever fails, show the reason on screen (instead of leaving "Loading...") so it can be fixed from a photo.
sub onFeedResult()
  try
    buildHome()
  catch e
    m.status.visible = true
    m.status.text = "Home screen error: " + e.message + "   " + Left(FormatJson(e.backtrace), 260)
    print "Festaview home error: "; e.message
    print FormatJson(e.backtrace)
  end try
end sub

sub buildHome()
  data = m.feedTask.result
  loadAdSettings(data.adsettings)
  root = CreateObject("roSGNode", "ContentNode")

  ' Festaview Cinemas row first: what is playing now and next on each screen
  addCinemaRow(root, data.cinema)

  ' TV Guide row: automatic festival channels (scheduled playback, same film for everyone at the same time)
  m.channels = buildChannels(data)
  m.guideRow = -1
  if m.channels.Count() > 0 then
    m.guideRow = root.GetChildCount()
    guide = root.CreateChild("ContentNode")
    guide.title = "TV Guide"
    for each ch in m.channels
      n = channelNow(ch)
      cur = ch.items[n.index]
      gitem = guide.CreateChild("ContentNode")
      gitem.title = "Ch " + StrI(ch.number) + "  " + ch.name
      gitem.hdPosterUrl = cur.poster
      ' What is on right now: its synopsis and trailer feed the hero banner
      onNow = findFilm(data.films, cur.filmId)
      trailer = ""
      synopsis = "A festival channel that plays all day. Press OK to tune in."
      if onNow <> invalid then
        trailer = valueOr(onNow.trailer_url, "")
        syn = valueOr(onNow.synopsis, "")
        if syn <> "" then synopsis = syn
      end if
      gitem.description = synopsis
      gitem.shortDescriptionLine1 = "Now playing: " + cur.title
      gitem.addFields({ trailerUrl: trailer })
    end for
  end if

  ' Live Now row
  live = []
  for each f in data.feeds
    if f.is_live = true or f.is_replay_loop = true then live.Push(f)
  end for
  if live.Count() > 0 then
    row = root.CreateChild("ContentNode")
    row.title = "Live Now"
    for each f in live
      item = row.CreateChild("ContentNode")
      item.title = f.name
      item.shortDescriptionLine1 = "Live now"
      item.addFields({ festivalId: f.festival_id, liveId: f.id })
      item.hdPosterUrl = valueOr(f.poster_url, "")
      item.url = valueOr(f.stream_url, "")
      item.streamFormat = guessFormat(item.url)
    end for
  end if

  ' One row per festival (merge flat lists by festival_id)
  for each fest in data.festivals
    row = root.CreateChild("ContentNode")
    row.title = fest.name
    count = 0
    for each film in data.films
      if film.festival_id = fest.id and film.access <> "ticketed" then
        item = row.CreateChild("ContentNode")
        item.title = film.title
        item.addFields({ festivalId: film.festival_id, filmId: film.id, trailerUrl: valueOr(film.trailer_url, "") })
        item.shortDescriptionLine1 = filmMeta(film)
        item.description = valueOr(film.synopsis, "")
        item.hdPosterUrl = valueOr(film.poster_url, "")
        item.url = valueOr(film.video_url, "")
        item.streamFormat = guessFormat(item.url)
        count = count + 1
      end if
    end for
    if count = 0 then root.RemoveChild(row)
  end for

  if root.GetChildCount() = 0 then
    m.status.text = "No festivals published yet."
    return
  end if

  m.status.visible = false
  m.rows.content = root
  m.rows.visible = true
  m.rows.setFocus(true)
  onRowFocus()
end sub

' ---- ad breaks (numbers come from the Festaview admin) ----
function cfgInt(v as dynamic, fallback as integer) as integer
  if v = invalid then return fallback
  return numToInt(v)
end function

sub loadAdSettings(rows as dynamic)
  if rows = invalid then return
  if type(rows) <> "roArray" then return
  if rows.Count() = 0 then return
  r = rows[0]
  if type(r) <> "roAssociativeArray" then return
  m.adCfg.preroll = cfgInt(r.preroll_count, 4)
  m.adCfg.midBreaks = cfgInt(r.midroll_count, 2)
  m.adCfg.midMinutes = cfgInt(r.midroll_interval_minutes, 10)
  m.adCfg.midAds = cfgInt(r.midroll_ads_per_break, 1)
  m.adCfg.lobby = cfgInt(r.lobby_count, 2)
  if m.adCfg.midAds < 1 then m.adCfg.midAds = 1
end sub

' Midroll: after midMinutes of watching a film, pause it, play the ad break, then carry on from the same spot.
sub checkMidroll()
  if m.midEligible <> true then return
  if m.inAd = true then return
  if m.room <> invalid then return
  if m.currentItem = invalid then return
  if m.midLeft <= 0 then return
  if m.player.state <> "playing" then return
  if m.player.position < m.nextMid then return
  startMidroll()
end sub

sub startMidroll()
  m.midLeft = m.midLeft - 1
  at = Int(m.player.position)
  m.nextMid = at + (m.adCfg.midMinutes * 60)
  flushView()
  m.player.control = "stop"
  tid = ""
  if m.currentItem.filmId <> invalid then tid = m.currentItem.filmId
  runAdThen({ kind: "resume", item: m.currentItem, at: at }, m.adCfg.midAds, "midroll", tid, m.currentItem.title)
end sub

' Carries on with the film from where the midroll break interrupted it.
sub resumeItem(item as object, at as integer)
  item.PlayStart = at
  m.nowChannel = invalid
  m.nowItem = { festivalId: item.festivalId, filmId: item.filmId, liveId: item.liveId }
  m.player.content = item
  m.player.visible = true
  m.player.setFocus(true)
  m.player.control = "play"
end sub

' ---- hero banner: the highlighted tile, with its trailer playing muted after a short pause ----
function findFilm(films as object, id as dynamic) as dynamic
  if id = invalid then return invalid
  for each f in films
    if f.id = id then return f
  end for
  return invalid
end function

function filmMeta(film as object) as string
  parts = []
  d = valueOr(film.director, "")
  if d <> "" then parts.Push(d)
  rt = numToInt(film.runtime_min)
  if rt > 0 then
    rts = rt.ToStr()
    parts.Push(rts + " min")
  end if
  g = valueOr(film.genre, "")
  if g <> "" then parts.Push(g)
  out = ""
  for i = 0 to parts.Count() - 1
    if i > 0 then out = out + "  |  "
    out = out + parts[i]
  end for
  return out
end function

function focusedRowInfo() as dynamic
  idx = m.rows.rowItemFocused
  if idx = invalid then return invalid
  if m.rows.content = invalid then return invalid
  rowNode = m.rows.content.GetChild(idx[0])
  if rowNode = invalid then return invalid
  item = rowNode.GetChild(idx[1])
  if item = invalid then return invalid
  return { item: item, rowTitle: rowNode.title }
end function

sub onRowFocus()
  try
    refreshHero()
  catch e
    m.heroDesc.text = "Hero error: " + e.message + "  " + Left(FormatJson(e.backtrace), 200)
    print "Festaview hero error: "; e.message
  end try
end sub

sub refreshHero()
  stopHeroVideo()
  info = focusedRowInfo()
  if info = invalid then return
  setHero(info.item, info.rowTitle)
  trailer = info.item.trailerUrl
  if trailer = invalid then return
  if trailer = "" then return
  if m.room <> invalid or m.inAd = true or m.player.visible = true then return
  startHeroPrebuffer(trailer)
end sub

' Trailers start faster this way: the moment a tile is highlighted the trailer starts loading in the background, and it plays when the
' short pause ends. Bunny keeps a small ready-made MP4 next to every playlist, which starts much faster than the streaming playlist
' (the playlist is used only if that MP4 is missing).
function trailerMp4(url as string) as string
  re = CreateObject("roRegex", "^(https://[^ ]+\.b-cdn\.net/[0-9a-f-]+)/playlist\.m3u8$", "i")
  parts = re.Match(url)
  if parts.Count() > 1 then return parts[1] + "/play_480p.mp4"
  return ""
end function

sub loadHeroContent(src as string)
  c = CreateObject("roSGNode", "ContentNode")
  c.url = src
  c.streamFormat = guessFormat(src)
  m.heroVideo.content = c
  m.heroVideo.mute = m.heroMuted
end sub

sub startHeroPrebuffer(trailer as string)
  m.heroTrailer = trailer
  m.heroTried = "mp4"
  src = trailerMp4(trailer)
  if src = "" then
    m.heroTried = "hls"
    src = trailer
  end if
  loadHeroContent(src)
  m.heroVideo.control = "prebuffer"
  m.heroTimer.control = "start"
end sub

sub setHero(item as object, rowTitle as string)
  tag = UCase(rowTitle)
  if rowTitle = "Festaview Cinemas" then tag = "NOW SHOWING AT FESTAVIEW CINEMAS"
  if rowTitle = "TV Guide" then tag = "ON NOW  |  TV GUIDE"
  m.heroTag.text = tag
  m.heroTitle.text = valueOr(item.title, "")
  m.heroMeta.text = valueOr(item.shortDescriptionLine1, "")
  desc = valueOr(item.description, "")
  if Len(desc) > 230 then desc = Left(desc, 227) + "..."
  m.heroDesc.text = desc
  m.heroArt.uri = valueOr(item.hdPosterUrl, "")
end sub

sub stopHeroVideo()
  m.heroTrailer = invalid
  m.heroEnding = false
  m.heroTimer.control = "stop"
  m.curtainUp.control = "stop"
  m.curtainDown.control = "stop"
  m.heroCurtain.opacity = 0.0
  m.heroVideo.control = "stop"
  m.heroVideo.visible = false
  m.heroHint.visible = false
end sub

' Trailer sound: on by default. The * (options) button turns it off and on, and the choice is remembered on this Roku.
function heroMutePref() as boolean
  sec = CreateObject("roRegistrySection", "festaview")
  if sec.Exists("hero_mute") then
    if sec.Read("hero_mute") = "1" then return true
  end if
  return false
end function

sub toggleHeroSound()
  m.heroMuted = not m.heroMuted
  sec = CreateObject("roRegistrySection", "festaview")
  flag = "0"
  if m.heroMuted then flag = "1"
  sec.Write("hero_mute", flag)
  sec.Flush()
  m.heroVideo.mute = m.heroMuted
  showHeroHint()
end sub

sub showHeroHint()
  if m.heroMuted then
    m.heroHint.text = "Trailer sound is off. Press * to turn it on."
  else
    m.heroHint.text = "Press * to turn the trailer sound off."
  end if
  m.heroHint.visible = true
end sub

' The viewer rested on a tile: start its trailer (muted) in the hero.
sub onHeroTimer()
  if m.room <> invalid or m.inAd = true or m.player.visible = true then return
  if m.heroTrailer = invalid then return
  m.heroVideo.mute = m.heroMuted
  m.heroVideo.control = "play"
end sub

sub onHeroVideoState()
  s = m.heroVideo.state
  if s = "playing" then
    ' Re-apply the sound setting now that the trailer is really playing (some Rokus reset it when new content loads).
    m.heroVideo.mute = m.heroMuted
    if m.heroVideo.visible <> true then
      m.heroVideo.visible = true
      m.curtainDown.control = "stop"
      m.heroCurtain.opacity = 1.0
      m.curtainUp.control = "start"
    end if
    showHeroHint()
  else if s = "finished" then
    ' fade to dark, then onCurtainDownState hides the picture and fades the poster back in
    m.heroEnding = true
    m.heroHint.visible = false
    m.curtainUp.control = "stop"
    m.curtainDown.control = "start"
  else if s = "error" then
    ' If the quick MP4 was not available for this trailer, try the streaming playlist once before giving up.
    if m.heroTried = "mp4" and m.heroTrailer <> invalid then
      m.heroTried = "hls"
      loadHeroContent(m.heroTrailer)
      m.heroVideo.control = "play"
    else
      stopHeroVideo()
    end if
  end if
end sub

sub onCurtainDownState()
  if m.heroEnding <> true then return
  if m.curtainDown.state <> "stopped" then return
  m.heroEnding = false
  m.heroVideo.control = "stop"
  m.heroVideo.visible = false
  m.curtainUp.control = "start"
end sub

sub onItemSelected()
  if m.inAd = true then return
  idx = m.rows.rowItemSelected
  if idx[0] = m.cinemaRow then
    openShowing(m.rows.content.GetChild(idx[0]).GetChild(idx[1]))
    return
  end if
  if idx[0] = m.guideRow then
    ch = m.channels[idx[1]]
    n = channelNow(ch)
    cur = ch.items[n.index]
    runAdThen({ kind: "channel", ch: ch }, m.adCfg.preroll, "preroll", cur.filmId, cur.title)
    return
  end if
  item = m.rows.content.GetChild(idx[0]).GetChild(idx[1])
  if item.url = "" then return
  tid = ""
  if item.filmId <> invalid then
    tid = item.filmId
  else if item.liveId <> invalid then
    tid = item.liveId
  end if
  runAdThen({ kind: "item", item: item }, m.adCfg.preroll, "preroll", tid, item.title)
end sub

' Plays a film or live feed from the rows, after any ad has finished.
sub playItemNow(item as object)
  flushView()
  ' Films (not live feeds) get midroll breaks while they play
  item.PlayStart = 0
  m.currentItem = item
  m.midEligible = false
  if item.filmId <> invalid and m.adCfg.midBreaks > 0 and m.adCfg.midMinutes > 0 then
    m.midEligible = true
    m.midLeft = m.adCfg.midBreaks
    m.nextMid = m.adCfg.midMinutes * 60
  end if
  m.nowChannel = invalid
  m.nowItem = { festivalId: item.festivalId, filmId: item.filmId, liveId: item.liveId }
  m.player.content = item
  m.player.visible = true
  m.player.setFocus(true)
  m.player.control = "play"
end sub

' Plays one film of a channel, starting offset seconds in.
sub startChannelItem(ch as object, index as integer, offset as integer)
  flushView()
  m.midEligible = false
  it = ch.items[index]
  m.nowItem = { festivalId: it.festivalId, filmId: it.filmId }
  c = CreateObject("roSGNode", "ContentNode")
  c.url = it.url
  c.streamFormat = it.format
  c.title = it.title
  c.PlayStart = offset
  m.nowChannel = { id: ch.id, index: index }
  m.player.control = "stop"
  m.player.content = c
  m.player.visible = true
  m.player.setFocus(true)
  m.player.control = "play"
end sub

' A film on a channel ended: follow the clock to whatever is on next.
sub advanceChannel()
  ch = invalid
  for each c in m.channels
    if c.id = m.nowChannel.id then ch = c
  end for
  if ch = invalid then
    closePlayer()
    return
  end if
  n = channelNow(ch)
  if n.index = m.nowChannel.index then
    startChannelItem(ch, (n.index + 1) MOD ch.items.Count(), 0)
  else
    startChannelItem(ch, n.index, n.offset)
  end if
end sub

sub onPosition()
  m.lastPos = m.player.position
  checkMidroll()
end sub

' Records how long the viewer actually watched, then forgets it so it is only sent once.
sub flushView()
  start = m.watchStart
  m.watchStart = invalid
  if start = invalid or m.nowItem = invalid then return
  secs = Int(m.lastPos - start)
  if secs < 1 then return
  if secs > 21600 then secs = 21600
  if m.nowItem.festivalId = invalid then return
  payload = { festival_id: m.nowItem.festivalId, device_id: m.deviceId, seconds_watched: secs, source: "roku" }
  if m.nowItem.filmId <> invalid then payload.film_id = m.nowItem.filmId
  if m.nowItem.liveId <> invalid then payload.live_feed_id = m.nowItem.liveId
  t = CreateObject("roSGNode", "ViewLogTask")
  t.payload = payload
  t.control = "RUN"
  m.logTasks.Push(t)
  if m.logTasks.Count() > 12 then m.logTasks.Shift()
end sub

sub onPlayerState()
  ' While an ad pod runs, the ad library owns the picture: ignore the video node's own state changes.
  if m.inAd = true then return
  s = m.player.state
  if s = "playing" and m.watchStart = invalid then
    m.watchStart = m.player.position
    m.lastPos = m.player.position
  end if
  if m.room <> invalid then
    ' In a Festaview Cinemas room the clock decides what plays next (onRoomTick), so a finished film just waits for it.
    if s = "playing" then m.roomErrors = 0
    if s = "finished" then
      flushView()
    else if s = "error" then
      flushView()
      m.roomErrors = m.roomErrors + 1
      if m.roomErrors >= 3 then
        m.roomErrors = 0
        closeRoom("Playback problem. Please try again.")
      else
        m.room.curIdx = -1
      end if
    end if
    return
  end if
  if s = "finished" then
    flushView()
    if m.nowChannel <> invalid then
      advanceChannel()
    else
      closePlayer()
    end if
  else if s = "error" then
    closePlayer()
  end if
end sub

sub closePlayer()
  m.midEligible = false
  flushView()
  m.nowChannel = invalid
  m.nowItem = invalid
  m.player.control = "stop"
  m.player.visible = false
  m.rows.setFocus(true)
  onRowFocus()
end sub

function onKeyEvent(key as string, press as boolean) as boolean
  if press and key = "options" and m.room = invalid and m.inAd <> true and m.player.visible <> true then
    toggleHeroSound()
    return true
  end if
  if press and key = "back" and m.room <> invalid then
    closeRoom("")
    return true
  end if
  if press and key = "back" and m.player.visible then
    closePlayer()
    return true
  end if
  return false
end function

function valueOr(v as dynamic, fallback as string) as string
  if v = invalid then return fallback
  return v
end function

function guessFormat(url as string) as string
  if Instr(1, LCase(url), ".mp4") > 0 then return "mp4"
  return "hls"
end function
