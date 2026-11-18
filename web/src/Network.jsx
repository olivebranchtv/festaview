import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Network owner console: create festivals, publish them, link festival admins, read inquiries.
export default function Network() {
  const [session, setSession] = useState(undefined)
  const [ok, setOk] = useState(null)
  const [festivals, setFestivals] = useState([])
  const [inquiries, setInquiries] = useState([])
  const [msg, setMsg] = useState(null)
  const [name, setName] = useState('')
  const [assign, setAssign] = useState({ email: '', festival: '' })
  const note = (text, isError) => setMsg({ text, isError: !!isError })

  useEffect(() => { api.getSession().then(setSession); return api.onAuth(setSession) }, [])

  const refresh = useCallback(async () => {
    try {
      setFestivals(await api.allFestivals())
      setInquiries(await api.listInquiries())
    } catch (e) { note(e.message, true) }
  }, [])

  useEffect(() => {
    if (!session) { setOk(null); return }
    api.isPlatformAdmin().then((v) => { setOk(v); if (v) refresh() })
  }, [session, refresh])

  if (api.isDemo) return <p className="note pad">The network console needs a connected database.</p>
  if (session === undefined) return <p className="note pad">Loading...</p>
  if (!session) return <p className="note pad">Sign in first at <a href="#/admin">the festival login</a>, then return to this page.</p>
  if (ok === null) return <p className="note pad">Checking access...</p>
  if (!ok) return <p className="note pad">This account is not a network owner.</p>

  const create = async (e) => {
    e.preventDefault()
    try { await api.createFestival({ name, slug: slugify(name) }); setName(''); note('Festival created as a draft.'); refresh() } catch (x) { note(x.message, true) }
  }
  const publish = async (f, status) => {
    try { await api.setFestivalStatus(f.id, status); refresh() } catch (x) { note(x.message, true) }
  }
  const link = async (e) => {
    e.preventDefault()
    try { const r = await api.assignAdmin(assign.email, assign.festival); note(r === 'ok' ? 'Admin linked.' : r, r !== 'ok') } catch (x) { note(x.message, true) }
  }

  return (
    <div>
      <div className="admin-head"><h1>Network console</h1></div>
      {msg && <p className={msg.isError ? 'error' : 'ok'}>{msg.text}</p>}

      <div className="panel">
        <h2>Festivals</h2>
        <ul className="list">
          {festivals.map((f) => (
            <li key={f.id}>
              <div><strong>{f.name}</strong><small>/{f.slug}</small></div>
              <span className={'pill ' + f.status}>{f.status}</span>
              {f.status !== 'published' && <button className="btn ghost" onClick={() => publish(f, 'published')}>Publish</button>}
              {f.status === 'published' && <button className="btn ghost" onClick={() => publish(f, 'draft')}>Unpublish</button>}
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={create}>
          <input placeholder="New festival name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn" type="submit">Create festival</button>
        </form>
      </div>

      <div className="panel">
        <h2>Link a festival admin</h2>
        <p className="note">The person must create an account first (festival login, then Create account). Then link their email to a festival.</p>
        <form className="inline-form" onSubmit={link}>
          <input type="email" placeholder="admin@festival.org" value={assign.email} onChange={(e) => setAssign({ ...assign, email: e.target.value })} required />
          <select value={assign.festival} onChange={(e) => setAssign({ ...assign, festival: e.target.value })} required>
            <option value="">Choose festival</option>
            {festivals.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="btn" type="submit">Link</button>
        </form>
      </div>

      <div className="panel">
        <h2>Founding festival inquiries</h2>
        {inquiries.length === 0 && <p className="note">No inquiries yet.</p>}
        <ul className="list">
          {inquiries.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{i.festival_name}</strong>
                <small>{[i.contact_name, i.email].filter(Boolean).join(' | ')}</small>
                {i.message && <small className="wrapnote">{i.message}</small>}
              </div>
              <small>{new Date(i.created_at).toLocaleDateString()}</small>
              <a className="btn ghost" href={'mailto:' + i.email}>Reply</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
