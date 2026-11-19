import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'
import { detectDuration } from './mediaDuration.js'
import { csvText } from './submissionRules.js'

// Network owner: the Festaview Cinemas ad server. Advertisers, their spots, and the analytics they are billed from.
const day = (d) => d.toISOString().slice(0, 10)
const dollars = (c) => '$' + ((c || 0) / 100).toFixed(2)
const toCents = (v) => Math.round(parseFloat(String(v || '0').replace(/[$,]/g, '')) * 100) || 0
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '-')
const EMPTY_ADV = { name: '', contact_name: '', contact_email: '', notes: '', active: true }
const EMPTY_AD = { advertiser_id: '', title: '', video_url: '', duration_sec: '', click_url: '', cpm: '', starts_on: '', ends_on: '', max_impressions: '', priority: '0', active: true }

function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export default function CinemaAds({ note }) {
  const [d, setD] = useState(null)
  const [adv, setAdv] = useState(null)
  const [ad, setAd] = useState(null)
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 30 * 864e5)))
  const [to, setTo] = useState(() => day(new Date()))
  const [rows, setRows] = useState([])
  const [daily, setDaily] = useState(null)

  const reload = useCallback(() => api.cinemaAdsData().then(setD).catch((e) => note(e.message, true)), [note])
  const report = useCallback(() => api.cinemaAdReport(from, to).then(setRows).catch((e) => note(e.message, true)), [from, to, note])
  useEffect(() => { if (!api.isDemo) { reload(); report() } }, [reload, report])
  if (api.isDemo) return <p className="note pad">The ad server needs a connected database.</p>
  if (!d) return <p className="note pad">Loading...</p>

  const saveAdv = async (e) => {
    e.preventDefault()
    try { await api.saveAdvertiser(adv); setAdv(null); note('Advertiser saved.'); reload() } catch (x) { note(x.message, true) }
  }
  const saveAd = async (e) => {
    e.preventDefault()
    try {
      await api.saveCinemaAd({ ...ad, duration_sec: parseInt(ad.duration_sec, 10), cpm_cents: toCents(ad.cpm), max_impressions: parseInt(ad.max_impressions, 10) || null, priority: parseInt(ad.priority, 10) || 0 })
      setAd(null); note('Ad saved.'); reload(); report()
    } catch (x) { note(x.message, true) }
  }
  const editAd = (a) => setAd({ ...a, duration_sec: String(a.duration_sec), cpm: a.cpm_cents ? (a.cpm_cents / 100).toFixed(2) : '', starts_on: a.starts_on || '', ends_on: a.ends_on || '', max_impressions: a.max_impressions || '', priority: String(a.priority || 0), click_url: a.click_url || '' })
  const delAd = async (a) => {
    if (!window.confirm('Remove "' + a.title + '"? An ad with views is switched off instead, so its numbers stay.')) return
    try { const r = await api.deleteCinemaAd(a.id); note(r === 'hidden' ? 'Ad switched off (it has views).' : 'Ad deleted.'); reload(); report() } catch (x) { note(x.message, true) }
  }
  const toggleAll = async () => {
    try { await api.setCinemaAdsEnabled(!d.enabled); note(d.enabled ? 'Advertiser spots are off in every theater. Trailers still play.' : 'Advertiser spots are on.'); reload() } catch (x) { note(x.message, true) }
  }
  const showDaily = async (r) => {
    if (daily && daily.id === r.ad_id) { setDaily(null); return }
    try { setDaily({ id: r.ad_id, title: r.title, rows: await api.cinemaAdDaily(r.ad_id, from, to) }) } catch (x) { note(x.message, true) }
  }
  const owed = (r) => Math.round((r.completes * r.cpm_cents) / 1000)
  const adRows = rows.filter((r) => r.kind === 'ad')
  const exportCsv = () => {
    const out = [['Advertiser', 'Ad', 'From', 'To', 'Showings', 'Unique viewers', 'Plays', 'Completed views', 'Completion rate', 'Clicks', 'Click rate', 'CPM ($)', 'Amount due ($)'],
      ...adRows.map((r) => [r.advertiser_name, r.title, from, to, r.showings, r.viewers, r.starts, r.completes, pct(r.completes, r.starts), r.clicks, pct(r.clicks, r.starts), (r.cpm_cents / 100).toFixed(2), (owed(r) / 100).toFixed(2)])]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csvText(out)], { type: 'text/csv' }))
    a.download = 'cinema-ads-' + from + '-to-' + to + '.csv'
    a.click(); URL.revokeObjectURL(a.href)
  }
  const sum = (k) => adRows.reduce((a, r) => a + r[k], 0)

  return (
    <div>
      <div className="panel">
        <h2>Pre-show ads</h2>
        <p className="note">When the doors open, every theater plays a reel before the film: advertiser spots first, then the festival's own trailers, then the "silence your phone" reminder and the feature. The reel is chosen once per showing so everyone sees the same thing. Each play, completed view and click is counted below.</p>
        <p>Advertiser spots are currently <strong>{d.enabled ? 'on' : 'off'}</strong>. <button className="btn ghost" type="button" onClick={toggleAll}>{d.enabled ? 'Turn all ads off' : 'Turn ads on'}</button></p>
      </div>

      <div className="panel">
        <h2>Advertisers</h2>
        {d.advertisers.length === 0 && <p className="note">No advertisers yet.</p>}
        <ul className="list">
          {d.advertisers.map((a) => (
            <li key={a.id}><div><strong>{a.name}</strong><small>{[a.contact_name, a.contact_email].filter(Boolean).join(' | ')}{a.active ? '' : ' (paused)'}</small></div><button className="btn ghost" type="button" onClick={() => setAdv({ ...a, contact_name: a.contact_name || '', contact_email: a.contact_email || '', notes: a.notes || '' })}>Edit</button></li>
          ))}
        </ul>
        {!adv && <div className="actions"><button className="btn ghost" type="button" onClick={() => setAdv(EMPTY_ADV)}>Add advertiser</button></div>}
        {adv && (
          <form onSubmit={saveAdv}>
            <div className="two">
              <Field label="Advertiser name"><input value={adv.name} onChange={(e) => setAdv({ ...adv, name: e.target.value })} required /></Field>
              <Field label="Contact name"><input value={adv.contact_name} onChange={(e) => setAdv({ ...adv, contact_name: e.target.value })} /></Field>
            </div>
            <div className="two">
              <Field label="Contact email"><input type="email" value={adv.contact_email} onChange={(e) => setAdv({ ...adv, contact_email: e.target.value })} /></Field>
              <Field label="Notes"><input value={adv.notes} onChange={(e) => setAdv({ ...adv, notes: e.target.value })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={adv.active} onChange={(e) => setAdv({ ...adv, active: e.target.checked })} /> Active (their ads can run)</label>
            <div className="actions"><button className="btn" type="submit">Save advertiser</button><button className="btn ghost" type="button" onClick={() => setAdv(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Ads</h2>
        {d.ads.length === 0 && <p className="note">No ads yet. Add an advertiser first.</p>}
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {d.ads.map((a) => {
                const v = d.advertisers.find((x) => x.id === a.advertiser_id)
                return (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong><br /><span className="note small">{v ? v.name : ''} | {a.duration_sec}s | {dollars(a.cpm_cents)} CPM{a.active ? '' : ' | off'}</span></td>
                    <td className="note small">{a.starts_on || 'any time'} to {a.ends_on || 'no end'}{a.max_impressions ? ' | cap ' + a.max_impressions : ''}</td>
                    <td><button className="btn ghost" type="button" onClick={() => editAd(a)}>Edit</button> <button className="btn ghost danger" type="button" onClick={() => delAd(a)}>Remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!ad && d.advertisers.length > 0 && <div className="actions"><button className="btn ghost" type="button" onClick={() => setAd({ ...EMPTY_AD, advertiser_id: d.advertisers[0].id })}>Add ad</button></div>}
        {ad && (
          <form onSubmit={saveAd}>
            <div className="two">
              <Field label="Advertiser"><select value={ad.advertiser_id} onChange={(e) => setAd({ ...ad, advertiser_id: e.target.value })} required>{d.advertisers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Ad name"><input value={ad.title} onChange={(e) => setAd({ ...ad, title: e.target.value })} required /></Field>
            </div>
            <Field label="Video link (.m3u8 or .mp4)"><input value={ad.video_url} onChange={(e) => setAd({ ...ad, video_url: e.target.value })} placeholder="https://..." required /></Field>
            <div className="two">
              <Field label="Length in seconds"><input value={ad.duration_sec} onChange={(e) => setAd({ ...ad, duration_sec: e.target.value })} inputMode="numeric" required /><button type="button" className="btn ghost small" onClick={async () => { const s = await detectDuration(ad.video_url); if (s) setAd({ ...ad, duration_sec: String(s) }); else note('Could not read the length. Check the link or type it in.', true) }}>Detect length</button></Field>
              <Field label="Click-through link (optional)" hint="Shows a Learn more button on the ad."><input value={ad.click_url} onChange={(e) => setAd({ ...ad, click_url: e.target.value })} placeholder="https://..." /></Field>
            </div>
            <div className="two">
              <Field label="Price per 1,000 completed views (CPM, dollars)" hint="Used to work out what the advertiser owes."><input value={ad.cpm} onChange={(e) => setAd({ ...ad, cpm: e.target.value })} inputMode="decimal" placeholder="25" /></Field>
              <Field label="Priority (higher plays first)"><input value={ad.priority} onChange={(e) => setAd({ ...ad, priority: e.target.value })} inputMode="numeric" /></Field>
            </div>
            <div className="two">
              <Field label="Runs from (optional)"><input type="date" value={ad.starts_on} onChange={(e) => setAd({ ...ad, starts_on: e.target.value })} /></Field>
              <Field label="Runs until (optional)"><input type="date" value={ad.ends_on} onChange={(e) => setAd({ ...ad, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Stop after this many plays (optional)"><input value={ad.max_impressions} onChange={(e) => setAd({ ...ad, max_impressions: e.target.value })} inputMode="numeric" /></Field>
            <label className="check"><input type="checkbox" checked={ad.active} onChange={(e) => setAd({ ...ad, active: e.target.checked })} /> Active</label>
            <div className="actions"><button className="btn" type="submit">Save ad</button><button className="btn ghost" type="button" onClick={() => setAd(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Advertiser analytics</h2>
        <div className="actions">
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button className="btn ghost" type="button" onClick={exportCsv} disabled={!adRows.length}>Export CSV</button>
        </div>
        <p><strong>{sum('starts')}</strong> plays | <strong>{sum('completes')}</strong> completed views | <strong>{sum('clicks')}</strong> clicks | <strong>{dollars(adRows.reduce((a, r) => a + owed(r), 0))}</strong> due</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Advertiser</th><th>Ad</th><th>Showings</th><th>Viewers</th><th>Plays</th><th>Completed</th><th>Click rate</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {adRows.map((r) => (
                <tr key={r.ad_id}>
                  <td>{r.advertiser_name}</td><td>{r.title}</td><td>{r.showings}</td><td>{r.viewers}</td><td>{r.starts}</td><td>{r.completes} ({pct(r.completes, r.starts)})</td><td>{r.clicks} ({pct(r.clicks, r.starts)})</td><td>{dollars(owed(r))}</td>
                  <td><button className="btn ghost small" type="button" onClick={() => showDaily(r)}>{daily && daily.id === r.ad_id ? 'Hide days' : 'By day'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {adRows.length === 0 && <p className="note">No numbers yet. They appear once viewers watch a theater pre-show.</p>}
        {daily && (
          <div>
            <h3>{daily.title} by day</h3>
            <table className="table"><thead><tr><th>Day</th><th>Viewers</th><th>Plays</th><th>Completed</th><th>Clicks</th></tr></thead>
              <tbody>{daily.rows.map((x) => <tr key={x.day}><td>{x.day}</td><td>{x.viewers}</td><td>{x.starts}</td><td>{x.completes}</td><td>{x.clicks}</td></tr>)}</tbody></table>
          </div>
        )}
        <p className="note small">Plays count each viewer once per ad per showing. A completed view means the viewer watched the spot through to its end. Viewers must hold a seat in the showing for a view to count.</p>
      </div>
    </div>
  )
}
