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
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try { await api.signIn(email, password); onDone() } catch (x) { setErr(x.message) }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>Festival login</h2>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {err && <p className="error">{err}</p>}
      <button className="btn" type="submit">Sign in</button>
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
        website: f.website, logo_url: f.logo_url, banner_url: f.banner_url, status: f.status,
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
        <Field label="Video URL" hint="Direct link to an HLS (.m3u8) or MP4 file. Roku plays these formats.">
          <input value={edit.video_url || ''} onChange={(e) => set('video_url')(e.target.value)} placeholder="https://.../film.m3u8" />
        </Field>
        <Field label="Trailer URL"><input value={edit.trailer_url || ''} onChange={(e) => set('trailer_url')(e.target.value)} /></Field>
        <Field label="Captions URL (WebVTT or SRT)"><input value={edit.captions_url || ''} onChange={(e) => set('captions_url')(e.target.value)} /></Field>
        <div className="two">
          <Field label="Premiere date"><input type="datetime-local" value={edit.premiere_at} onChange={(e) => set('premiere_at')(e.target.value)} /></Field>
          <Field label="Available from"><input type="datetime-local" value={edit.available_from} onChange={(e) => set('available_from')(e.target.value)} /></Field>
          <Field label="Available until"><input type="datetime-local" value={edit.available_until} onChange={(e) => set('available_until')(e.target.value)} /></Field>
        </div>
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
            <button className="btn ghost" onClick={() => setEdit({ ...EMPTY_FEED, ...l })}>Edit</button>
            <button className="btn ghost danger" onClick={() => del(l)}>Delete</button>
          </li>
        ))}
      </ul>
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
            {[['films', 'Films'], ['live', 'Live channels'], ['festival', 'Festival page']].map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsgState(null) }}>{label}</button>
            ))}
          </nav>
          {tab === 'films' && <FilmsTab festival={current} setMsg={setMsg} />}
          {tab === 'live' && <LiveTab festival={current} setMsg={setMsg} />}
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
