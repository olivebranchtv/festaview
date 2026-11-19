' Sends one "watched N seconds" record to the same view_events table the website uses (source = "roku"), so Roku
' viewing appears in each festival's analytics and in the Festaview network dashboard.
' Analytics must never affect playback: every failure here is ignored.

sub init()
  m.top.functionName = "send"
end sub

function postView(payload as object) as integer
  cfg = FestaviewConfig()
  req = CreateObject("roUrlTransfer")
  req.SetCertificatesFile("common:/certs/ca-bundle.crt")
  req.AddHeader("apikey", cfg.supabaseAnonKey)
  req.AddHeader("Content-Type", "application/json")
  req.AddHeader("Prefer", "return=minimal")
  req.SetUrl(cfg.supabaseUrl + "/rest/v1/view_events")
  return req.PostFromString(FormatJson(payload))
end function

sub send()
  payload = m.top.payload
  if payload = invalid then return
  code = postView(payload)
  ' If the database does not have the newer "source" column yet, record the view without it.
  if code <> 201 and code <> 200 and code <> 204 then
    if payload.source <> invalid then
      payload.Delete("source")
      postView(payload)
    end if
  end if
end sub
