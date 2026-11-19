' Automatic festival channels. Mirrors web/src/channels.js so Roku and the website show the same film at the
' same moment: films play back to back, and the position is (seconds since 1970) MOD (total length of all films).
' Films arrive from the feed newest first. If you change the rules here, change web/src/channels.js too.

function toInt(v as dynamic) as integer
  t = type(v)
  if t = "roInt" or t = "Integer" or t = "roInteger" then return v
  if t = "roLongInteger" or t = "LongInteger" then return v
  if t = "roFloat" or t = "Float" or t = "roDouble" or t = "Double" then return Int(v)
  return 0
end function

function channelDuration(film as object) as integer
  d = toInt(film.duration_sec)
  if d > 0 then return d
  r = toInt(film.runtime_min)
  if r > 0 then return r * 60
  return 0
end function

function hasVideo(film as object) as boolean
  u = film.video_url
  if u = invalid then return false
  if type(u) <> "roString" and type(u) <> "String" then return false
  return Len(u) > 0
end function

' Same hash as hashKey() in channels.js (kept small so it fits in a 32-bit integer).
function hashKey(s as string) as integer
  h = 7
  for i = 1 to Len(s)
    h = (h * 131 + Asc(Mid(s, i, 1))) MOD 1000003
  end for
  return h
end function

function arrangeFilms(films as object, order as string, seed as string) as object
  out = []
  if order = "newest" then
    for each f in films
      out.Push(f)
    end for
    return out
  end if

  oldest = []
  for i = films.Count() - 1 to 0 step -1
    oldest.Push(films[i])
  end for

  if order = "shuffle" then
    keyed = []
    for i = 0 to oldest.Count() - 1
      keyed.Push({ k: hashKey(seed + ":" + oldest[i].id) * 1000 + i, f: oldest[i] })
    end for
    keyed.SortBy("k")
    for each e in keyed
      out.Push(e.f)
    end for
    return out
  end if

  return oldest
end function

function makeChannel(id as string, number as integer, name as string, films as object, order as string) as object
  playable = []
  for each f in films
    if hasVideo(f) and channelDuration(f) > 0 then playable.Push(f)
  end for
  if playable.Count() = 0 then return invalid

  items = []
  cycle = 0
  for each f in arrangeFilms(playable, order, id)
    d = channelDuration(f)
    items.Push({ title: f.title, url: f.video_url, format: guessFormat(f.video_url), poster: valueOr(f.poster_url, ""), duration: d, filmId: f.id, festivalId: f.festival_id })
    cycle = cycle + d
  end for
  return { id: id, number: number, name: name, items: items, cycle: cycle }
end function

' One channel per festival that switched its channel on, plus Festaview Mix (channel 1) made of all of them.
function buildChannels(data as object) as object
  chans = []
  fests = []
  for each f in data.festivals
    if f.auto_channel = true then fests.Push(f)
  end for

  mixFilms = []
  for each film in data.films
    for each f in fests
      if film.festival_id = f.id then
        mixFilms.Push(film)
        exit for
      end if
    end for
  end for
  mix = makeChannel("mix", 1, "Festaview Mix", mixFilms, "shuffle")
  if mix <> invalid then chans.Push(mix)

  idx = 0
  for each f in fests
    own = []
    for each film in data.films
      if film.festival_id = f.id then own.Push(film)
    end for
    ch = makeChannel("fest-" + f.id, 2 + idx, f.name + " Channel", own, valueOr(f.channel_order, "listed"))
    if ch <> invalid then chans.Push(ch)
    idx = idx + 1
  end for
  return chans
end function

' Which film is on right now and how many seconds in.
function channelNow(ch as object) as object
  clock = CreateObject("roDateTime")
  clock.Mark()
  t = clock.AsSeconds() MOD ch.cycle
  acc = 0
  for i = 0 to ch.items.Count() - 1
    d = ch.items[i].duration
    if t < acc + d then return { index: i, offset: t - acc }
    acc = acc + d
  end for
  return { index: 0, offset: 0 }
end function
