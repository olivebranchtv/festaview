' Joins a Festaview Cinemas showing: calls the same database function the website uses (cinema_join).
' The answer says whether the doors are open, whether the viewer has a seat (or a ticket, for paid showings),
' and gives the films, the showtime and the server clock so every viewer stays in step.

sub init()
  m.top.functionName = "join"
end sub

function postRpc(name as string, body as object) as object
  cfg = FestaviewConfig()
  port = CreateObject("roMessagePort")
  req = CreateObject("roUrlTransfer")
  req.SetMessagePort(port)
  req.SetCertificatesFile("common:/certs/ca-bundle.crt")
  req.AddHeader("apikey", cfg.supabaseAnonKey)
  req.AddHeader("Content-Type", "application/json")
  req.RetrieveBodyOnError(true)
  req.SetUrl(cfg.supabaseUrl + "/rest/v1/rpc/" + name)
  if not req.AsyncPostFromString(FormatJson(body)) then return invalid
  msg = wait(15000, port)
  if type(msg) <> "roUrlEvent" then return invalid
  txt = msg.GetString()
  if txt = "" then return invalid
  return ParseJson(txt)
end function

sub join()
  req = m.top.request
  out = { status: "error" }
  if req <> invalid then
    body = { p_showing: req.showingId, p_device: req.deviceId, p_code: invalid }
    if req.code <> invalid and req.code <> "" then body.p_code = req.code
    answer = postRpc("cinema_join", body)
    if answer <> invalid and type(answer) = "roAssociativeArray" and answer.status <> invalid then out = answer
  end if
  m.top.result = out
end sub
