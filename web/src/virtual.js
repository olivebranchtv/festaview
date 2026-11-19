// Small helpers shared by the site and the virtual screening room.
export const fmtWhen = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return String(iso) }
}

export const kindLabel = { screening: 'Screening', program: 'Program', live: 'Live event' }

// Where an event is in its life, for badges and sorting.
export function eventState(ev, now = Date.now()) {
  const from = ev.available_from ? new Date(ev.available_from).getTime() : null
  const until = ev.available_until ? new Date(ev.available_until).getTime() : null
  const start = ev.starts_at ? new Date(ev.starts_at).getTime() : null
  if (until && now > until) return { key: 'ended', label: 'Ended', ended: true }
  if (ev.kind === 'live') {
    if (start && now < start) return { key: 'soon', label: 'Live ' + fmtWhen(ev.starts_at), soon: true }
    return { key: 'live', label: 'Live now', live: true }
  }
  if (from && now < from) return { key: 'soon', label: 'Opens ' + fmtWhen(ev.available_from), soon: true }
  return { key: 'open', label: until ? 'Available until ' + fmtWhen(ev.available_until) : 'Available now' }
}

export const regionText = (ev) => {
  const list = (ev.geo_countries || []).join(', ')
  if (ev.geo_mode === 'allow' && list) return 'Available only in: ' + list
  if (ev.geo_mode === 'block' && list) return 'Not available in: ' + list
  return ''
}
