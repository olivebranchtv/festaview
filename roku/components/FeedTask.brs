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
  req.AddHeader("Authorization", "Bearer " + cfg.supabaseAnonKey)
  req.SetUrl(cfg.supabaseUrl + "/rest/v1/" + path)
  body = req.GetToString()
  if body = "" then return invalid
  return ParseJson(body)
end function

sub fetchFeed()
  festivals = httpGetJson("festivals?status=eq.published&order=sort_order.asc,name.asc&select=*")
  if festivals = invalid then
    m.top.error = "Could not load festivals"
    return
  end if
  films = httpGetJson("films?status=eq.published&order=created_at.desc&select=*")
  feeds = httpGetJson("live_feeds?select=*")
  if films = invalid then films = []
  if feeds = invalid then feeds = []
  m.top.result = { festivals: festivals, films: films, feeds: feeds }
end sub
