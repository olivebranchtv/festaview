' Ad plumbing for the home scene. The ad task itself (AdTask.brs, AdTracking.brs) is the proven one copied unchanged from the working channels;
' do not edit it. This file only decides WHEN an ad pod runs and what happens afterwards.
'
' The waterfall (Adtelligent first, our own spots when Adtelligent has no ad) lives on the server: the ad address in Config.brs is the roku-vast
' function. This app just asks for that one address.
'
' Preroll: before a film, a live channel or a TV Guide channel. Lobby: while the doors of a Festaview Cinemas showing are open before showtime.

' after = what to do when the ads are done: { kind: "item", item: node } | { kind: "channel", ch: channel } | { kind: "room" }
sub runAdThen(after as object, count as integer, phase as string, titleId as dynamic, titleName as dynamic)
  vast = FestaviewConfig().vastUrl
  if vast = invalid or vast = "" then
    runAfterAd(after)
    return
  end if
  m.afterAd = after
  m.baseKids = m.top.getChildCount()
  m.inAd = true
  m.player.visible = true
  m.ad = CreateObject("roSGNode", "AdTask")
  m.ad.vastUrl = vast
  m.ad.adCount = count
  m.ad.videoNode = m.player
  if titleId <> invalid and GetInterface(titleId, "ifString") <> invalid then m.ad.titleId = titleId
  if titleName <> invalid and GetInterface(titleName, "ifString") <> invalid then m.ad.titleName = titleName
  m.ad.phase = phase
  m.ad.observeField("adDone", "onAdDone")
  m.ad.observeField("adBeat", "onAdBeat")
  m.adIdle = 0
  m.adWatch.control = "start"
  m.ad.control = "RUN"
end sub

sub onAdBeat()
  m.adIdle = 0
end sub

' If the ad library goes quiet for 75 seconds (an ad that failed to load), give up on ads and carry on.
sub onAdWatch()
  m.adIdle = m.adIdle + 1
  if m.adIdle >= 75 and m.inAd = true then
    if m.ad <> invalid then m.ad.control = "STOP"
    onAdDone()
  end if
end sub

sub onAdDone()
  if m.inAd <> true then return
  m.adWatch.control = "stop"
  clearAdView()
  m.inAd = false
  after = m.afterAd
  m.afterAd = invalid
  runAfterAd(after)
end sub

' Showtime arrived while an ad was playing: drop the ad so this viewer joins the film at the live point.
sub abortAd()
  if m.inAd <> true then return
  m.adWatch.control = "stop"
  if m.ad <> invalid then m.ad.control = "STOP"
  clearAdView()
  m.inAd = false
  m.afterAd = invalid
end sub

sub runAfterAd(after as dynamic)
  if after = invalid then return
  if after.kind = "item" then
    playItemNow(after.item)
  else if after.kind = "channel" then
    n = channelNow(after.ch)
    startChannelItem(after.ch, n.index, n.offset)
  else if after.kind = "room" then
    onRoomTick()
  end if
end sub

sub clearAdView()
  if m.baseKids = invalid then return
  while m.top.getChildCount() > m.baseKids
    m.top.removeChildIndex(m.top.getChildCount() - 1)
  end while
  if m.player.visible then m.player.setFocus(true)
end sub
