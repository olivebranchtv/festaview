import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'
import { detectDuration } from './mediaDuration.js'

// Festival admin: coming-attraction trailers for the theater pre-show, and how the pre-show performed.
const day = (d) => d.toISOString().slice(0, 10)
const EMPTY = { kind: 'trailer', sponsor_name: '', title: '', video_url: '', duration_sec: '', click_url: '', active: true }
const local = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export default function Preshow({ festival, setMsg }) {
  const [trailers, setTrailers] = useState([])
  const [showings, setShowings] = useState([])
  const [edit, setEdit] = useState(null)
  const [pick, setPick] = useState({})
  const [rep, setRep] = useState([])

  const refresh = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([api.listTrailers(festival.id), api.listMyShowings(festival.id)])
      setTrailers(t)
      const up = s.filter((x) => x.status !== 'cancelled' && new Date(x.starts_at).getTime() > Date.now() - 864e5)
      setShowings(up)
      setPick(Object.fromEntries(up.map((x) => [x.id, x.trailer_ids || []])))
      api.festivalAdReport(festival.id, day(new Date(Date.now() - 30 * 864e5)), day(new Date())).then(setRep).catch(() => {})
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { if (!api.isDemo) refresh() }, [refresh])
  if (api.isDemo) return null

  const save = async (e) => {
    e.preventDefault()
    try { await api.saveTrailer(festival.id, { ...edit, duration_sec: parseInt(edit.duration_sec, 10) }); setEdit(null); setMsg('Saved.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const toggle = (sid, tid) => setPick((p) => {
    const cur = p[sid] || []
    return { ...p, [sid]: cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid] }
  })
  const savePick = async (s) => {
    try { await api.setShowingTrailers(s.id, pick[s.id] || []); setMsg('Pre-show saved for "' + s.title + '".'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const active = trailers.filter((t) => t.active)

  return (
    <div className="panel">
      <h2>Pre-show: trailers and business ads before the film</h2>
      <p className="note">When the doors open, your audience sees a short reel like in a cinema: advertiser spots, then your own business ads and trailers, then a "silence your phone" reminder, then the film. Add trailers for your films, and video ads for local businesses and sponsors you sell a spot to (you keep that revenue), then choose which ones play before each showing. The reel fills the time the doors are open (up to the doors-open minutes minus 30 seconds).</p>
      {trailers.length === 0 && <p className="note">No trailers or business ads yet.</p>}
      <ul className="list">
        {trailers.map((t) => (
          <li key={t.id}><div><strong>{t.title}</strong><small>{t.kind === 'sponsor' ? 'Business ad: ' + (t.sponsor_name || '') : 'Trailer'} | {t.duration_sec}s{t.active ? '' : ' | hidden'}</small></div>
            <button type="button" className="btn ghost" onClick={() => setEdit({ ...t, duration_sec: String(t.duration_sec), click_url: t.click_url || '' })}>Edit</button></li>
        ))}
      </ul>
      {!edit && <div className="actions"><button type="button" className="btn ghost" onClick={() => setEdit(EMPTY)}>Add trailer or business ad</button></div>}
      {edit && (
        <form onSubmit={save}>
          <div className="two">
            <Field label="Type"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="trailer">Trailer (coming attraction)</option><option value="sponsor">Business ad (sponsor)</option></select></Field>
            {edit.kind === 'sponsor' && <Field label="Business name"><input value={edit.sponsor_name || ''} onChange={(e) => setEdit({ ...edit, sponsor_name: e.target.value })} required /></Field>}
          </div>
          <Field label="Name"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></Field>
          <Field label="Video link (.m3u8 or .mp4)"><input value={edit.video_url} onChange={(e) => setEdit({ ...edit, video_url: e.target.value })} placeholder="https://..." required /></Field>
          <div className="two">
            <Field label="Length in seconds"><input value={edit.duration_sec} onChange={(e) => setEdit({ ...edit, duration_sec: e.target.value })} inputMode="numeric" required /><button type="button" className="btn ghost small" onClick={async () => { const s = await detectDuration(edit.video_url); if (s) setEdit({ ...edit, duration_sec: String(s) }); else setMsg('Could not read the length. Type it in.', true) }}>Detect length</button></Field>
            <Field label="Link for a Learn more button (optional)"><input value={edit.click_url} onChange={(e) => setEdit({ ...edit, click_url: e.target.value })} placeholder="https://..." /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Available to choose</label>
          <div className="actions"><button className="btn" type="submit">Save</button><button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}

      {active.length > 0 && showings.length > 0 && (
        <>
          <h3>Trailers and ads for each showing</h3>
          {showings.map((s) => {
            const locked = !!s.preshow_plan
            return (
              <div key={s.id} className="panel">
                <strong>{s.title}</strong> <span className="note small">{local(s.starts_at)}</span>
                {locked && <p className="note small">The doors have opened, so this pre-show is locked in.</p>}
                <div>{active.map((t) => (
                  <label className="check" key={t.id}><input type="checkbox" disabled={locked} checked={(pick[s.id] || []).includes(t.id)} onChange={() => toggle(s.id, t.id)} /> {t.title} ({t.kind === 'sponsor' ? 'ad' : 'trailer'}, {t.duration_sec}s)</label>
                ))}</div>
                {!locked && <div className="actions"><button type="button" className="btn ghost" onClick={() => savePick(s)}>Save pre-show</button></div>}
              </div>
            )
          })}
        </>
      )}

      {rep.length > 0 && (
        <>
          <h3>Pre-show results, last 30 days</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Spot</th><th>Type</th><th>Played for</th><th>Completed</th><th>Clicks</th></tr></thead>
              <tbody>{rep.map((r, i) => <tr key={i}><td>{r.title}</td><td>{r.kind === 'trailer' ? 'Your trailer' : r.kind === 'sponsor' ? 'Your business ad (' + r.sponsor + ')' : 'Network advertiser (' + r.sponsor + ')'}</td><td>{r.starts}</td><td>{r.completes}</td><td>{r.clicks}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
