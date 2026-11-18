' Festaview hub: one row per festival (its films), with a "Live Now" row first.
' NOTE: Ad integration (RAF / Adtelligent) is intentionally NOT written here. Add it by copying the proven
' ad task from an existing, working channel and do not alter its RAF parameters.

sub init()
  m.rows = m.top.findNode("rows")
  m.status = m.top.findNode("status")
  m.player = m.top.findNode("player")
  m.rows.observeField("rowItemSelected", "onItemSelected")
  m.player.observeField("state", "onPlayerState")

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
      if film.festival_id = fest.id then
        item = row.CreateChild("ContentNode")
        item.title = film.title
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
  idx = m.rows.rowItemSelected
  item = m.rows.content.GetChild(idx[0]).GetChild(idx[1])
  if item.url = "" then return
  m.player.content = item
  m.player.visible = true
  m.player.setFocus(true)
  m.player.control = "play"
end sub

sub onPlayerState()
  s = m.player.state
  if s = "finished" or s = "error" then closePlayer()
end sub

sub closePlayer()
  m.player.control = "stop"
  m.player.visible = false
  m.rows.setFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
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
