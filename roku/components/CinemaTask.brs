' Joins a Festaview Cinemas showing: calls the same database function the website uses (cinema_join).
' The answer says whether the doors are open, whether the viewer has a seat (or a ticket, for paid showings),
' and gives the films, the showtime and the server clock so every viewer stays in step.
'
' The answer goes back to the screen as plain text (JSON) and is read there. Handing a big nested answer through a node field can fail
' silently on some Rokus, and a failure here must never leave the screen waiting forever, so any error is turned into an "error" answer.

sub init()
  m.top.functionName = "join"
end sub

' Returns the reply body as text ("" when there was no reply).
function postRpcText(name as string, body as object) as string
  cfg = FestaviewConfig()
  port = CreateObject("roMessagePort")
  req = CreateObject("roUrlTransfer")
  req.SetMessagePort(port)
  req.SetCertificatesFile("common:/certs/ca-bundle.crt")
  req.AddHeader("apikey", cfg.supabaseAnonKey)
  req.AddHeader("Content-Type", "application/json")
  req.SetUrl(cfg.supabaseUrl + "/rest/v1/rpc/" + name)
  if not req.AsyncPostFromString(FormatJson(body)) then return ""
  msg = wait(15000, port)
  if type(msg) <> "roUrlEvent" then return ""
  return msg.GetString()
end function

sub join()
  out = FormatJson({ status: "error" })
  try
    req = m.top.request
    if req <> invalid then
      body = { p_showing: req.showingId, p_device: req.deviceId, p_code: invalid }
      if req.code <> invalid and req.code <> "" then body.p_code = req.code
      txt = postRpcText("cinema_join", body)
      if txt <> "" then out = txt
    end if
  catch e
    out = FormatJson({ status: "error", detail: e.message })
  end try
  m.top.raw = out
end sub
