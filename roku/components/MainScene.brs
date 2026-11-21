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

sub onFeedResult()
  data = m.feedTask.result
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
      gitem.description = cur.title
      gitem.hdPosterUrl = cur.poster
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
        item.addFields({ festivalId: film.festival_id, filmId: film.id })
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
    runAdThen({ kind: "channel", ch: ch }, 1, "preroll", cur.filmId, cur.title)
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
  runAdThen({ kind: "item", item: item }, 1, "preroll", tid, item.title)
end sub

' Plays a film or live feed from the rows, after any ad has finished.
sub playItemNow(item as object)
  flushView()
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
  flushView()
  m.nowChannel = invalid
  m.nowItem = invalid
  m.player.control = "stop"
  m.player.visible = false
  m.rows.setFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
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
