' One tile in a row: the artwork (when there is some), and the title underneath.
' When a title has no artwork, or the artwork has not loaded, the title is also printed inside the tile so no tile is ever blank.
sub init()
  m.poster = m.top.findNode("poster")
  m.label = m.top.findNode("label")
  m.fallback = m.top.findNode("fallback")
  m.poster.observeField("loadStatus", "onPosterStatus")
end sub

sub onContent()
  c = m.top.itemContent
  if c = invalid then return
  caption = ""
  if c.title <> invalid then caption = c.title
  uri = ""
  if c.hdPosterUrl <> invalid then uri = c.hdPosterUrl
  m.label.text = caption
  m.fallback.text = caption
  m.fallback.visible = true
  m.poster.uri = uri
end sub

sub onPosterStatus()
  m.fallback.visible = (m.poster.loadStatus <> "ready")
end sub
