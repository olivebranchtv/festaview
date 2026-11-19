import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'
import SubmissionsTab from './SubmissionsTab.jsx'

const toLocal = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')
const fromLocal = (v) => (v ? new Date(v).toISOString() : '')
const num = (v) => (v === '' || v == null ? '' : parseInt(v, 10) || '')

const EMPTY_FILM = {
  title: '', synopsis: '', director: '', year: '', runtime_min: '', country: '', language: '', genre: '', rating: '',
  poster_url: '', video_url: '', trailer_url: '', captions_url: '', duration_sec: '', access: 'free', status: 'draft',
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
  const [signup, setSignup] = useState(() => /[?&]signup=1/.test(window.location.search))
  const [info, setInfo] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo('')
    try {
      if (signup) {
        await api.signUp(email, password)
        setInfo('Account created. If we asked you to confirm your email, open the message we sent, then come back here and sign in. You will create your festival right after.')
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
        location: f.location, starts_on: f.starts_on, ends_on: f.ends_on, passes_url: f.passes_url,
        auto_channel: !!f.auto_channel, channel_order: f.channel_order || 'listed',
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
      <div className="two">
        <Field label="Location"><input value={f.location || ''} onChange={(e) => set('location')(e.target.value)} placeholder="City, State or Country" /></Field>
        <Field label="Passes or tickets link"><input value={f.passes_url || ''} onChange={(e) => set('passes_url')(e.target.value)} placeholder="https://" /></Field>
        <Field label="Starts"><input type="date" value={f.starts_on || ''} onChange={(e) => set('starts_on')(e.target.value)} /></Field>
        <Field label="Ends"><input type="date" value={f.ends_on || ''} onChange={(e) => set('ends_on')(e.target.value)} /></Field>
      </div>
      <Field label="Brand color"><input type="color" value={f.brand_color || '#E6B34A'} onChange={(e) => set('brand_color')(e.target.value)} /></Field>
      <ImageField label="Logo" value={f.logo_url} onChange={set('logo_url')} festivalId={f.id} onError={(m) => setMsg(m, true)} />
      <ImageField label="Banner" value={f.banner_url} onChange={set('banner_url')} festivalId={f.id} onError={(m) => setMsg(m, true)} />
      <label className="check">
        <input type="checkbox" checked={!!f.voting_open} onChange={(e) => set('voting_open')(e.target.checked)} /> Audience Choice voting is open (shows a vote button on each film)
      </label>
      <div className="subpanel">
        <h3>Automatic festival channel</h3>
        <p className="note small">Plays your published films back to back on a schedule, like a TV channel. Everyone tuned in sees the same film at the same time. It appears in the Festaview TV guide and on your page. Each film needs a video link and a length.</p>
        <label className="check">
          <input type="checkbox" checked={!!f.auto_channel} onChange={(e) => set('auto_channel')(e.target.checked)} /> Run an automatic channel for my festival
        </label>
        <Field label="Order of films">
          <select value={f.channel_order || 'listed'} onChange={(e) => set('channel_order')(e.target.value)}>
            <option value="listed">In the order you added them</option>
            <option value="newest">Newest first</option>
            <option value="shuffle">Shuffled (same order for every viewer)</option>
          </select>
        </Field>
      </div>
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
    const row = { ...edit, year: num(edit.year), runtime_min: num(edit.runtime_min), duration_sec: num(edit.duration_sec) }
    if (!row.duration_sec && row.video_url) { const d = await detectDuration(row.video_url); if (d) row.duration_sec = d }
    if (!row.runtime_min && row.duration_sec) row.runtime_min = Math.round(row.duration_sec / 60)
    for (const k of ['premiere_at', 'available_from', 'available_until']) row[k] = fromLocal(edit[k])
    try { await api.saveFilm(festival.id, row); setEdit(null); setMsg('Film saved.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const del = async (m) => {
    if (!window.confirm('Delete "' + m.title + '"? This cannot be undone.')) return
    try { await api.deleteFilm(m.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const detectAll = async () => {
    let n = 0
    try {
      for (const m of films) {
        if (m.video_url && !m.duration_sec) {
          const d = await detectDuration(m.video_url)
          if (d) { await api.saveFilm(festival.id, { id: m.id, duration_sec: d }); n++ }
        }
      }
      setMsg(n ? 'Detected the length of ' + n + (n === 1 ? ' film.' : ' films.') : 'No missing lengths to detect.')
      refresh()
    } catch (x) { setMsg(x.message, true) }
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
        <Field label="Exact length in seconds" hint="Used to schedule your automatic festival channel. Filled in for you when you save, or press Detect.">
          <input value={edit.duration_sec ?? ''} onChange={(e) => set('duration_sec')(e.target.value)} inputMode="numeric" />
          <button type="button" className="btn ghost small" onClick={async () => { const d = await detectDuration(edit.video_url || ''); if (d) set('duration_sec')(String(d)); else setMsg('Could not read the length. Check the video link.', true) }}>Detect length</button>
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
        <Field label="Who can watch" hint="Ticketed films are locked: the video link is hidden until a viewer has a valid access code (bought or given by you under Access and sales). Ticketed films do not play on the Roku app or in automatic channels.">
          <select value={edit.access || 'free'} onChange={(e) => set('access')(e.target.value)}>
            <option value="free">Everyone (free, supported by ads)</option>
            <option value="ticketed">Ticketed (access code required)</option>
          </select>
        </Field>
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
      <div className="actions">
        <button className="btn" onClick={() => open(null)}>Add film</button>
        <button className="btn ghost" onClick={detectAll}>Detect missing lengths</button>
      </div>
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
        <StreamTest url={edit.stream_url} />
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
      <GoingLiveGuide />
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
          <a className="btn ghost" href={'/theater/' + festival.slug}>Open Theater Mode</a>
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

// Reads an HLS link the same way a viewer's browser would, and says whether it is live, recorded, or broken.
async function testStream(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return { ok: false, message: 'The link answered with an error (' + res.status + '). If this is a live event, the stream may not have started yet.' }
    const text = await res.text()
    if (!text.trim().startsWith('#EXTM3U')) return { ok: false, message: 'This does not look like an HLS playlist. The link should end in .m3u8.' }
    let media = text
    let sizes = []
    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split(/\r?\n/)
      sizes = lines.filter((l) => l.startsWith('#EXT-X-STREAM-INF')).map((l) => (/RESOLUTION=(\d+x\d+)/.exec(l) || [])[1]).filter(Boolean)
      const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'))
      const uri = lines.slice(idx + 1).find((l) => l && !l.startsWith('#'))
      if (uri) {
        const r2 = await fetch(new URL(uri, url).toString(), { cache: 'no-store' })
        if (r2.ok) media = await r2.text()
      }
    }
    const live = !media.includes('#EXT-X-ENDLIST')
    return {
      ok: true,
      live,
      message: (live
        ? 'Working. This stream is live (it has no end marker), so viewers will see the broadcast as it happens.'
        : 'Working. This is recorded video with a fixed length. It suits a replay channel, not a live event.')
        + (sizes.length ? ' Quality levels: ' + sizes.join(', ') + '.' : ' Single quality level.'),
    }
  } catch {
    return { ok: false, message: 'Your browser could not read this link. It may be offline, or the host may not allow websites to play it. Ask your streaming provider about "CORS".' }
  }
}

// Works out a film's exact length in seconds: adds up the segments of an HLS playlist, or reads an MP4's metadata.
async function detectDuration(url) {
  try {
    if (/\.m3u8(\?|$)/i.test(url)) {
      let text = await (await fetch(url)).text()
      if (text.includes('#EXT-X-STREAM-INF')) {
        const lines = text.split(/\r?\n/)
        const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'))
        const uri = lines.slice(idx + 1).find((l) => l && !l.startsWith('#'))
        if (!uri) return 0
        text = await (await fetch(new URL(uri, url).toString())).text()
      }
      if (text.includes('#EXT-X-STREAM-INF') || !text.includes('#EXT-X-ENDLIST')) return 0
      const sum = [...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + parseFloat(m[1]), 0)
      return sum > 0 ? Math.round(sum) : 0
    }
    return await new Promise((resolve) => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : 0)
      v.onerror = () => resolve(0)
      v.src = url
    })
  } catch { return 0 }
}

function StreamTest({ url }) {
  const [r, setR] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); setR(await testStream(url)); setBusy(false) }
  return (
    <div className="streamtest">
      <button type="button" className="btn ghost" onClick={run} disabled={!url || busy}>{busy ? 'Testing...' : 'Test this stream'}</button>
      {r && <p className={r.ok ? 'ok' : 'error'}>{r.message}</p>}
    </div>
  )
}

function GoingLiveGuide() {
  return (
    <details className="guide">
      <summary>How to run a live channel</summary>
      <h3>Two kinds of channel</h3>
      <ul>
        <li><strong>Replay channel:</strong> a playlist of recorded films that plays on a loop. Paste its stream link, tick "Show as a 24/7 replay channel", and you are done.</li>
        <li><strong>Live event:</strong> you broadcast from a camera or a computer to a live streaming service. The service gives you two things: a <em>stream address and key</em> to type into your broadcast software, and a <em>playback link</em> ending in .m3u8 to paste here.</li>
      </ul>
      <h3>Going live, step by step</h3>
      <ol>
        <li>Pick a live streaming service (ask Festaview for current recommendations) and create a live stream there.</li>
        <li>Copy its playback link (.m3u8) into this channel and press <strong>Test this stream</strong>.</li>
        <li>In OBS Studio (free) go to Settings, Stream, and enter the service's address and your stream key. Keep the key private.</li>
        <li>Use the settings below, start a private test broadcast, then check it plays on your festival page.</li>
        <li>When you are ready, press Start Streaming in OBS and tick <strong>Live right now</strong> here. Untick it when you finish.</li>
      </ol>
      <h3>Recommended OBS settings</h3>
      <ul>
        <li>Resolution 1920x1080 (or 1280x720 if your internet upload is weak), 30 frames per second.</li>
        <li>Video bitrate 4500 to 6000 kbps. Your upload speed should be at least double that.</li>
        <li>Keyframe interval: 2 seconds. Audio: AAC, 128 to 160 kbps, 48 kHz.</li>
        <li>Use a wired internet connection and run a full test broadcast the day before.</li>
      </ul>
      <p className="note small">Live video is delayed by roughly 10 to 30 seconds, which is normal for streaming to TVs and browsers.</p>
    </details>
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

const EMPTY_EVENT = {
  kind: 'screening', title: '', description: '', poster_url: '', film_ids: [], live_stream_url: '', preroll_url: '', sponsor_name: '',
  access: 'free', starts_at: '', available_from: '', available_until: '', watch_hours: '', unlock_days: '', capacity: '',
  geo_mode: 'none', geo_countries_text: '', chat_enabled: true, status: 'draft',
}

// Virtual cinema: scheduled online screenings, programs and live events with windows, capacity, region rules and chat.
function VirtualTab({ festival, setMsg }) {
  const [events, setEvents] = useState([])
  const [films, setFilms] = useState([])
  const [counts, setCounts] = useState({})
  const [edit, setEdit] = useState(null)
  const [mod, setMod] = useState(null)
  const [chat, setChat] = useState([])
  const [reservations, setReservations] = useState([])

  const refresh = useCallback(async () => {
    try {
      const [ev, fl] = await Promise.all([api.listEvents(festival.id), api.listFilms(festival.id)])
      setEvents(ev); setFilms(fl)
      setCounts(await api.eventSessionCounts(ev.map((x) => x.id)))
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const set = (k) => (v) => setEdit((p) => ({ ...p, [k]: v }))
  const open = (ev) => setEdit(ev ? {
    ...EMPTY_EVENT, ...ev,
    starts_at: toLocal(ev.starts_at), available_from: toLocal(ev.available_from), available_until: toLocal(ev.available_until),
    watch_hours: ev.watch_hours ?? '', unlock_days: ev.unlock_days ?? '', capacity: ev.capacity ?? '', geo_countries_text: (ev.geo_countries || []).join(', '),
    film_ids: ev.film_ids || [], poster_url: ev.poster_url || '', live_stream_url: ev.live_stream_url || '', preroll_url: ev.preroll_url || '', sponsor_name: ev.sponsor_name || '', description: ev.description || '',
  } : { ...EMPTY_EVENT, film_ids: [] })

  const save = async (e) => {
    e.preventDefault()
    const countries = edit.geo_countries_text.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x))
    if (!edit.title.trim()) { setMsg('Give the event a title.', true); return }
    if (edit.kind !== 'live' && edit.film_ids.length === 0) { setMsg('Add at least one film.', true); return }
    if (edit.kind === 'live' && !edit.live_stream_url.trim()) { setMsg('A live event needs a stream link.', true); return }
    if (edit.geo_mode !== 'none' && countries.length === 0) { setMsg('Enter at least one two-letter country code, for example US, CA.', true); return }
    if (edit.available_from && edit.available_until && new Date(edit.available_until) <= new Date(edit.available_from)) { setMsg('The availability end must be after its start.', true); return }
    const row = {
      kind: edit.kind, title: edit.title.trim(), description: edit.description, poster_url: edit.poster_url,
      film_ids: edit.kind === 'live' ? [] : edit.film_ids, live_stream_url: edit.live_stream_url, preroll_url: edit.preroll_url, sponsor_name: edit.sponsor_name,
      access: edit.access, starts_at: fromLocal(edit.starts_at), available_from: fromLocal(edit.available_from), available_until: fromLocal(edit.available_until),
      watch_hours: num(edit.watch_hours), capacity: num(edit.capacity), geo_mode: edit.geo_mode, geo_countries: countries,
      chat_enabled: edit.chat_enabled, status: edit.status,
    }
    // Only send the unlock window when it is used or the database already knows the column (keeps saving working before the SQL is run).
    if (edit.unlock_days !== '' || (events[0] && 'unlock_days' in events[0])) row.unlock_days = num(edit.unlock_days)
    if (edit.id) row.id = edit.id
    try { await api.saveEvent(festival.id, row); setEdit(null); setMsg('Event saved.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const remove = async (ev) => {
    if (!window.confirm('Delete "' + ev.title + '"? Chat and viewing records for it are deleted too.')) return
    try { await api.deleteEvent(ev.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const openMod = async (ev) => {
    setMod(ev)
    try { setChat(await api.listChatAdmin(ev.id)); setReservations(await api.listReservations(ev.id)) } catch (x) { setMsg(x.message, true) }
  }
  const moderate = async (m, patch) => {
    try { await api.moderateChat(m.id, patch); setChat(await api.listChatAdmin(mod.id)) } catch (x) { setMsg(x.message, true) }
  }
  const move = (i, d) => setEdit((p) => { const a = p.film_ids.slice(); const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, film_ids: a } })
  const title = (id) => { const f = films.find((x) => x.id === id); return f ? f.title : '(removed film)' }
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

  if (mod) {
    const questions = chat.filter((m) => m.kind === 'question')
    return (
      <div>
        <div className="panel">
          <div className="actions"><button className="btn ghost" onClick={() => setMod(null)}>Back to events</button></div>
          <h2>{mod.title}</h2>
          <div className="kpis">
            <div className="kpi"><span>Viewers who pressed play</span><strong>{counts[mod.id] || 0}</strong><small>{mod.capacity ? 'of ' + mod.capacity + ' places' : 'no limit set'}</small></div>
            <div className="kpi"><span>Email reservations</span><strong>{reservations.length}</strong><small>people waiting to be told</small></div>
            <div className="kpi"><span>Questions</span><strong>{questions.length}</strong><small>{questions.filter((m) => !m.answered).length} unanswered</small></div>
          </div>
          {reservations.length > 0 && <button className="btn ghost" onClick={() => downloadCsv('reservations-' + mod.id.slice(0, 8) + '.csv', [['Email', 'Reserved'], ...reservations.map((r) => [r.email, r.created_at])])}>Download reservation emails</button>}
        </div>
        <div className="panel">
          <h2>Chat and questions</h2>
          {api.isDemo && <p className="note">Moderation needs a connected database.</p>}
          {chat.length === 0 && !api.isDemo && <p className="note">No messages yet.</p>}
          <ul className="list">
            {chat.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.name}</strong> {m.kind === 'question' && <span className="pill published">question</span>} {m.answered && <span className="pill">answered</span>} {m.hidden && <span className="pill draft">hidden</span>}
                  <small className="wrapnote">{m.body}</small>
                </div>
                {m.kind === 'question' && <button type="button" className="btn ghost" onClick={() => moderate(m, { answered: !m.answered })}>{m.answered ? 'Reopen' : 'Mark answered'}</button>}
                <button type="button" className="btn ghost danger" onClick={() => moderate(m, { hidden: !m.hidden })}>{m.hidden ? 'Show' : 'Hide'}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (edit) {
    const picked = edit.film_ids.map((id) => films.find((f) => f.id === id)).filter(Boolean)
    const exposed = edit.access === 'ticketed' ? picked.filter((f) => f.access !== 'ticketed' && f.status === 'published') : []
    return (
      <form className="panel" onSubmit={save}>
        <h2>{edit.id ? 'Edit event' : 'New virtual event'}</h2>
        <div className="two">
          <Field label="Type">
            <select value={edit.kind} onChange={(e) => set('kind')(e.target.value)}>
              <option value="screening">Screening (one film)</option>
              <option value="program">Program (several films, one unlock)</option>
              <option value="live">Live event (stream with chat and Q&A)</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={edit.status} onChange={(e) => set('status')(e.target.value)}>
              <option value="draft">Draft (hidden)</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <Field label="Title"><input value={edit.title} onChange={(e) => set('title')(e.target.value)} required /></Field>
        <Field label="Description"><textarea rows={3} value={edit.description} onChange={(e) => set('description')(e.target.value)} /></Field>
        <ImageField label="Poster" value={edit.poster_url} onChange={set('poster_url')} festivalId={festival.id} onError={(m) => setMsg(m, true)} />

        {edit.kind !== 'live' && (
          <div className="subpanel">
            <h3>{edit.kind === 'program' ? 'Films in this program (in order)' : 'Film'}</h3>
            <ul className="list">
              {edit.film_ids.length === 0 && <li><span className="note">No film chosen yet.</span></li>}
              {edit.film_ids.map((id, i) => (
                <li key={id}>
                  <div><strong>{title(id)}</strong></div>
                  {edit.kind === 'program' && <><button type="button" className="btn ghost small" onClick={() => move(i, -1)}>Up</button><button type="button" className="btn ghost small" onClick={() => move(i, 1)}>Down</button></>}
                  <button type="button" className="btn ghost small danger" onClick={() => set('film_ids')(edit.film_ids.filter((x) => x !== id))}>Remove</button>
                </li>
              ))}
            </ul>
            <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; if (edit.kind === 'screening') set('film_ids')([v]); else if (!edit.film_ids.includes(v)) set('film_ids')([...edit.film_ids, v]) }}>
              <option value="">{edit.kind === 'program' ? 'Add a film' : 'Choose the film'}</option>
              {films.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
            {exposed.length > 0 && (
              <p className="error small">Warning: {exposed.map((f) => f.title).join(', ')} {exposed.length === 1 ? 'is' : 'are'} also free and public on your festival page, so this ticket does not protect {exposed.length === 1 ? 'it' : 'them'}. Set the film to Ticketed or Draft under Films.</p>
            )}
          </div>
        )}

        {edit.kind === 'live' && (
          <Field label="Live stream link (HLS .m3u8)" hint="Your live streaming service gives you this. See Live channels, How to run a live channel.">
            <input value={edit.live_stream_url} onChange={(e) => set('live_stream_url')(e.target.value)} placeholder="https://.../live.m3u8" />
          </Field>
        )}
        {edit.kind === 'live' && <StreamTest url={edit.live_stream_url} />}

        <div className="two">
          <Field label="Sponsor message (optional)" hint="A short video that plays before the show, with your sponsor named above it.">
            <input value={edit.preroll_url} onChange={(e) => set('preroll_url')(e.target.value)} placeholder="https://.../sponsor.m3u8 or .mp4" />
          </Field>
          <Field label="Sponsor name"><input value={edit.sponsor_name} onChange={(e) => set('sponsor_name')(e.target.value)} /></Field>
        </div>

        <div className="subpanel">
          <h3>When and who</h3>
          <div className="two">
            <Field label="Who can watch">
              <select value={edit.access} onChange={(e) => set('access')(e.target.value)}>
                <option value="free">Everyone (free)</option>
                <option value="ticketed">Ticket or access code holders</option>
              </select>
            </Field>
            {edit.kind === 'live' && <Field label="Live event starts"><input type="datetime-local" value={edit.starts_at} onChange={(e) => set('starts_at')(e.target.value)} /></Field>}
            <Field label="Available from" hint="The first moment someone can press play. Before this, viewers can only leave their email."><input type="datetime-local" value={edit.available_from} onChange={(e) => set('available_from')(e.target.value)} /></Field>
            <Field label="Available until"><input type="datetime-local" value={edit.available_until} onChange={(e) => set('available_until')(e.target.value)} /></Field>
            {edit.kind !== 'live' && <Field label="Watch window: hours to finish after pressing play" hint="For example 48. Viewers who pressed play in time can finish even after the availability end. Leave empty for no limit."><input value={edit.watch_hours} onChange={(e) => set('watch_hours')(e.target.value)} inputMode="numeric" /></Field>}
            {edit.access === 'ticketed' && <Field label="Unlock window: days to start after getting a ticket" hint="For example 7. A ticket not started in time stops working. Leave empty for no limit."><input value={edit.unlock_days} onChange={(e) => set('unlock_days')(e.target.value)} inputMode="numeric" /></Field>}
            <Field label="Capacity (most viewers)" hint="Leave empty for no limit."><input value={edit.capacity} onChange={(e) => set('capacity')(e.target.value)} inputMode="numeric" /></Field>
          </div>
        </div>

        <div className="subpanel">
          <h3>Region</h3>
          <p className="note small">Region rules are checked on Festaview's server from the viewer's location. Press and industry codes (Access and sales tab) can skip them. A VPN can get around location checks.</p>
          <div className="two">
            <Field label="Rule">
              <select value={edit.geo_mode} onChange={(e) => set('geo_mode')(e.target.value)}>
                <option value="none">Available everywhere</option>
                <option value="allow">Only in these countries</option>
                <option value="block">Everywhere except these countries</option>
              </select>
            </Field>
            {edit.geo_mode !== 'none' && <Field label="Country codes" hint="Two letters each, separated by commas, for example US, CA, GB."><input value={edit.geo_countries_text} onChange={(e) => set('geo_countries_text')(e.target.value)} /></Field>}
          </div>
        </div>

        <label className="check"><input type="checkbox" checked={edit.chat_enabled} onChange={(e) => set('chat_enabled')(e.target.checked)} /> Live chat and audience questions</label>
        <div className="actions">
          <button className="btn" type="submit">Save event</button>
          <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <div className="panel">
      <p className="note">Virtual cinema: online screenings, programs and live events with watch windows, capacity limits, region rules, sponsor messages, chat and Q&A. Real copy protection (DRM and forensic watermarking) is not included: see the notes in docs/virtual-cinema.md.</p>
      <div className="actions"><button className="btn" onClick={() => open(null)}>New virtual event</button></div>
      <ul className="list">
        {events.length === 0 && <li><span className="note">No virtual events yet.</span></li>}
        {events.map((ev) => (
          <li key={ev.id}>
            <div>
              <strong>{ev.title}</strong>
              <small>{{ screening: 'Screening', program: 'Program', live: 'Live event' }[ev.kind]} | {ev.access === 'ticketed' ? 'Ticketed' : 'Free'}{ev.available_from ? ' | from ' + when(ev.available_from) : ''}{ev.available_until ? ' until ' + when(ev.available_until) : ''} | {counts[ev.id] || 0} watching{ev.capacity ? ' of ' + ev.capacity : ''}</small>
            </div>
            <span className={'pill ' + ev.status}>{ev.status}</span>
            <a className="btn ghost" href={'/virtual/' + ev.id}>View</a>
            <button className="btn ghost" onClick={() => openMod(ev)}>Moderate</button>
            <button className="btn ghost" onClick={() => open(ev)}>Edit</button>
            <button className="btn ghost danger" onClick={() => remove(ev)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Passes, tickets, access codes and sales for one festival.
function AccessTab({ festival, setMsg }) {
  const [products, setProducts] = useState([])
  const [films, setFilms] = useState([])
  const [ents, setEnts] = useState([])
  const [p, setP] = useState({ name: '', description: '', price: '', target: '' })
  const [c, setC] = useState({ count: '5', target: '', note: '', expires: '', overrides: false })
  const [fresh, setFresh] = useState([])
  const [events, setEvents] = useState([])

  const refresh = useCallback(async () => {
    try {
      const [pr, fl, en] = await Promise.all([api.listProducts(festival.id), api.listFilms(festival.id), api.listEntitlements(festival.id)])
      setProducts(pr); setFilms(fl); setEnts(en)
      api.listEvents(festival.id).then(setEvents).catch(() => {})
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const filmName = (id) => { const f = films.find((x) => x.id === id); return f ? f.title : 'All ticketed films' }
  const scopeName = (x) => (x.event_id ? 'Event: ' + ((events.find((v) => v.id === x.event_id) || {}).title || '(removed)') : x.film_id ? filmName(x.film_id) : 'All ticketed films')
  const parseTarget = (t) => (t.startsWith('f:') ? { film_id: t.slice(2), event_id: '' } : t.startsWith('e:') ? { film_id: '', event_id: t.slice(2) } : { film_id: '', event_id: '' })
  const money2 = (cents) => '$' + (Number(cents || 0) / 100).toFixed(2)

  const addProduct = async () => {
    const price = parseFloat(p.price)
    if (!p.name || !(price >= 0)) { setMsg('Enter a name and a price (0 or more).', true); return }
    try {
      await api.saveProduct(festival.id, { name: p.name, description: p.description, price_cents: Math.round(price * 100), ...parseTarget(p.target), currency: 'usd' })
      setP({ name: '', description: '', price: '', target: '' }); setMsg('Added.'); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const toggle = async (x) => { try { await api.setProductActive(x.id, !x.active); refresh() } catch (e) { setMsg(e.message, true) } }
  const removeProduct = async (x) => {
    if (!window.confirm('Delete "' + x.name + '"? Codes already sold keep working.')) return
    try { await api.deleteProduct(x.id); refresh() } catch (e) { setMsg(e.message, true) }
  }
  const makeCodes = async () => {
    const n = parseInt(c.count, 10)
    if (!(n >= 1 && n <= 200)) { setMsg('Choose between 1 and 200 codes.', true); return }
    try {
      const t = parseTarget(c.target)
      const codes = await api.createCompCodes(festival.id, n, t.film_id, c.note, c.expires ? fromLocal(c.expires) : '', t.event_id, c.overrides)
      setFresh(codes); setMsg(codes.length + ' code(s) created. Copy them now or find them in the list below.'); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const revoke = async (x) => {
    if (!window.confirm('Revoke code ' + x.code + '? It will stop working.')) return
    try { await api.revokeEntitlement(x.id); refresh() } catch (e) { setMsg(e.message, true) }
  }

  const paid = ents.filter((e) => e.source === 'stripe' && e.status === 'active')
  const gross = paid.reduce((a, e) => a + Number(e.amount_cents || 0), 0)
  const fees = paid.reduce((a, e) => a + Number(e.fee_cents || 0), 0)
  const ticketedCount = films.filter((f) => f.access === 'ticketed').length

  return (
    <div>
      <div className="panel">
        <h2>Card payments</h2>
        <p className="note">
          {festival.payments_enabled
            ? 'Card payments are ON for your festival. Festaview fee on paid sales: ' + Number(festival.ticket_fee_pct || 0) + '%.'
            : 'Card payments are OFF. Festaview switches them on once your payout details are set up. Until then you can sell through your own ticketing link (Festival page tab) and give out access codes below.'}
        </p>
        <p className="note small">{ticketedCount} of your films are set to Ticketed. Set this on each film under the Films tab.</p>
      </div>

      <div className="panel">
        <h2>Passes and tickets</h2>
        <ul className="list">
          {products.length === 0 && <li><span className="note">Nothing for sale yet.</span></li>}
          {products.map((x) => (
            <li key={x.id}>
              <div><strong>{x.name}</strong><small>{money2(x.price_cents)} | {scopeName(x)}{x.description ? ' | ' + x.description : ''}</small></div>
              <span className={'pill ' + (x.active ? 'published' : 'draft')}>{x.active ? 'on sale' : 'hidden'}</span>
              <button type="button" className="btn ghost" onClick={() => toggle(x)}>{x.active ? 'Hide' : 'Show'}</button>
              <button type="button" className="btn ghost danger" onClick={() => removeProduct(x)}>Delete</button>
            </li>
          ))}
        </ul>
        <div className="two">
          <Field label="Name (e.g. Festival Pass)"><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Price in dollars"><input value={p.price} inputMode="decimal" onChange={(e) => setP({ ...p, price: e.target.value })} /></Field>
          <Field label="Covers">
            <select value={p.target} onChange={(e) => setP({ ...p, target: e.target.value })}>
              <option value="">All ticketed films (a pass)</option>
              {films.filter((f) => f.access === 'ticketed').map((f) => <option key={f.id} value={'f:' + f.id}>{f.title} (one film)</option>)}
              {events.map((v) => <option key={v.id} value={'e:' + v.id}>{v.title} (virtual event)</option>)}
            </select>
          </Field>
          <Field label="Short description"><input value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
        </div>
        <button type="button" className="btn" onClick={addProduct}>Add</button>
      </div>

      <div className="panel">
        <h2>Free access codes</h2>
        <p className="note small">For press, jurors, guests and giveaways. Viewers enter the code on your festival page or on a locked film.</p>
        <div className="two">
          <Field label="How many codes"><input value={c.count} inputMode="numeric" onChange={(e) => setC({ ...c, count: e.target.value })} /></Field>
          <Field label="Works for">
            <select value={c.target} onChange={(e) => setC({ ...c, target: e.target.value })}>
              <option value="">All ticketed films</option>
              {films.filter((f) => f.access === 'ticketed').map((f) => <option key={f.id} value={'f:' + f.id}>{f.title}</option>)}
              {events.map((v) => <option key={v.id} value={'e:' + v.id}>{v.title} (virtual event)</option>)}
            </select>
          </Field>
          <label className="check"><input type="checkbox" checked={c.overrides} onChange={(e) => setC({ ...c, overrides: e.target.checked })} /> Press or industry code (ignores region limits)</label>
          <Field label="Note (who is it for)"><input value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></Field>
          <Field label="Expires (optional)"><input type="datetime-local" value={c.expires} onChange={(e) => setC({ ...c, expires: e.target.value })} /></Field>
        </div>
        <button type="button" className="btn" onClick={makeCodes}>Create codes</button>
        {fresh.length > 0 && (
          <div className="subpanel">
            <h3>New codes</h3>
            <pre className="codes">{fresh.join('\n')}</pre>
            <button type="button" className="btn ghost" onClick={() => { try { navigator.clipboard.writeText(fresh.join('\n')) } catch { /* ignore */ } }}>Copy all</button>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Sales and access</h2>
        <div className="kpis">
          <div className="kpi"><span>Paid sales</span><strong>{paid.length}</strong><small>card purchases</small></div>
          <div className="kpi"><span>Gross</span><strong>{money2(gross)}</strong><small>before fees</small></div>
          <div className="kpi"><span>Festaview fee</span><strong>{money2(fees)}</strong><small>on paid sales</small></div>
          <div className="kpi"><span>Net to festival</span><strong>{money2(gross - fees)}</strong><small>paid out by Festaview</small></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Type</th><th>For</th><th>Who</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {ents.length === 0 && <tr><td colSpan={7} className="note">No codes or sales yet.</td></tr>}
              {ents.map((e) => (
                <tr key={e.id}>
                  <td>{e.code}</td><td>{e.source === 'stripe' ? 'Purchase' : 'Free code'}</td><td>{scopeName(e)}</td>
                  <td>{e.email || e.note || ''}</td><td>{money2(e.amount_cents)}</td>
                  <td><span className={'pill ' + (e.status === 'active' ? 'published' : 'draft')}>{e.status}</span></td>
                  <td>{e.status === 'active' && <button type="button" className="btn ghost danger" onClick={() => revoke(e)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note small">Payouts to festivals are handled by Festaview outside this screen for now. Refunds: revoke the code here, then refund the buyer from the payment dashboard.</p>
      </div>
    </div>
  )
}

// First step for a new festival director: name the festival and it is created and linked to the account automatically.
function CreateFestival({ first, onCancel, onCreated, setMsg }) {
  const [f, setF] = useState({ name: '', tagline: '', location: '', website: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    let website = f.website.trim()
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website
    setBusy(true)
    try {
      const res = await api.createMyFestival({ ...f, website })
      onCreated(res)
    } catch (x) { setMsg(x.message, true) }
    setBusy(false)
  }
  return (
    <form className="panel narrow wide-form" onSubmit={submit}>
      <h2>{first ? 'Create your festival' : 'Create another festival'}</h2>
      <p className="note">{first ? 'Welcome. ' : ''}Tell us the basics. Your festival is created right away and stays private (a draft) until you publish it. You can change everything later.</p>
      <Field label="Festival name"><input value={f.name} onChange={set('name')} required minLength={2} maxLength={120} autoFocus /></Field>
      <Field label="Tagline (optional)"><input value={f.tagline} onChange={set('tagline')} maxLength={160} placeholder="One line that describes your festival" /></Field>
      <div className="two">
        <Field label="Location (optional)"><input value={f.location} onChange={set('location')} placeholder="City, State or Country" /></Field>
        <Field label="Website (optional)"><input value={f.website} onChange={set('website')} placeholder="https://" /></Field>
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create my festival'}</button>
        {!first && <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

// Shown while a festival is still a draft: what is left to do before it can go public.
function GettingStarted({ festival, goTab }) {
  const [filmCount, setFilmCount] = useState(null)
  useEffect(() => { api.listFilms(festival.id).then((l) => setFilmCount(l.length)).catch(() => setFilmCount(0)) }, [festival.id])
  const steps = [
    [!!(festival.logo_url || festival.banner_url), 'Add a logo or banner and your festival details', 'festival'],
    [(filmCount || 0) > 0, 'Add your first film', 'films'],
    [festival.status === 'published', 'Publish your festival (Festival page, Visibility)', 'festival'],
  ]
  return (
    <div className="panel getting-started">
      <h2>Getting started</h2>
      <p className="note">Your festival is a private draft. Visitors cannot see it until you publish it.</p>
      <ul className="steps">
        {steps.map(([done, text, tab]) => (
          <li key={text} className={done ? 'done' : ''}>
            <span className="tick" aria-hidden="true">{done ? 'Done' : 'To do'}</span>
            <span>{text}</span>
            {!done && <button type="button" className="btn ghost small" onClick={() => goTab(tab)}>Go</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}

const EMPTY_SHOWING = {
  kind: 'film', title: '', description: '', poster_url: '', film_ids: [], live_stream_url: '', live_runtime: '', preroll_url: '', sponsor_name: '',
  rating: '', screen_id: '', starts_at: '', lobby: '10', qa: '0', seats: '', price: '',
}

// Book a showing in the Festaview virtual theater: pick a title, a screen and a start time.
function CinemaTab({ festival, setMsg }) {
  const [screens, setScreens] = useState([])
  const [films, setFilms] = useState([])
  const [showings, setShowings] = useState([])
  const [taken, setTaken] = useState({})
  const [f, setF] = useState(EMPTY_SHOWING)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [sc, fl, sh] = await Promise.all([api.listCinemaScreens(), api.listFilms(festival.id), api.listMyShowings(festival.id)])
      setScreens(sc); setFilms(fl); setShowings(sh)
      setTaken(await api.showingSeatCounts(sh.map((x) => x.id)))
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const eligible = films.filter((m) => m.video_url && ((Number(m.duration_sec) || 0) > 0 || (Number(m.runtime_min) || 0) > 0))
  const secsOf = (m) => Number(m.duration_sec) || (Number(m.runtime_min) || 0) * 60
  const runtimeMin = f.kind === 'live' ? Number(f.live_runtime) || 0 : Math.ceil(f.film_ids.reduce((a, id) => { const m = films.find((x) => x.id === id); return a + (m ? secsOf(m) : 0) }, 0) / 60)
  const priceCents = f.price === '' ? 0 : Math.round(parseFloat(String(f.price).replace(/[$,]/g, '')) * 100) || 0
  const startMs = f.starts_at ? new Date(f.starts_at).getTime() : 0
  const endsAt = startMs && runtimeMin ? new Date(startMs + (runtimeMin + (parseInt(f.qa, 10) || 0)) * 60000) : null
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()
  const local = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  const move = (i, d) => setF((p) => { const a = p.film_ids.slice(); const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, film_ids: a } })
  const addFilm = (id) => {
    if (!id) return
    const m = films.find((x) => x.id === id)
    setF((p) => {
      if (p.kind === 'film') return { ...p, film_ids: [id], title: p.title || m.title, poster_url: p.poster_url || m.poster_url || '', description: p.description || m.synopsis || '', rating: p.rating || m.rating || '' }
      return p.film_ids.includes(id) ? p : { ...p, film_ids: [...p.film_ids, id] }
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!f.title.trim()) { setMsg('Give the showing a title.', true); return }
    if (!f.screen_id) { setMsg('Choose a screen.', true); return }
    if (!f.starts_at) { setMsg('Choose a start time.', true); return }
    if (f.kind !== 'live' && f.film_ids.length === 0) { setMsg('Choose at least one film.', true); return }
    if (f.kind === 'live' && (!f.live_stream_url.trim() || !(runtimeMin > 0))) { setMsg('A live showing needs a stream link and how long it runs.', true); return }
    if (f.price !== '' && priceCents !== 0 && (priceCents < 50 || priceCents > 100000)) { setMsg('A ticket costs between $0.50 and $1,000, or leave it empty for free.', true); return }
    if (priceCents > 0 && !festival.payments_enabled) { setMsg('Card payments are not turned on for your festival yet, so tickets must be free. Ask Festaview to enable payments.', true); return }
    setBusy(true)
    try {
      const res = await api.bookShowing({
        festival_id: festival.id, screen_id: f.screen_id, kind: f.kind, title: f.title.trim(), description: f.description, poster_url: f.poster_url,
        film_ids: f.kind === 'live' ? [] : f.film_ids, live_stream_url: f.live_stream_url, preroll_url: f.preroll_url, sponsor_name: f.sponsor_name, rating: f.rating,
        starts_at: new Date(f.starts_at).toISOString(), lobby: parseInt(f.lobby, 10) || 0, qa: parseInt(f.qa, 10) || 0, seats: f.seats === '' ? null : parseInt(f.seats, 10),
        live_runtime: f.kind === 'live' ? runtimeMin : null, runtime_min: runtimeMin, price_cents: priceCents,
      })
      setMsg(res && res.status === 'pending' ? 'Showing submitted. It will appear after Festaview approves it.' : 'Showing booked. It is on the marquee.')
      setF({ ...EMPTY_SHOWING, film_ids: [] })
      refresh()
    } catch (x) { setMsg(x.message, true) }
    setBusy(false)
  }
  const cancel = async (s) => {
    if (!window.confirm('Cancel "' + s.title + '"? Viewers with a seat will no longer be able to watch.')) return
    try { await api.cancelShowing(s.id); setMsg('Showing cancelled.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const title = (id) => { const m = films.find((x) => x.id === id); return m ? m.title : '(removed film)' }

  return (
    <div>
      <div className="panel">
        <h2>Book a showing in the virtual theater</h2>
        <p className="note">Pick a title, a screen and a start time. Everyone watches together, and viewers who arrive late join at the live point. Times you enter are in your own time zone{tz ? ' (' + tz + ')' : ''}. Viewers see their own. Your festival must be published, and showings may wait for Festaview's approval before they appear.</p>
        <form onSubmit={submit}>
          <div className="two">
            <Field label="Type">
              <select value={f.kind} onChange={(e) => setF({ ...EMPTY_SHOWING, kind: e.target.value, film_ids: [], screen_id: f.screen_id, starts_at: f.starts_at })}>
                <option value="film">One film</option>
                <option value="program">Program (several films back to back)</option>
                <option value="live">Live event</option>
              </select>
            </Field>
            <Field label="Screen">
              <select value={f.screen_id} onChange={(e) => set('screen_id')(e.target.value)} required>
                <option value="">Choose a screen</option>
                {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          {f.kind !== 'live' && (
            <div className="subpanel">
              <h3>{f.kind === 'program' ? 'Films in this program (in order)' : 'Film'}</h3>
              <ul className="list">
                {f.film_ids.length === 0 && <li><span className="note">No film chosen yet.</span></li>}
                {f.film_ids.map((id, i) => (
                  <li key={id}>
                    <div><strong>{title(id)}</strong></div>
                    {f.kind === 'program' && <><button type="button" className="btn ghost small" onClick={() => move(i, -1)}>Up</button><button type="button" className="btn ghost small" onClick={() => move(i, 1)}>Down</button></>}
                    <button type="button" className="btn ghost small danger" onClick={() => set('film_ids')(f.film_ids.filter((x) => x !== id))}>Remove</button>
                  </li>
                ))}
              </ul>
              <select value="" onChange={(e) => addFilm(e.target.value)}>
                <option value="">{f.kind === 'program' ? 'Add a film' : 'Choose the film'}</option>
                {eligible.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              {eligible.length === 0 && <p className="note small">Only films with a video link and a length can be booked. Add them under Films first.</p>}
            </div>
          )}

          {f.kind === 'live' && (
            <div className="two">
              <Field label="Live stream link (HLS .m3u8)"><input value={f.live_stream_url} onChange={(e) => set('live_stream_url')(e.target.value)} placeholder="https://.../live.m3u8" /></Field>
              <Field label="How long does it run (minutes)"><input value={f.live_runtime} onChange={(e) => set('live_runtime')(e.target.value)} inputMode="numeric" /></Field>
            </div>
          )}

          <Field label="Title shown on the marquee"><input value={f.title} onChange={(e) => set('title')(e.target.value)} required maxLength={160} /></Field>
          <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => set('description')(e.target.value)} /></Field>
          <div className="two">
            <Field label="Rating (optional)"><input value={f.rating} onChange={(e) => set('rating')(e.target.value)} placeholder="G, PG, PG-13, R" /></Field>
            <Field label="Showtime" hint={'The film starts at this time for everyone' + (tz ? ' (your zone: ' + tz + ')' : '') + '.'}><input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at')(e.target.value)} required /></Field>
            <Field label="Doors open (minutes early)"><input value={f.lobby} onChange={(e) => set('lobby')(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Q&A after the film (minutes)"><input value={f.qa} onChange={(e) => set('qa')(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Seats (leave empty for open seating)"><input value={f.seats} onChange={(e) => set('seats')(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Ticket price in dollars (empty = free)" hint={festival.payments_enabled ? 'Buyers pay by card. Festaview keeps its box office cut of ' + Number(festival.ticket_fee_pct || 0) + '% of each ticket (card processing is charged separately by Stripe).' : 'Card payments must be turned on for your festival first.'}><input value={f.price} onChange={(e) => set('price')(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
          </div>
          <ImageField label="Poster" value={f.poster_url} onChange={set('poster_url')} festivalId={festival.id} onError={(m) => setMsg(m, true)} />
          <div className="two">
            <Field label="Sponsor message before the film (optional)" hint="Plays in the lobby while people find their seats."><input value={f.preroll_url} onChange={(e) => set('preroll_url')(e.target.value)} placeholder="https://.../sponsor.m3u8 or .mp4" /></Field>
            <Field label="Sponsor name"><input value={f.sponsor_name} onChange={(e) => set('sponsor_name')(e.target.value)} /></Field>
          </div>
          {runtimeMin > 0 && <p className="note">Runtime {runtimeMin} minutes{endsAt ? '. The screen is busy until about ' + endsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) + ' (including doors-open time and a short buffer).' : '.'}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Booking...' : 'Book this showing'}</button>
        </form>
      </div>

      <div className="panel">
        <h2>Your showings</h2>
        <ul className="list">
          {showings.length === 0 && <li><span className="note">No showings yet.</span></li>}
          {showings.map((s) => {
            const sc = screens.find((x) => x.id === s.screen_id)
            return (
              <li key={s.id}>
                <div>
                  <strong>{s.title}</strong>
                  <small>{sc ? sc.name : 'Screen'} | {local(s.starts_at)} | {s.runtime_min} min | {(taken[s.id] || 0)}{s.seats ? ' of ' + s.seats : ''} seats taken | {s.price_cents > 0 ? '$' + (s.price_cents / 100).toFixed(2) + ' ticket' : 'Free'}</small>
                </div>
                <span className={'pill ' + (s.status === 'scheduled' ? 'published' : s.status === 'pending' ? 'draft' : 'draft')}>{s.status === 'pending' ? 'awaiting approval' : s.status}</span>
                {s.status === 'scheduled' && <a className="btn ghost" href={'/cinema/' + s.id}>View</a>}
                {s.status !== 'cancelled' && <button type="button" className="btn ghost danger" onClick={() => cancel(s)}>Cancel</button>}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default function Admin() {
  const [session, setSession] = useState(undefined)
  const [festivals, setFestivals] = useState(null)
  const [current, setCurrent] = useState(null)
  const [tab, setTab] = useState('films')
  const [creating, setCreating] = useState(false)
  const [msg, setMsgState] = useState(null)
  const setMsg = useCallback((text, isError) => setMsgState({ text, isError: !!isError }), [])
  // Messages float on screen so they are seen wherever the page is scrolled, then fade out.
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsgState(null), msg.isError ? 12000 : 5000)
    return () => clearTimeout(t)
  }, [msg])

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
          {festivals && festivals.length > 0 && festivals.length < 3 && !creating && !api.isDemo && <button className="btn ghost" onClick={() => setCreating(true)}>New festival</button>}
          {!api.isDemo && <button className="btn ghost" onClick={() => api.signOut()}>Sign out</button>}
        </div>
      </div>
      {msg && (
        <div className={'toast ' + (msg.isError ? 'bad' : 'good')} role="status" aria-live="polite">
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsgState(null)} aria-label="Dismiss">Close</button>
        </div>
      )}
      {festivals && (festivals.length === 0 || creating) && (
        <CreateFestival
          first={festivals.length === 0}
          setMsg={setMsg}
          onCancel={() => setCreating(false)}
          onCreated={async (res) => {
            const list = await api.myFestivals()
            setFestivals(list)
            setCurrent(list.find((x) => x.id === res.id) || list[0] || null)
            setCreating(false); setTab('festival')
            setMsg('Your festival was created. It is a private draft until you publish it.')
          }}
        />
      )}
      {current && !creating && (
        <>
          {festivals.length > 1 && (
            <select className="picker" value={current.id} onChange={(e) => setCurrent(festivals.find((f) => f.id === e.target.value))}>
              {festivals.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {current.status === 'draft' && <GettingStarted festival={current} goTab={setTab} />}
          <nav className="tabs">
            {[['films', 'Films'], ['submissions', 'Submissions'], ['live', 'Live channels'], ['screenings', 'Theaters'], ['virtual', 'Virtual cinema'], ['cinema', 'Virtual theater'], ['access', 'Access and sales'], ['analytics', 'Analytics'], ['festival', 'Festival page']].map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsgState(null) }}>{label}</button>
            ))}
          </nav>
          {tab === 'films' && <FilmsTab festival={current} setMsg={setMsg} />}
          {tab === 'submissions' && <SubmissionsTab festival={current} setMsg={setMsg} />}
          {tab === 'live' && <LiveTab festival={current} setMsg={setMsg} />}
          {tab === 'screenings' && <ScreeningsTab festival={current} setMsg={setMsg} />}
          {tab === 'virtual' && <VirtualTab festival={current} setMsg={setMsg} />}
          {tab === 'cinema' && <CinemaTab festival={current} setMsg={setMsg} />}
          {tab === 'access' && <AccessTab festival={current} setMsg={setMsg} />}
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
