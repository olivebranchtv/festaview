Library "Roku_Ads.brs"

sub init()
    m.top.functionName = "runTask"
end sub

' Fills the Roku RAF macros ({ROKU_ADS_*}) and swaps in WatchSpree's app name / channel id.
function buildVastUrl(rawUrl as String) as String
    di = CreateObject("roDeviceInfo")
    info = CreateObject("roAppInfo")

    rida = di.GetRIDA()
    if rida = invalid or rida = "" then rida = "00000000-0000-0000-0000-000000000000"
    rida = CreateObject("roRegex", "[\{\}]", "").ReplaceAll(rida, "")
    extIp = di.GetExternalIp()
    if extIp = invalid then extIp = ""
    ts = Str(CreateObject("roDateTime").AsSeconds()).Trim()
    model = di.GetModel()
    if model = invalid then model = "Roku"
    ua = "Roku/" + model

    bundle = info.GetValue("ad_app_bundle")
    appName = info.GetValue("ad_app_name")
    storeUrl = "https%3A%2F%2Fchannelstore.roku.com%2Fdetails%2F" + bundle

    url = rawUrl
    url = CreateObject("roRegex", "\{ROKU_ADS_CONTENT_WIDTH\}", "").ReplaceAll(url, "1920")
    url = CreateObject("roRegex", "\{ROKU_ADS_CONTENT_HEIGHT\}", "").ReplaceAll(url, "1080")
    url = CreateObject("roRegex", "\{ROKU_ADS_TIMESTAMP\}", "").ReplaceAll(url, ts)
    url = CreateObject("roRegex", "\{ROKU_ADS_EXTERNAL_IP\}", "").ReplaceAll(url, extIp)
    url = CreateObject("roRegex", "\{ROKU_ADS_USER_AGENT\}", "").ReplaceAll(url, ua)
    url = CreateObject("roRegex", "\{ROKU_ADS_MODEL\}", "").ReplaceAll(url, model)
    url = CreateObject("roRegex", "\{ROKU_ADS_STORE_URL\}", "").ReplaceAll(url, storeUrl)
    url = CreateObject("roRegex", "\{ROKU_ADS_TRACKING_ID\}", "").ReplaceAll(url, rida)
    if appName <> "" then url = CreateObject("roRegex", "app_name=[^&]*", "").ReplaceAll(url, "app_name=" + appName)
    url = CreateObject("roRegex", "app_bundle=[^&]*", "").ReplaceAll(url, "app_bundle=" + bundle)
    ' the Fuego ad waterfall logs which source (Adtelligent or our own spots) served each ad, per title
    if Instr(1, url, "/roku-vast") > 0 and m.top.titleId <> invalid and m.top.titleId <> ""
        tn = m.top.titleName
        if tn = invalid then tn = ""
        esc = CreateObject("roUrlTransfer")
        url = url + "&title=" + esc.Escape(m.top.titleId) + "&tn=" + esc.Escape(Left(tn, 60))
    end if
    return url
end function

sub runTask()
    try
        runAds()
    catch e
        print "AdTask: ad error, skipping ads: "; e.message
        print "AdTask: backtrace: "; FormatJson(e.backtrace)
    end try
    m.top.adDone = true
end sub

sub runAds()
    video = m.top.videoNode
    if video = invalid then return
    view = video.getParent()
    raw = m.top.vastUrl
    ' RAF silently hangs on non-https VAST, so skip those.
    if raw = invalid or Left(raw, 8) <> "https://" then return
    count = m.top.adCount
    if count < 1 then count = 1
    if count > 10 then count = 10
    ' Tell WatchSpree which title each ad impression ran on (Adtelligent only reports totals).
    trackObj = {
        task: m.top,
        trackUrl: CreateObject("roAppInfo").GetValue("track_url"),
        titleId: m.top.titleId,
        titleName: m.top.titleName,
        phase: m.top.phase,
        device: CreateObject("roDeviceInfo").GetChannelClientId()
    }
    RAF = Roku_Ads()
    RAF.setTrackingCallback(adTrackCb, trackObj)
    for i = 1 to count
        RAF.setAdUrl(buildVastUrl(raw))
        pods = RAF.getAds()
        print "AdTask: ad "; i; " of "; count; " getAds ok="; (pods <> invalid)
        if pods = invalid or pods.Count() = 0 then exit for
        shown = RAF.showAds(pods, invalid, view)
        print "AdTask: ad "; i; " done, completed="; shown
    end for
end sub
