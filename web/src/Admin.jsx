import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'

const toLocal = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')
const fromLocal = (v) => (v ? new Date(v).toISOString() : '')
const num = (v) => (v === '' || v == null ? '' : parseInt(v, 10) || '')

const EMPTY_FILM = {
  title: '', synopsis: '', director: '', year: '', runtime_min: '', country: '', language: '', genre: '', rating: '',
  poster_url: '', video_url: '', trailer_url: '', captions_url: '', status: 'draft',
  premiere_at: '', available_from: '', available_until: '',
}
const EMPTY_FEED = { name: '', stream_url: '', poster_url: '', is_live: false, is_replay_loop: true }

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function ImageField({ label, value, onChange, festivalId, onError }) {
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try { onChange(await api.uploadImage(festivalId, file)) } catch (err) { onError(err.message) }
  }
  return (
    <Field label={label} hint="Paste an image URL or upload a file.">
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://..." />
      <input type="file" accept="image/*" onChange={pick} />
      {value && <img className="thumb" src={value} alt="" />}
    </Field>
  )
}

function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [signup, setSignup] = useState(false)
  const [info, setInfo] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo('')
    try {
      if (signup) {
        await api.signUp(email, password)
        setInfo('Account created. Check your email to confirm it if asked, then tell Festaview which festival you run so we can link it.')
      } else {
        await api.signIn(email, password); onDone()
      }
    } catch (x) { setErr(x.message) }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>{signup ? 'Create festival account' : 'Festival login'}</h2>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {err && <p className="error">{err}</p>}
      {info && <p className="ok">{info}</p>}
      <div className="actions">
        <button className="btn" type="submit">{signup ? 'Create account' : 'Sign in'}</button>
        <button className="btn ghost" type="button" onClick={() => { setSignup(!signup); setErr(''); setInfo('') }}>
          {signup ? 'I have an account' : 'Create account'}
        </button>
      </div>
    </form>
  )
}

function FestivalTab({ festival, onSaved, setMsg }) {
  const [f, setF] = useState(festival)
  useEffect(() => setF(festival), [festival])
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const save = async (e) => {
    e.preventDefault()
    try {
      const saved = await api.saveFestival({
        id: f.id, name: f.name, tagline: f.tagline, description: f.description, brand_color: f.brand_color,
        website: f.website, logo_url: f.logo_url, banner_url: f.banner_url, status: f.status, voting_open: !!f.voting_open,
      })
      onSaved(saved); setMsg('Festival saved.')
    } catch (x) { setMsg(x.message, true) }
  }
  return (
    <form className="panel" onSubmit={save}>
      <Field label="Festival name"><input value={f.name || ''} onChange={(e) => set('name')(e.target.value)} required /></Field>
      <Field label="Tagline"><input value={f.tagline || ''} onChange={(e) => set('tagline')(e.target.value)} /></Field>
      <Field label="Description"><textarea rows={4} value={f.description || ''} onChange={(e) => set('description')(e.target.value)} /></Field>
      <Field label="Website"><input value={f.website || ''} onChange={(e) => set('website')(e.target.value)} placeholder="https://" /></Field>
      <Field label="Brand color"><input type="color" value={f.brand_color || '#E6B34A'} onChange={(e) => set('brand_color')(e.target.value)} /></Field>
      <ImageField label="Logo" value={f.logo_url} onChange={set('logo_url')} festivalId={f.id} onError={(m) => setMsg(m, true)} />
      <ImageField label="Banner" value={f.banner_url} onChange={set('banner_url')} festivalId={f.id} onError={(m) => setMsg(m, true)} />
      <label className="check">
        <input type="checkbox" checked={!!f.voting_open} onChange={(e) => set('voting_open')(e.target.checked)} /> Audience Choice voting is open (shows a vote button on each film)
      </label>
      <Field label="Visibility" hint="Draft festivals are hidden from the public site and the Roku app.">
        <select value={f.status} onChange={(e) => set('status')(e.target.value)}>
          <option value="draft">Draft (hidden)</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <button className="btn" type="submit">Save festival</button>
    </form>
  )
}

function FilmsTab({ festival, setMsg }) {
  const [films, setFilms] = useState([])
  const [edit, setEdit] = useState(null)
  const refresh = useCallback(() => api.listFilms(festival.id).then(setFilms).catch((e) => setMsg(e.message, true)), [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const set = (k) => (v) => setEdit((p) => ({ ...p, [k]: v }))
  const save = async (e) => {
    e.preventDefault()
    const row = { ...edit, year: num(edit.year), runtime_min: num(edit.runtime_min) }
    for (const k of ['premiere_at', 'available_from', 'available_until']) row[k] = fromLocal(edit[k])
    try { await api.saveFilm(festival.id, row); setEdit(null); setMsg('Film saved.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const del = async (m) => {
    if (!window.confirm('Delete "' + m.title + '"? This cannot be undone.')) return
    try { await api.deleteFilm(m.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const open = (m) => setEdit(m ? { ...EMPTY_FILM, ...m, premiere_at: toLocal(m.premiere_at), available_from: toLocal(m.available_from), available_until: toLocal(m.available_until) } : { ...EMPTY_FILM })

  if (edit) {
    return (
      <form className="panel" onSubmit={save}>
        <h2>{edit.id ? 'Edit film' : 'Add film'}</h2>
        <Field label="Title"><input value={edit.title} onChange={(e) => set('title')(e.target.value)} required /></Field>
        <Field label="Synopsis"><textarea rows={3} value={edit.synopsis || ''} onChange={(e) => set('synopsis')(e.target.value)} /></Field>
        <div className="two">
          <Field label="Director"><input value={edit.director || ''} onChange={(e) => set('director')(e.target.value)} /></Field>
          <Field label="Genre"><input value={edit.genre || ''} onChange={(e) => set('genre')(e.target.value)} /></Field>
          <Field label="Year"><input value={edit.year ?? ''} onChange={(e) => set('year')(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Runtime (minutes)"><input value={edit.runtime_min ?? ''} onChange={(e) => set('runtime_min')(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Country"><input value={edit.country || ''} onChange={(e) => set('country')(e.target.value)} /></Field>
          <Field label="Language"><input value={edit.language || ''} onChange={(e) => set('language')(e.target.value)} /></Field>
          <Field label="Rating"><input value={edit.rating || ''} onChange={(e) => set('rating')(e.target.value)} placeholder="G, PG, PG-13, R" /></Field>
        </div>
        <ImageField label="Poster (16:9 works best on Roku)" value={edit.poster_url} onChange={set('poster_url')} festivalId={festival.id} onError={(m) => setMsg(m, true)} />
        <Field label="Video URL" hint="Direct link to an HLS (.m3u8) or MP4 file. Roku plays these formats. Recommended host: Bunny Stream (bunny.net). Upload your film there and paste its HLS playlist link here.">
          <input value={edit.video_url || ''} onChange={(e) => set('video_url')(e.target.value)} placeholder="https://.../film.m3u8" />
        </Field>
        <Field label="Trailer URL"><input value={edit.trailer_url || ''} onChange={(e) => set('trailer_url')(e.target.value)} /></Field>
        <Field label="Captions URL (WebVTT or SRT)"><input value={edit.captions_url || ''} onChange={(e) => set('captions_url')(e.target.value)} /></Field>
        <div className="two">
          <Field label="Premiere date"><input type="datetime-local" value={edit.premiere_at} onChange={(e) => set('premiere_at')(e.target.value)} /></Field>
          <Field label="Available from" hint="The film stays hidden from the public until this time."><input type="datetime-local" value={edit.available_from} onChange={(e) => set('available_from')(e.target.value)} /></Field>
          <Field label="Available until" hint="The film is hidden again after this time."><input type="datetime-local" value={edit.available_until} onChange={(e) => set('available_until')(e.target.value)} /></Field>
        </div>
        {edit.id && <FilmmakerShares film={edit} setMsg={setMsg} />}
        {edit.id && <ScreeningPackage film={edit} setMsg={setMsg} />}
        <Field label="Status">
          <select value={edit.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="actions">
          <button className="btn" type="submit">Save film</button>
          <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <div className="panel">
      <div className="actions"><button className="btn" onClick={() => open(null)}>Add film</button></div>
      {films.length === 0 && <p className="note">No films yet. Add your first selection.</p>}
      <ul className="list">
        {films.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.title}</strong>
              <small>{[m.director, m.runtime_min ? m.runtime_min + ' min' : null, m.genre].filter(Boolean).join(' / ')}</small>
            </div>
            <span className={'pill ' + m.status}>{m.status}</span>
            <button className="btn ghost" onClick={() => open(m)}>Edit</button>
            <button className="btn ghost danger" onClick={() => del(m)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LiveTab({ festival, setMsg }) {
  const [feeds, setFeeds] = useState([])
  const [sched, setSched] = useState(null)
  const [edit, setEdit] = useState(null)
  const refresh = useCallback(() => api.listFeeds(festival.id).then(setFeeds).catch((e) => setMsg(e.message, true)), [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])
  const set = (k) => (v) => setEdit((p) => ({ ...p, [k]: v }))
  const save = async (e) => {
    e.preventDefault()
    try { await api.saveFeed(festival.id, edit); setEdit(null); setMsg('Live channel saved.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const del = async (l) => {
    if (!window.confirm('Delete "' + l.name + '"?')) return
    try { await api.deleteFeed(l.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  if (edit) {
    return (
      <form className="panel" onSubmit={save}>
        <h2>{edit.id ? 'Edit live channel' : 'Add live channel'}</h2>
        <Field label="Channel name"><input value={edit.name} onChange={(e) => set('name')(e.target.value)} required /></Field>
        <Field label="Stream URL" hint="HLS (.m3u8) live stream or a looping replay playlist.">
          <input value={edit.stream_url || ''} onChange={(e) => set('stream_url')(e.target.value)} placeholder="https://.../live.m3u8" />
        </Field>
        <ImageField label="Channel artwork" value={edit.poster_url} onChange={set('poster_url')} festivalId={festival.id} onError={(m) => setMsg(m, true)} />
        <label className="check"><input type="checkbox" checked={!!edit.is_live} onChange={(e) => set('is_live')(e.target.checked)} /> Live right now</label>
        <label className="check"><input type="checkbox" checked={!!edit.is_replay_loop} onChange={(e) => set('is_replay_loop')(e.target.checked)} /> Show as a 24/7 replay channel</label>
        <div className="actions">
          <button className="btn" type="submit">Save channel</button>
          <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </form>
    )
  }
  return (
    <div className="panel">
      <div className="actions"><button className="btn" onClick={() => setEdit({ ...EMPTY_FEED })}>Add live channel</button></div>
      {feeds.length === 0 && <p className="note">No live channels yet.</p>}
      <ul className="list">
        {feeds.map((l) => (
          <li key={l.id}>
            <div><strong>{l.name}</strong><small>{l.stream_url || 'No stream URL yet'}</small></div>
            <span className={'pill ' + (l.is_live ? 'live' : 'draft')}>{l.is_live ? 'live' : 'offline'}</span>
            <button className="btn ghost" onClick={() => setSched(sched === l.id ? null : l.id)}>Schedule</button>
            <button className="btn ghost" onClick={() => setEdit({ ...EMPTY_FEED, ...l })}>Edit</button>
            <button className="btn ghost danger" onClick={() => del(l)}>Delete</button>
            {sched === l.id && <div className="sched-wrap"><ScheduleEditor feed={l} setMsg={setMsg} /></div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

const money = (n) => '$' + (n || 0).toFixed(2)

function downloadText(name, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// Private links a venue needs to screen a film in a theater (master file, DCP, subtitles, technical notes).
function ScreeningPackage({ film, setMsg }) {
  const [m, setM] = useState({ master_url: '', dcp_url: '', subtitles_url: '', tech_notes: '' })
  useEffect(() => { api.getMaster(film.id).then((d) => setM({ master_url: '', dcp_url: '', subtitles_url: '', tech_notes: '', ...d })).catch(() => {}) }, [film.id])
  const set = (k) => (e) => setM((p) => ({ ...p, [k]: e.target.value }))
  const save = async () => { try { await api.saveMaster(film.id, m); setMsg('Screening package saved.') } catch (x) { setMsg(x.message, true) } }
  return (
    <div className="subpanel">
      <h3>Theater screening package (private)</h3>
      <p className="note small">Only your festival team sees these. Venues need a cinema-quality master or a finished DCP, not the web stream. Host files on private storage and paste the download links.</p>
      <Field label="Master file link (ProRes or high-bitrate H.264)"><input value={m.master_url || ''} onChange={set('master_url')} placeholder="https://" /></Field>
      <Field label="DCP link (if you have one)"><input value={m.dcp_url || ''} onChange={set('dcp_url')} placeholder="https://" /></Field>
      <Field label="Subtitles link"><input value={m.subtitles_url || ''} onChange={set('subtitles_url')} placeholder="https://" /></Field>
      <Field label="Technical notes (frame rate, audio, aspect ratio)"><textarea rows={2} value={m.tech_notes || ''} onChange={set('tech_notes')} /></Field>
      <button type="button" className="btn ghost" onClick={save}>Save package</button>
    </div>
  )
}

function ScreeningsTab({ festival, setMsg }) {
  const [venues, setVenues] = useState([])
  const [screenings, setScreenings] = useState([])
  const [films, setFilms] = useState([])
  const [logs, setLogs] = useState([])
  const [v, setV] = useState({ name: '', city: '', address: '', capacity: '' })
  const [s, setS] = useState({ venue_id: '', film_id: '', title: '', room: '', starts_at: '', ends_at: '', ticket_url: '' })

  const refresh = useCallback(async () => {
    try {
      const [vn, sc, fl, lg] = await Promise.all([api.listVenues(festival.id), api.listScreenings(festival.id), api.listFilms(festival.id), api.listLogs(festival.id)])
      setVenues(vn); setScreenings(sc); setFilms(fl); setLogs(lg)
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const addVenue = async () => {
    if (!v.name) { setMsg('Enter a venue name.', true); return }
    try { await api.saveVenue(festival.id, { ...v, capacity: num(v.capacity) }); setV({ name: '', city: '', address: '', capacity: '' }); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const addScreening = async () => {
    if (!s.starts_at || !s.ends_at) { setMsg('Choose a start and end time.', true); return }
    if (new Date(s.ends_at) <= new Date(s.starts_at)) { setMsg('The end time must be after the start time.', true); return }
    if (!s.film_id && !s.title) { setMsg('Pick a film or type a title.', true); return }
    try {
      await api.saveScreening(festival.id, { ...s, starts_at: fromLocal(s.starts_at), ends_at: fromLocal(s.ends_at) })
      setS({ venue_id: '', film_id: '', title: '', room: '', starts_at: '', ends_at: '', ticket_url: '' }); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const pickFilm = (id) => {
    const film = films.find((m) => m.id === id)
    setS((p) => ({ ...p, film_id: id, title: p.title || (film ? film.title : '') }))
  }
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const pkg = async (sc) => {
    const film = films.find((m) => m.id === sc.film_id)
    const venue = venues.find((x) => x.id === sc.venue_id)
    let master = {}
    if (film) { try { master = await api.getMaster(film.id) } catch { /* ignore */ } }
    const lines = [
      'SCREENING PACKAGE', festival.name, '',
      'Film: ' + (sc.title || (film && film.title) || ''),
      film && film.director ? 'Director: ' + film.director : '',
      film && film.runtime_min ? 'Runtime: ' + film.runtime_min + ' min' : '',
      film && film.rating ? 'Rating: ' + film.rating : '',
      '', 'Venue: ' + (venue ? venue.name : 'TBA'),
      venue && venue.address ? 'Address: ' + venue.address + (venue.city ? ', ' + venue.city : '') : '',
      sc.room ? 'Room: ' + sc.room : '',
      'Starts: ' + fmt(sc.starts_at), 'Ends: ' + fmt(sc.ends_at), '',
      'Master file: ' + (master.master_url || 'not provided'),
      'DCP: ' + (master.dcp_url || 'not provided'),
      'Subtitles: ' + (master.subtitles_url || 'not provided'),
      master.tech_notes ? 'Technical notes: ' + master.tech_notes : '',
      '', 'Please confirm receipt and run a test playback before doors open.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '')
    downloadText('screening-package-' + (film ? film.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'event') + '.txt', lines.join('\n'))
  }
  const remove = async (id) => { try { await api.deleteScreening(id); refresh() } catch (x) { setMsg(x.message, true) } }
  const removeVenue = async (id) => { try { await api.deleteVenue(id); refresh() } catch (x) { setMsg(x.message, true) } }
  const attendance = (id) => logs.filter((l) => l.screening_id === id).reduce((a, l) => a + Number(l.attendance || 0), 0)

  return (
    <div>
      <div className="panel">
        <h2>Venues</h2>
        <ul className="list">
          {venues.length === 0 && <li><span className="note">No venues yet.</span></li>}
          {venues.map((x) => (
            <li key={x.id}>
              <div><strong>{x.name}</strong><small>{[x.address, x.city, x.capacity ? x.capacity + ' seats' : null].filter(Boolean).join(' | ')}</small></div>
              <button type="button" className="btn ghost danger" onClick={() => removeVenue(x.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="inline-form">
          <input placeholder="Venue name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <input placeholder="City" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
          <input placeholder="Address" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
          <input placeholder="Seats" inputMode="numeric" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
          <button type="button" className="btn ghost" onClick={addVenue}>Add venue</button>
        </div>
      </div>

      <div className="panel">
        <h2>Theater screenings</h2>
        <p className="note small">Showtimes appear on your festival page with a ticket link and a calendar download. Use Theater Mode to run a show from a laptop or media box connected to a projector.</p>
        <ul className="list">
          {screenings.length === 0 && <li><span className="note">No screenings yet.</span></li>}
          {screenings.map((sc) => {
            const venue = venues.find((x) => x.id === sc.venue_id)
            return (
              <li key={sc.id}>
                <div>
                  <strong>{sc.title || 'Untitled'}</strong>
                  <small>{fmt(sc.starts_at)} | {venue ? venue.name : 'Venue TBA'}{sc.room ? ' | ' + sc.room : ''}{attendance(sc.id) ? ' | attendance ' + attendance(sc.id) : ''}</small>
                </div>
                <button type="button" className="btn ghost" onClick={() => pkg(sc)}>Package</button>
                <button type="button" className="btn ghost danger" onClick={() => remove(sc.id)}>Remove</button>
              </li>
            )
          })}
        </ul>
        <div className="two">
          <Field label="Venue">
            <select value={s.venue_id} onChange={(e) => setS({ ...s, venue_id: e.target.value })}>
              <option value="">Choose venue</option>
              {venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Film">
            <select value={s.film_id} onChange={(e) => pickFilm(e.target.value)}>
              <option value="">None (use a title)</option>
              {films.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </Field>
          <Field label="Title shown to the public"><input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field>
          <Field label="Room or screen"><input value={s.room} onChange={(e) => setS({ ...s, room: e.target.value })} /></Field>
          <Field label="Starts"><input type="datetime-local" value={s.starts_at} onChange={(e) => setS({ ...s, starts_at: e.target.value })} /></Field>
          <Field label="Ends"><input type="datetime-local" value={s.ends_at} onChange={(e) => setS({ ...s, ends_at: e.target.value })} /></Field>
          <Field label="Ticket link (optional)"><input value={s.ticket_url} onChange={(e) => setS({ ...s, ticket_url: e.target.value })} placeholder="https://" /></Field>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={addScreening}>Add screening</button>
          <a className="btn ghost" href={'#/theater/' + festival.slug}>Open Theater Mode</a>
        </div>
      </div>
    </div>
  )
}

function downloadCsv(name, rows) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const text = rows.map((r) => r.map(esc).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function FilmmakerShares({ film, setMsg }) {
  const [shares, setShares] = useState([])
  const [row, setRow] = useState({ filmmaker_name: '', filmmaker_email: '', share_pct: '' })
  const refresh = useCallback(() => api.listShares([film.id]).then(setShares).catch((e) => setMsg(e.message, true)), [film.id, setMsg])
  useEffect(() => { refresh() }, [refresh])
  const total = shares.reduce((s, x) => s + Number(x.share_pct || 0), 0)
  const add = async () => {
    const pct = Number(row.share_pct)
    if (!row.filmmaker_name || !(pct >= 0 && pct <= 100)) { setMsg('Enter a name and a share between 0 and 100.', true); return }
    if (total + pct > 100) { setMsg('Shares for one film cannot add up to more than 100%.', true); return }
    try { await api.saveShare({ film_id: film.id, filmmaker_name: row.filmmaker_name, filmmaker_email: row.filmmaker_email, share_pct: pct }); setRow({ filmmaker_name: '', filmmaker_email: '', share_pct: '' }); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const remove = async (id) => { try { await api.deleteShare(id); refresh() } catch (x) { setMsg(x.message, true) } }
  return (
    <div className="subpanel">
      <h3>Filmmaker earnings share</h3>
      <p className="note small">The share of this film's festival earnings that goes to each filmmaker. Total so far: {total}%.</p>
      <ul className="list">
        {shares.map((s) => (
          <li key={s.id}>
            <div><strong>{s.filmmaker_name}</strong><small>{s.filmmaker_email || 'no email'}</small></div>
            <span className="pill">{Number(s.share_pct)}%</span>
            <button type="button" className="btn ghost danger" onClick={() => remove(s.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="inline-form">
        <input placeholder="Filmmaker name" value={row.filmmaker_name} onChange={(e) => setRow({ ...row, filmmaker_name: e.target.value })} />
        <input placeholder="Email (optional)" value={row.filmmaker_email} onChange={(e) => setRow({ ...row, filmmaker_email: e.target.value })} />
        <input placeholder="Share %" inputMode="decimal" value={row.share_pct} onChange={(e) => setRow({ ...row, share_pct: e.target.value })} />
        <button type="button" className="btn ghost" onClick={add}>Add</button>
      </div>
    </div>
  )
}

function ScheduleEditor({ feed, setMsg }) {
  const [items, setItems] = useState([])
  const [films, setFilms] = useState([])
  const [f, setF] = useState({ film_id: '', title: '', starts_at: '', ends_at: '' })
  const refresh = useCallback(() => api.listSchedule(feed.id).then(setItems).catch((e) => setMsg(e.message, true)), [feed.id, setMsg])
  useEffect(() => { refresh(); api.listFilms(feed.festival_id).then(setFilms).catch(() => {}) }, [refresh, feed.festival_id])
  const add = async () => {
    if (!f.starts_at || !f.ends_at) { setMsg('Choose a start and end time.', true); return }
    if (new Date(f.ends_at) <= new Date(f.starts_at)) { setMsg('The end time must be after the start time.', true); return }
    if (!f.film_id && !f.title) { setMsg('Pick a film or type a title.', true); return }
    try {
      await api.saveSchedule({ live_feed_id: feed.id, film_id: f.film_id, title: f.title, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at) })
      setF({ film_id: '', title: '', starts_at: '', ends_at: '' }); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const remove = async (id) => { try { await api.deleteSchedule(id); refresh() } catch (x) { setMsg(x.message, true) } }
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="subpanel">
      <h3>Schedule for {feed.name}</h3>
      <ul className="list">
        {items.length === 0 && <li><span className="note">Nothing scheduled.</span></li>}
        {items.map((s) => {
          const film = films.find((x) => x.id === s.film_id)
          return (
            <li key={s.id}>
              <div><strong>{s.title || (film && film.title) || 'Untitled'}</strong><small>{fmt(s.starts_at)} to {fmt(s.ends_at)}</small></div>
              <button type="button" className="btn ghost danger" onClick={() => remove(s.id)}>Remove</button>
            </li>
          )
        })}
      </ul>
      <div className="two">
        <Field label="Film (optional)">
          <select value={f.film_id} onChange={(e) => setF({ ...f, film_id: e.target.value })}>
            <option value="">None (use a title)</option>
            {films.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
        <Field label="Title (e.g. Director Q&A)"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Starts"><input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
        <Field label="Ends"><input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
      </div>
      <button type="button" className="btn" onClick={add}>Add to schedule</button>
    </div>
  )
}

function Analytics({ festival, setMsg }) {
  const [days, setDays] = useState(30)
  const [cpm, setCpm] = useState(12)
  const [films, setFilms] = useState([])
  const [stats, setStats] = useState([])
  const [votes, setVotes] = useState({})
  const [shares, setShares] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const fl = await api.listFilms(festival.id)
        const [st, vc, sh] = await Promise.all([api.filmStats(festival.id, days), api.voteCounts(festival.id), api.listShares(fl.map((m) => m.id))])
        if (alive) { setFilms(fl); setStats(st); setVotes(vc); setShares(sh) }
      } catch (e) { setMsg(e.message, true) }
    })()
    return () => { alive = false }
  }, [festival.id, days, setMsg])

  const pct = Number(festival.revenue_share_pct ?? 80)
  const rows = films.map((m) => {
    const s = stats.find((x) => x.film_id === m.id) || { views: 0, seconds: 0, impressions: 0 }
    const est = (Number(s.impressions) / 1000) * Number(cpm || 0)
    return { film: m, views: Number(s.views), minutes: Math.round(Number(s.seconds) / 60), impressions: Number(s.impressions), votes: votes[m.id] || 0, est, festShare: (est * pct) / 100 }
  })
  const tot = rows.reduce((a, r) => ({ views: a.views + r.views, minutes: a.minutes + r.minutes, impressions: a.impressions + r.impressions, votes: a.votes + r.votes, est: a.est + r.est, festShare: a.festShare + r.festShare }), { views: 0, minutes: 0, impressions: 0, votes: 0, est: 0, festShare: 0 })
  const payouts = shares.map((s) => {
    const r = rows.find((x) => x.film.id === s.film_id)
    return { film: r ? r.film.title : '', name: s.filmmaker_name, email: s.filmmaker_email || '', pct: Number(s.share_pct), amount: r ? (r.festShare * Number(s.share_pct)) / 100 : 0 }
  })

  const exportCsv = () => {
    downloadCsv('festaview-' + festival.slug + '-report.csv', [
      ['Film', 'Views', 'Minutes watched', 'Ad impressions', 'Votes', 'Est. revenue', 'Festival share'],
      ...rows.map((r) => [r.film.title, r.views, r.minutes, r.impressions, r.votes, r.est.toFixed(2), r.festShare.toFixed(2)]),
      [],
      ['Filmmaker', 'Email', 'Film', 'Share %', 'Est. payout'],
      ...payouts.map((p) => [p.name, p.email, p.film, p.pct, p.amount.toFixed(2)]),
    ])
  }

  return (
    <div className="panel">
      <div className="inline-form">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
        <label className="cpm">Effective CPM ($) <input value={cpm} onChange={(e) => setCpm(e.target.value)} inputMode="decimal" /></label>
        <button className="btn ghost" type="button" onClick={exportCsv}>Download CSV</button>
      </div>
      <p className="note small">
        Views and minutes are counted from web playback. Ad impressions and revenue appear once ads are live on the Roku channel and
        reporting is connected. Until then, revenue here is an estimate from the CPM you enter. Festival share is {pct}%.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Film</th><th>Views</th><th>Minutes</th><th>Ad impr.</th><th>Votes</th><th>Est. revenue</th><th>Festival share</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="note">No films yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.film.id}><td>{r.film.title}</td><td>{r.views}</td><td>{r.minutes}</td><td>{r.impressions}</td><td>{r.votes}</td><td>{money(r.est)}</td><td>{money(r.festShare)}</td></tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td>Total</td><td>{tot.views}</td><td>{tot.minutes}</td><td>{tot.impressions}</td><td>{tot.votes}</td><td>{money(tot.est)}</td><td>{money(tot.festShare)}</td></tr></tfoot>
          )}
        </table>
      </div>
      {payouts.length > 0 && (
        <>
          <h3>Filmmaker payouts (estimate)</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Filmmaker</th><th>Film</th><th>Share</th><th>Est. payout</th></tr></thead>
              <tbody>{payouts.map((p, i) => <tr key={i}><td>{p.name}</td><td>{p.film}</td><td>{p.pct}%</td><td>{money(p.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default function Admin() {
  const [session, setSession] = useState(undefined)
  const [festivals, setFestivals] = useState(null)
  const [current, setCurrent] = useState(null)
  const [tab, setTab] = useState('films')
  const [msg, setMsgState] = useState(null)
  const setMsg = useCallback((text, isError) => setMsgState({ text, isError: !!isError }), [])

  useEffect(() => {
    api.getSession().then(setSession)
    return api.onAuth(setSession)
  }, [])

  useEffect(() => {
    if (!session) { setFestivals(null); return }
    api.myFestivals().then((list) => { setFestivals(list); setCurrent((c) => c || list[0] || null) }).catch((e) => setMsg(e.message, true))
  }, [session, setMsg])

  if (session === undefined) return <p className="note">Loading...</p>
  if (!session) return <Login onDone={() => api.getSession().then(setSession)} />

  return (
    <div>
      <div className="admin-head">
        <h1>Festival admin</h1>
        <div>
          {api.isDemo && <span className="pill draft">Demo mode (saved in this browser only)</span>}
          {!api.isDemo && <button className="btn ghost" onClick={() => api.signOut()}>Sign out</button>}
        </div>
      </div>
      {msg && <p className={msg.isError ? 'error' : 'ok'}>{msg.text}</p>}
      {festivals && festivals.length === 0 && <p className="note">Your account is not linked to a festival yet. Ask Festaview to connect it.</p>}
      {current && (
        <>
          {festivals.length > 1 && (
            <select className="picker" value={current.id} onChange={(e) => setCurrent(festivals.find((f) => f.id === e.target.value))}>
              {festivals.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <nav className="tabs">
            {[['films', 'Films'], ['live', 'Live channels'], ['screenings', 'Theaters'], ['analytics', 'Analytics'], ['festival', 'Festival page']].map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsgState(null) }}>{label}</button>
            ))}
          </nav>
          {tab === 'films' && <FilmsTab festival={current} setMsg={setMsg} />}
          {tab === 'live' && <LiveTab festival={current} setMsg={setMsg} />}
          {tab === 'screenings' && <ScreeningsTab festival={current} setMsg={setMsg} />}
          {tab === 'analytics' && <Analytics festival={current} setMsg={setMsg} />}
          {tab === 'festival' && (
            <FestivalTab
              festival={current}
              setMsg={setMsg}
              onSaved={(saved) => { setCurrent(saved); setFestivals((l) => l.map((f) => (f.id === saved.id ? saved : f))) }}
            />
          )}
        </>
      )}
    </div>
  )
}
