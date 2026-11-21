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

const centsText = (c) => { const n = Number(c || 0); return n % 1 === 0 ? String(n) : String(Math.round(n * 1000) / 1000) }
const dollars = (cents) => { const d = Number(cents || 0) / 100; return '$' + (Math.abs(d) >= 0.1 ? d.toFixed(2) : d.toFixed(3)) }

// What each ad pays, in cents per ad (for now one cent each), and the festival's share of the money.
function AdRates({ note }) {
  const [s, setS] = useState(null)
  useEffect(() => { api.getRokuAdRates().then((r) => setS({ ...r })).catch((e) => note(e.message, true)) }, [note])
  if (!s) return null
  const save = async (e) => {
    e.preventDefault()
    const a = parseFloat(s.adtelligent_rate_cents), h = parseFloat(s.house_rate_cents), p = parseFloat(s.festival_share_pct)
    if (!(a >= 0) || !(h >= 0)) { note('Rates must be 0 or more.', true); return }
    if (!(p >= 0 && p <= 100)) { note('The festival share must be from 0 to 100.', true); return }
    try { await api.saveRokuAdRates({ adtelligent_rate_cents: a, house_rate_cents: h, festival_share_pct: p }); note('Rates saved. New ads use them from now on; ads already logged keep the rate they had.') } catch (x) { note(x.message, true) }
  }
  return (
    <div className="panel">
      <h2>What each ad pays</h2>
      <p className="note">Rates are in cents per ad. They are stamped on each ad when it plays, so changing a rate never rewrites history. A house spot can have its own rate below, otherwise it pays the house rate.</p>
      <form onSubmit={save}>
        <div className="two">
          <label className="field"><span>Adtelligent ads (cents per ad)</span><input value={s.adtelligent_rate_cents} onChange={(e) => setS({ ...s, adtelligent_rate_cents: e.target.value })} inputMode="decimal" /></label>
          <label className="field"><span>Our own spots, default (cents per ad)</span><input value={s.house_rate_cents} onChange={(e) => setS({ ...s, house_rate_cents: e.target.value })} inputMode="decimal" /></label>
        </div>
        <label className="field"><span>Festival share of ad revenue (percent)</span><input value={s.festival_share_pct} onChange={(e) => setS({ ...s, festival_share_pct: e.target.value })} inputMode="decimal" /></label>
        <button className="btn" type="submit">Save rates</button>
      </form>
    </div>
  )
}

// Which ads played on which title, by source, with what they earned and the festival's share.
function AdReport({ note }) {
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState(null)
  useEffect(() => { setRows(null); api.rokuAdReport(days, null).then(setRows).catch((e) => { note(e.message, true); setRows([]) }) }, [days, note])
  const plays = (rows || []).reduce((a, r) => a + Number(r.plays || 0), 0)
  const gross = (rows || []).reduce((a, r) => a + Number(r.gross_cents || 0), 0)
  const share = (rows || []).reduce((a, r) => a + Number(r.festival_cents || 0), 0)
  return (
    <div className="panel">
      <h2>Ads played by title</h2>
      <p className="note">Every ad handed to a Roku, with the title it ran on, where it came from and the rate it paid. This counts ads delivered to the Roku. It does not confirm that each one was watched to the end.</p>
      <div className="filters">
        {[1, 7, 30].map((d) => <button key={d} type="button" className={'btn ghost small' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>{d === 1 ? 'Last 24 hours' : 'Last ' + d + ' days'}</button>)}
      </div>
      <div className="kpis">
        <div className="kpi"><span>Ads played</span><strong>{plays.toLocaleString()}</strong></div>
        <div className="kpi"><span>Earned</span><strong>{dollars(gross)}</strong></div>
        <div className="kpi"><span>Festivals' share</span><strong>{dollars(share)}</strong></div>
      </div>
      {!rows && <p className="note">Loading...</p>}
      {rows && rows.length === 0 && <p className="note">No ads have played in this period yet.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Title</th><th>Festival</th><th>Source</th><th>Ad</th><th>Plays</th><th>Earned</th><th>Festival share</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.title || '(no title)'}</td>
                  <td>{r.festival_name || '-'}</td>
                  <td>{r.source === 'adtelligent' ? 'Adtelligent' : 'Our spot'}</td>
                  <td>{r.ad_label || '-'}</td>
                  <td>{Number(r.plays).toLocaleString()}</td>
                  <td>{dollars(r.gross_cents)}</td>
                  <td>{dollars(r.festival_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Network owner: the house ads that fill Roku ad slots when Adtelligent has no ad, and how often Adtelligent fills.
export default function RokuAds({ note }) {
  const [spots, setSpots] = useState(null)
  const [counts, setCounts] = useState([])
  const [f, setF] = useState({ title: '', video_url: '', click_url: '', duration: '' })
  const [rateDraft, setRateDraft] = useState({})

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
  const saveRate = async (s) => {
    const raw = rateDraft[s.id]
    if (raw === undefined) return
    const v = String(raw).trim() === '' ? null : parseFloat(raw)
    if (v !== null && !(v >= 0)) { note('A rate must be 0 or more, or empty to use the house rate.', true); return }
    try { await api.setRokuSpotRate(s.id, v); setRateDraft((d) => { const n = { ...d }; delete n[s.id]; return n }); note(v === null ? 'This spot now uses the house rate.' : 'Rate saved.'); reload() } catch (x) { note(x.message, true) }
  }
  const toggle = async (s) => { try { await api.setRokuSpotActive(s.id, !s.active); reload() } catch (x) { note(x.message, true) } }
  const remove = async (s) => {
    if (!window.confirm('Delete "' + s.title + '"?')) return
    try { await api.deleteRokuSpot(s.id); note('Spot deleted.'); reload() } catch (x) { note(x.message, true) }
  }

  return (
    <>
      <AdBreaks note={note} />
      <AdRates note={note} />
      <AdReport note={note} />
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
              <input value={rateDraft[s.id] !== undefined ? rateDraft[s.id] : s.rate_cents == null ? '' : centsText(s.rate_cents)} onChange={(e) => setRateDraft({ ...rateDraft, [s.id]: e.target.value })} placeholder="house rate" inputMode="decimal" aria-label={'Rate in cents for ' + s.title} style={{ width: '6rem' }} />
              <button type="button" className="btn ghost small" onClick={() => saveRate(s)} disabled={rateDraft[s.id] === undefined}>Save rate</button>
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
