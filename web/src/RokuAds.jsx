import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'

// How many ads play on the Roku, and when. The Roku reads this each time the channel opens, so there is nothing to rebuild or resend.
function AdBreaks({ note }) {
  const [s, setS] = useState(null)
  useEffect(() => { api.getRokuAdSettings().then((r) => setS({ ...r })).catch((e) => note(e.message, true)) }, [note])
  if (!s) return null
  const field = (key, label, hint, min, max) => (
    <label className="field">
      <span>{label}</span>
      <input value={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.value })} inputMode="numeric" aria-label={label} />
      <small>{hint} ({min} to {max})</small>
    </label>
  )
  const save = async (e) => {
    e.preventDefault()
    const spec = [['preroll_count', 'Ads before a film', 0, 10], ['midroll_count', 'Midroll breaks', 0, 10], ['midroll_interval_minutes', 'Minutes between breaks', 1, 120], ['midroll_ads_per_break', 'Ads in each midroll break', 1, 6], ['lobby_count', 'Lobby ads', 0, 6]]
    const out = {}
    for (const [k, label, min, max] of spec) {
      const n = parseInt(s[k], 10)
      if (!(n >= min && n <= max)) { note(label + ' must be a number from ' + min + ' to ' + max + '.', true); return }
      out[k] = n
    }
    try { await api.saveRokuAdSettings(out); note('Ad breaks saved. Rokus pick them up the next time the channel opens.') } catch (x) { note(x.message, true) }
  }
  return (
    <div className="panel">
      <h2>Ad breaks on Roku</h2>
      <p className="note">These apply to every Roku the next time its Festaview channel is opened. Nothing to rebuild or resend. Midroll breaks play only during films you choose from a row, not during live channels, the TV Guide or a Festaview Cinemas showing (everyone watches those in step, so ads there play in the lobby before showtime).</p>
      <form onSubmit={save}>
        <div className="two">
          {field('preroll_count', 'Ads before a film', 'Played before a film, live channel or TV Guide channel starts', 0, 10)}
          {field('lobby_count', 'Lobby ads', 'Played in the Festaview Cinemas lobby before showtime, if there is time', 0, 6)}
        </div>
        <div className="two">
          {field('midroll_count', 'Midroll breaks', 'How many breaks during one film', 0, 10)}
          {field('midroll_interval_minutes', 'Minutes between breaks', 'The first break comes after this many minutes of watching', 1, 120)}
        </div>
        {field('midroll_ads_per_break', 'Ads in each midroll break', 'How many ads play in one break', 1, 6)}
        <button className="btn" type="submit">Save ad breaks</button>
      </form>
    </div>
  )
}

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
      <AdBreaks note={note} />
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
