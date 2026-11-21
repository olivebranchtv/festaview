' Fetches festivals, films and live feeds as flat lists (no PostgREST joins) and returns them
' for MainScene to merge by festival_id.

sub init()
  m.top.functionName = "fetchFeed"
end sub

function httpGetJson(path as string) as object
  cfg = FestaviewConfig()
  req = CreateObject("roUrlTransfer")
  req.SetCertificatesFile("common:/certs/ca-bundle.crt")
  req.AddHeader("apikey", cfg.supabaseAnonKey)
  ' New-style sb_publishable_ keys go in the apikey header only (not as a Bearer token).
  req.SetUrl(cfg.supabaseUrl + "/rest/v1/" + path)
  body = req.GetToString()
  if body = "" then return invalid
  return ParseJson(body)
end function

sub fetchFeed()
  festivals = httpGetJson("festivals?status=eq.published&order=sort_order.asc,name.asc&select=*")
  ' An error from the server comes back as an object, not a list, so check the type before using it.
  if type(festivals) <> "roArray" then
    m.top.error = "Could not load festivals"
    return
  end if
  ' Films come from the public view, which hides the video link of ticketed films (they do not play on Roku).
  ' Until the paid-access SQL has been run the view does not exist, so fall back to the table.
  films = httpGetJson("films_public?order=created_at.desc&select=*")
  if type(films) <> "roArray" then films = httpGetJson("films?status=eq.published&order=created_at.desc&select=*")
  if type(films) <> "roArray" then films = []
  feeds = httpGetJson("live_feeds?select=*")
  if type(feeds) <> "roArray" then feeds = []
  ' Festaview Cinemas: what is playing on each screen (public view; an error from the server comes back as an object, so check the type).
  cinema = httpGetJson("cinema_board?select=*&order=starts_at.asc")
  if type(cinema) <> "roArray" then cinema = []
  ' Ad break settings (set in the Festaview admin, so they change without resending the channel). Empty if the table is not there yet.
  adsettings = httpGetJson("roku_ad_settings?select=*&id=eq.1")
  if type(adsettings) <> "roArray" then adsettings = []
  m.top.result = { festivals: festivals, films: films, feeds: feeds, cinema: cinema, adsettings: adsettings }
end sub
