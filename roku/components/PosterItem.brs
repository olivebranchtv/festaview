sub onContent()
  c = m.top.itemContent
  m.top.findNode("poster").uri = c.hdPosterUrl
  m.top.findNode("label").text = c.title
end sub
