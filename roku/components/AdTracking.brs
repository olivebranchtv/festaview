' Called by the Roku ad library for every ad event. We only report impressions and completions, with the title that was playing.
' Arguments are Dynamic on purpose: the ad library sometimes passes invalid, and a typed argument would abort the whole ad.
sub adTrackCb(obj as Dynamic, eventType as Dynamic, ctx as Dynamic)
    if type(eventType) <> "String" and type(eventType) <> "roString" then return
    if type(obj) <> "roAssociativeArray" then return
    if obj.task <> invalid then obj.task.adBeat = obj.task.adBeat + 1
    print "AdTask event: "; eventType
    if eventType <> "Impression" and eventType <> "Complete" then return
    if obj = invalid or obj.titleId = invalid or obj.titleId = "" or obj.trackUrl = invalid or obj.trackUrl = "" then return
    ' never let reporting get in the way of an ad
    try
        http = CreateObject("roUrlTransfer")
        http.SetUrl(obj.trackUrl)
        http.SetCertificatesFile("common:/certs/ca-bundle.crt")
        http.AddHeader("Content-Type", "application/json")
        body = FormatJson({ type: "rokuad", titleId: obj.titleId, title: obj.titleName, phase: obj.phase, kind: LCase(eventType), device: obj.device })
        code = http.PostFromString(body)
        print "AdTask: "; eventType; " report sent, http status "; code
    catch e
        print "adTrackCb: could not report "; eventType; ": "; e.message
    end try
end sub
