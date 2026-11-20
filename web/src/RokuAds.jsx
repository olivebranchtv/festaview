import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'

// Network owner: the house ads that fill Roku ad slots when Adtelligent has no ad, and how often Adtelligent fills.
export default function RokuAds({ note }) {
  const [spots, setSpots] = useState(null)
  const [counts, setCounts] = useState([])
  const [f, setF] = useState({ title: '', video_url: '', click_url: '', duration: '' })

  const reload = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.listRokuSpots(), api.rokuAdCounts(7)])
      setSpots(s); setCounts(c)
    } catch (e) { note(e.message, true) }
  }, [note])
  useEffect(() => { if (!api.isDemo) reload() }, [reload])
  if (api.isDemo) return <p className="note pad">Roku ads need a connected database.</p>
  if (!spots) return <p className="note pad">Loading...</p>

  const sum = (source, event, spot) => counts.filter((c) => c.source === source && c.event === event && (spot === undefined || c.spot === spot)).reduce((a, c) => a + Number(c.n || 0), 0)
  const asked = sum('adtelligent', 'request')
  const filled = sum('adtelligent', 'filled')
  const fallbackTotal = sum('fallback', 'filled')
  const rate = asked > 0 ? Math.round((filled / asked) * 100) : null
  const spotFills = (id) => sum('fallback', 'filled', 'spot-' + id)

  const add = async (e) => {
    e.preventDefault()
    const dur = parseInt(f.duration, 10)
    if (!f.title.trim()) { note('Give the spot a name.', true); return }
    if (!/^https:\/\//i.test(f.video_url.trim())) { note('The video link must start with https://', true); return }
    if (f.click_url.trim() && !/^https:\/\//i.test(f.click_url.trim())) { note('The click link must start with https://', true); return }
    if (!(dur >= 1 && dur <= 300)) { note('Enter the length in seconds (1 to 300).', true); return }
    try {
      await api.addRokuSpot({ title: f.title.trim(), video_url: f.video_url.trim(), click_url: f.click_url.trim(), duration_seconds: dur })
      setF({ title: '', video_url: '', click_url: '', duration: '' })
      note('Spot added.'); reload()
    } catch (x) { note(x.message, true) }
  }
  const toggle = async (s) => { try { await api.setRokuSpotActive(s.id, !s.active); reload() } catch (x) { note(x.message, true) } }
  const remove = async (s) => {
    if (!window.confirm('Delete "' + s.title + '"?')) return
    try { await api.deleteRokuSpot(s.id); note('Spot deleted.'); reload() } catch (x) { note(x.message, true) }
  }

  return (
    <>
      <div className="panel">
        <h2>Roku ad waterfall, last 7 days</h2>
        <p className="note">Every ad slot on the Roku app asks Adtelligent first. Our own spots below play only when Adtelligent has no ad. Until the Adtelligent tag is set on the website (Netlify setting ROKU_ADTELLIGENT_TAG), every slot plays one of our own spots.</p>
        <div className="kpis">
          <div className="kpi"><span>Adtelligent asked</span><strong>{asked.toLocaleString()}</strong></div>
          <div className="kpi"><span>Adtelligent filled</span><strong>{filled.toLocaleString()}</strong></div>
          <div className="kpi"><span>Fill rate</span><strong>{rate === null ? 'n/a' : rate + '%'}</strong></div>
          <div className="kpi"><span>Our own spots played</span><strong>{fallbackTotal.toLocaleString()}</strong></div>
        </div>
      </div>

      <div className="panel">
        <h2>Our own spots</h2>
        <ul className="list">
          {spots.length === 0 && <li><span className="note">No spots yet. Without spots, an unfilled slot is skipped.</span></li>}
          {spots.map((s) => (
            <li key={s.id}>
              <div><strong>{s.title}</strong><small>{s.duration_seconds} seconds | played {spotFills(s.id).toLocaleString()} times in 7 days{s.click_url ? ' | ' + s.click_url : ''}</small></div>
              <span className={'pill ' + (s.active ? 'published' : 'draft')}>{s.active ? 'on' : 'off'}</span>
              <button type="button" className="btn ghost small" onClick={() => toggle(s)}>{s.active ? 'Turn off' : 'Turn on'}</button>
              <button type="button" className="btn ghost small danger" onClick={() => remove(s)}>Delete</button>
            </li>
          ))}
        </ul>
        <h3>Add a spot</h3>
        <form onSubmit={add}>
          <div className="two">
            <label className="field"><span>Name</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label className="field"><span>Length in seconds</span><input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} inputMode="numeric" /></label>
          </div>
          <label className="field"><span>Video link (https, Bunny playlist or mp4)</span><input value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="https://..." /></label>
          <label className="field"><span>Click-through link (optional)</span><input value={f.click_url} onChange={(e) => setF({ ...f, click_url: e.target.value })} placeholder="https://..." /></label>
          <button className="btn" type="submit">Add spot</button>
        </form>
      </div>
    </>
  )
}
