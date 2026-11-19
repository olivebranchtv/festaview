import { useState } from 'react'
import * as api from './adminData.js'

// Edit a showing you booked. Time, screen, Q&A, seats and price lock once the doors have opened.
const toLocalInput = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const dollars = (c) => (c ? (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)) : '')

function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export default function ShowingEdit({ showing: s, screens, festival, taken, onDone, setMsg }) {
  const [f, setF] = useState({
    title: s.title || '', description: s.description || '', poster_url: s.poster_url || '', rating: s.rating || '', screen_id: s.screen_id,
    starts_at: toLocalInput(s.starts_at), lobby: String(s.lobby_minutes), qa: String(s.qa_minutes), seats: s.seats == null ? '' : String(s.seats),
    price: dollars(s.price_cents), preroll_url: s.preroll_url || '', sponsor_name: s.sponsor_name || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const locked = Date.now() >= new Date(s.starts_at).getTime() - s.lobby_minutes * 60000
  const sold = (taken || 0) > 0 && s.price_cents > 0
  const priceCents = f.price === '' ? 0 : Math.round(parseFloat(String(f.price).replace(/[$,]/g, '')) * 100) || 0

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api.updateShowing(s.id, {
        ...f, starts_at: new Date(f.starts_at).toISOString(), lobby: parseInt(f.lobby, 10) || 0, qa: parseInt(f.qa, 10) || 0,
        seats: f.seats === '' ? null : parseInt(f.seats, 10), price_cents: priceCents,
      })
      setMsg(res && res.status === 'pending' ? 'Saved. Because the time changed, it needs Festaview approval again before it shows on the marquee.' : 'Showing updated.')
      onDone()
    } catch (x) { setMsg(x.message, true) }
    setBusy(false)
  }

  return (
    <form className="panel" onSubmit={save}>
      <h3>Edit showing</h3>
      {locked && <p className="note">The doors have opened, so the time, screen, Q&amp;A, seats and price are locked. You can still edit the title, description, poster and sponsor.</p>}
      <Field label="Title shown on the marquee"><input value={f.title} onChange={(e) => set('title')(e.target.value)} required maxLength={160} /></Field>
      <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => set('description')(e.target.value)} /></Field>
      <div className="two">
        <Field label="Poster link"><input value={f.poster_url} onChange={(e) => set('poster_url')(e.target.value)} placeholder="https://..." /></Field>
        <Field label="Rating"><input value={f.rating} onChange={(e) => set('rating')(e.target.value)} /></Field>
      </div>
      <div className="two">
        <Field label="Screen"><select value={f.screen_id} disabled={locked} onChange={(e) => set('screen_id')(e.target.value)}>{screens.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Showtime"><input type="datetime-local" value={f.starts_at} disabled={locked} onChange={(e) => set('starts_at')(e.target.value)} required /></Field>
        <Field label="Doors open (minutes early)"><input value={f.lobby} disabled={locked} onChange={(e) => set('lobby')(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Q&A after the film (minutes)"><input value={f.qa} disabled={locked} onChange={(e) => set('qa')(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Seats (empty = open seating)" hint={taken ? taken + ' taken so far.' : ''}><input value={f.seats} disabled={locked} onChange={(e) => set('seats')(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Ticket price in dollars (empty = free)" hint={sold ? 'Locked: tickets were already bought.' : festival.payments_enabled ? '' : 'Card payments must be turned on first.'}><input value={f.price} disabled={locked || sold} onChange={(e) => set('price')(e.target.value)} inputMode="decimal" /></Field>
      </div>
      <div className="two">
        <Field label="Sponsor message link"><input value={f.preroll_url} onChange={(e) => set('preroll_url')(e.target.value)} placeholder="https://.../sponsor.m3u8 or .mp4" /></Field>
        <Field label="Sponsor name"><input value={f.sponsor_name} onChange={(e) => set('sponsor_name')(e.target.value)} /></Field>
      </div>
      <p className="note small">The films cannot be changed here. To use different films, cancel this showing and book a new one.</p>
      <div className="actions"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button><button className="btn ghost" type="button" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
