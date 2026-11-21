' Festaview Cinemas on Roku. The first row of the home screen lists what is playing on each screen (the same schedule as festaview.com/cinema).
' Choosing a showing joins it through the database (CinemaTask). Everyone is on the server's clock, so the film starts at the same moment for all
' viewers, and a viewer who arrives late joins at the live point. Before showtime the doors are open and a sponsor ad pod plays (see SceneAds.brs).
' Paid showings need a ticket code (bought at festaview.com/cinema); it is typed once on the TV and remembered.

' ---------------------------------------------------------------- small helpers
function parseIsoSec(s as dynamic) as integer
  if s = invalid then return 0
  if GetInterface(s, "ifString") = invalid then return 0
  txt = s
  if Len(txt) < 19 then return 0
  dt = CreateObject("roDateTime")
  dt.FromISO8601String(Left(txt, 19) + "Z")
  return dt.AsSeconds()
end function

function numToInt(v as dynamic) as integer
  if v = invalid then return 0
  t = type(v)
  if t = "Integer" or t = "roInt" or t = "LongInteger" or t = "Float" or t = "roFloat" or t = "Double" or t = "roDouble" then return Int(v)
  return 0
end function

function twoDigits(n as integer) as string
  txt = n.ToStr()
  return Right("0" + txt, 2)
end function

function mmss(sec as integer) as string
  if sec < 0 then sec = 0
  mins = sec \ 60
  secs = sec MOD 60
  return mins.ToStr() + ":" + twoDigits(secs)
end function

' "Today 7:30 PM" or "Nov 21  7:30 PM", in the viewer's local time.
function showTimeText(sec as integer) as string
  dt = CreateObject("roDateTime")
  dt.FromSeconds(sec)
  dt.ToLocalTime()
  nowDt = CreateObject("roDateTime")
  nowDt.ToLocalTime()
  h = dt.GetHours()
  suffix = "AM"
  if h >= 12 then suffix = "PM"
  h12 = h MOD 12
  if h12 = 0 then h12 = 12
  hs = h12.ToStr()
  t = hs + ":" + twoDigits(dt.GetMinutes()) + " " + suffix
  if dt.GetYear() = nowDt.GetYear() and dt.GetMonth() = nowDt.GetMonth() and dt.GetDayOfMonth() = nowDt.GetDayOfMonth() then return "Today " + t
  months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  mi = dt.GetMonth() - 1
  if mi < 0 or mi > 11 then mi = 0
  dayNum = dt.GetDayOfMonth()
  ds = dayNum.ToStr()
  return months[mi] + " " + ds + "  " + t
end function

function savedTicket(showingId as string) as string
  sec = CreateObject("roRegistrySection", "festaview")
  key = "ticket_" + showingId
  if sec.Exists(key) then return sec.Read(key)
  return ""
end function

sub saveTicket(showingId as string, code as string)
  sec = CreateObject("roRegistrySection", "festaview")
  sec.Write("ticket_" + showingId, code)
  sec.Flush()
end sub

sub forgetTicket(showingId as string)
  sec = CreateObject("roRegistrySection", "festaview")
  sec.Delete("ticket_" + showingId)
  sec.Flush()
end sub

' ---------------------------------------------------------------- the Festaview Cinemas row
sub addCinemaRow(root as object, showings as dynamic)
  m.cinemaRow = -1
  if showings = invalid then return
  if type(showings) <> "roArray" then return
  nowSec = CreateObject("roDateTime").AsSeconds()
  items = []
  for each s in showings
    if type(s) = "roAssociativeArray" then
      endSec = parseIsoSec(s.ends_at)
      if endSec > nowSec and s.id <> invalid and s.title <> invalid then items.Push(s)
    end if
  end for
  if items.Count() = 0 then return
  m.cinemaRow = root.GetChildCount()
  row = root.CreateChild("ContentNode")
  row.title = "Festaview Cinemas"
  shown = 0
  for each s in items
    if shown < 20 then
      startSec = parseIsoSec(s.starts_at)
      endSec = parseIsoSec(s.ends_at)
      price = numToInt(s.price_cents)
      item = row.CreateChild("ContentNode")
      item.title = s.title
      item.hdPosterUrl = valueOr(s.poster_url, "")
      priceText = "Free"
      if price > 0 then
        dollars = price \ 100
        cents = price MOD 100
        priceText = "$" + dollars.ToStr()
        if cents > 0 then priceText = priceText + "." + twoDigits(cents)
        priceText = priceText + " ticket"
      end if
      item.shortDescriptionLine1 = valueOr(s.screen_name, "Screen") + "  |  " + showTimeText(startSec) + "  |  " + priceText
      item.description = valueOr(s.description, "")
      item.addFields({ showingId: s.id, startSec: startSec, endSec: endSec, priceCents: price })
      shown = shown + 1
    end if
  end for
end sub

' ---------------------------------------------------------------- joining
sub openShowing(item as object)
  if m.cinemaTask <> invalid then return
  if m.room <> invalid then return
  stopHeroVideo()
  code = ""
  if item.priceCents > 0 then
    code = savedTicket(item.showingId)
    if code = "" then
      askTicketCode(item)
      return
    end if
  end if
  startJoin(item, code)
end sub

sub askTicketCode(item as object)
  d = CreateObject("roSGNode", "StandardKeyboardDialog")
  d.title = "Enter your ticket code"
  d.message = ["This showing needs a ticket.", "Buy one at festaview.com/cinema, then type the code that starts with FV-."]
  d.buttons = ["Join", "Cancel"]
  d.observeFieldScoped("buttonSelected", "onTicketButton")
  m.ticketItem = item
  m.ticketDialog = d
  m.top.dialog = d
end sub

sub onTicketButton()
  d = m.ticketDialog
  if d = invalid then return
  idx = d.buttonSelected
  code = UCase(d.text).Trim()
  d.close = true
  m.ticketDialog = invalid
  m.rows.setFocus(true)
  if idx = 0 and code <> "" and m.ticketItem <> invalid then startJoin(m.ticketItem, code)
end sub

sub startJoin(item as object, code as string)
  m.joinItem = item
  m.joinCode = code
  t = CreateObject("roSGNode", "CinemaTask")
  t.observeField("raw", "onJoinResult")
  t.request = { showingId: item.showingId, deviceId: m.deviceId, code: code }
  m.cinemaTask = t
  t.control = "RUN"
  m.joinTimer.control = "start"
  showRoomCard(item.title, "Finding your seat...")
end sub

' Back while "Finding your seat..." is showing: give up on joining and return to the home screen.
sub cancelJoin()
  m.joinTimer.control = "stop"
  if m.cinemaTask <> invalid then m.cinemaTask.control = "STOP"
  m.cinemaTask = invalid
  hideRoomCard()
  m.rows.setFocus(true)
  onRowFocus()
end sub

' Safety net: if the website does not answer, say so instead of waiting forever.
sub onJoinTimeout()
  if m.cinemaTask = invalid then return
  m.cinemaTask.control = "STOP"
  m.cinemaTask = invalid
  hideRoomCard()
  m.rows.setFocus(true)
  showNote("Festaview Cinemas", ["Could not reach Festaview.", "Check the internet connection and try again."])
end sub

sub showNote(titleText as string, lines as object)
  d = CreateObject("roSGNode", "StandardMessageDialog")
  d.title = titleText
  d.message = lines
  d.buttons = ["OK"]
  d.observeFieldScoped("buttonSelected", "onNoteButton")
  m.noteDialog = d
  m.top.dialog = d
end sub

sub onNoteButton()
  if m.noteDialog <> invalid then m.noteDialog.close = true
  m.noteDialog = invalid
  m.rows.setFocus(true)
end sub

sub onJoinResult()
  m.joinTimer.control = "stop"
  raw = ""
  if m.cinemaTask <> invalid then raw = m.cinemaTask.raw
  m.cinemaTask = invalid
  hideRoomCard()
  m.rows.setFocus(true)
  ' The answer comes back as JSON text; read it here.
  r = ParseJson(raw)
  st = "error"
  if r <> invalid then
    if type(r) = "roAssociativeArray" then
      if r.status <> invalid then st = r.status
    end if
  end if
  title = "Festaview Cinemas"
  if st = "ok" then
    if m.joinCode <> "" then saveTicket(m.joinItem.showingId, m.joinCode)
    enterRoom(r)
  else if st = "too_early" then
    opens = parseIsoSec(r.opens_at)
    showNote(title, ["The doors are not open yet.", "They open at " + showTimeText(opens) + ". Come back then."])
  else if st = "ended" then
    showNote(title, ["This showing has ended."])
  else if st = "full" then
    showNote(title, ["Sorry, this showing is sold out."])
  else if st = "ticket_required" then
    forgetTicket(m.joinItem.showingId)
    showNote(title, ["That ticket code was not accepted.", "Buy a ticket at festaview.com/cinema and try again."])
  else if st = "not_found" then
    showNote(title, ["This showing is not available."])
  else
    lines = ["Could not join right now. Please try again."]
    if r <> invalid then
      if type(r) = "roAssociativeArray" then
        if r.detail <> invalid then lines.Push(r.detail)
      end if
    end if
    showNote(title, lines)
  end if
end sub

' ---------------------------------------------------------------- the room
sub enterRoom(info as object)
  nowSec = CreateObject("roDateTime").AsSeconds()
  serverMs = info.server_now
  serverSec = nowSec
  if serverMs <> invalid then serverSec = serverMs / 1000
  room = {}
  room.info = info
  room.title = info.title
  room.festivalId = info.festival_id
  room.showingId = m.joinItem.showingId
  room.skew = serverSec - nowSec
  room.startSec = parseIsoSec(info.starts_at)
  room.endSec = parseIsoSec(info.ends_at)
  room.timeline = []
  total = 0
  if info.kind = "live" then
    url = valueOr(info.live_stream_url, "")
    dur = numToInt(info.runtime_min) * 60
    if url <> "" then
      room.timeline.Push({ url: url, title: info.title, dur: dur, format: guessFormat(url), live: true, filmId: invalid })
      total = total + dur
    end if
  else if info.films <> invalid then
    for each f in info.films
      url = valueOr(f.video_url, "")
      if url <> "" then
        dur = numToInt(f.duration_sec)
        room.timeline.Push({ url: url, title: valueOr(f.title, info.title), dur: dur, format: guessFormat(url), live: false, filmId: f.id })
        total = total + dur
      end if
    end for
  end if
  room.total = total
  room.curIdx = -1
  room.tick = 0
  m.room = room
  m.roomTimer.control = "start"
  ' Doors open early: a sponsor ad pod plays while there is plenty of time before showtime.
  if roomNowSec() + 40 < room.startSec then
    runAdThen({ kind: "room" }, m.adCfg.lobby, "lobby", room.showingId, room.title)
  else
    onRoomTick()
  end if
end sub

' Seconds on the server's clock (this TV's clock plus the skew measured when joining). Dynamic: it can be a whole number or a fraction.
function roomNowSec() as dynamic
  nowSec = CreateObject("roDateTime").AsSeconds()
  if m.room = invalid then return nowSec
  return nowSec + m.room.skew
end function

sub onRoomTick()
  r = m.room
  if r = invalid then return
  n = roomNowSec()
  if n < r.startSec then
    if m.inAd = true then return
    if m.player.visible then
      m.player.control = "stop"
      m.player.visible = false
    end if
    r.curIdx = -1
    secsToStart = Int(r.startSec - n)
    showRoomCard(r.title, "The doors are open. The film starts in " + mmss(secsToStart))
    return
  end if
  if m.inAd = true then abortAd()
  elapsed = n - r.startSec
  found = -1
  offset = 0
  if elapsed < r.total then
    acc = 0
    for i = 0 to r.timeline.Count() - 1
      d = r.timeline[i].dur
      if found = -1 and elapsed < acc + d then
        found = i
        offset = elapsed - acc
      end if
      acc = acc + d
    end for
  end if
  if found >= 0 then
    hideRoomCard()
    if found <> r.curIdx then
      r.curIdx = found
      playRoomItem(found, Int(offset))
    else
      roomDriftCheck(offset)
    end if
    return
  end if
  if n < r.endSec then
    if r.curIdx <> -2 then
      flushView()
      m.player.control = "stop"
      m.player.visible = false
      r.curIdx = -2
    end if
    secsToClose = Int(r.endSec - n)
    showRoomCard("Thanks for watching", "Q&A and conversation. The theater closes in " + mmss(secsToClose))
    return
  end if
  closeRoom("This showing has ended.")
end sub

sub playRoomItem(idx as integer, offset as integer)
  flushView()
  it = m.room.timeline[idx]
  m.nowChannel = invalid
  m.nowItem = { festivalId: m.room.festivalId, filmId: it.filmId }
  c = CreateObject("roSGNode", "ContentNode")
  c.url = it.url
  c.streamFormat = it.format
  c.title = it.title
  if it.live = false and offset > 0 then c.PlayStart = offset
  m.player.control = "stop"
  m.player.content = c
  m.player.visible = true
  m.player.setFocus(true)
  m.player.control = "play"
end sub

' Keeps this TV in step with the room: if it drifts more than a few seconds, move it to where the room is.
sub roomDriftCheck(offset as double)
  r = m.room
  r.tick = r.tick + 1
  if r.tick MOD 8 <> 0 then return
  if m.player.state <> "playing" then return
  it = r.timeline[r.curIdx]
  if it.live = true then return
  drift = m.player.position - offset
  if drift < 0 then drift = 0 - drift
  if drift > 6 then m.player.seek = offset
end sub

sub closeRoom(message as string)
  m.roomTimer.control = "stop"
  if m.inAd = true then abortAd()
  flushView()
  m.nowItem = invalid
  m.nowChannel = invalid
  m.player.control = "stop"
  m.player.visible = false
  hideRoomCard()
  m.room = invalid
  m.rows.setFocus(true)
  onRowFocus()
  if message <> "" then showNote("Festaview Cinemas", [message])
end sub

sub showRoomCard(titleText as string, lineText as string)
  m.roomCard.visible = true
  m.roomTitle.text = titleText
  m.roomLine.text = lineText
  if m.inAd <> true then m.top.setFocus(true)
end sub

sub hideRoomCard()
  m.roomCard.visible = false
end sub
