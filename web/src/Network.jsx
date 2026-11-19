import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './adminData.js'
import { durationOf } from './channels.js'

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const num = (n) => Number(n || 0).toLocaleString()
const hours = (s) => { const h = Number(s || 0) / 3600; return h >= 100 ? Math.round(h).toLocaleString() : h.toFixed(1) }
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function downloadCsv(name, rows) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// Bars of hours watched per day.
function DailyChart({ daily, days }) {
  const span = Math.min(days, 90)
  const map = {}
  for (const d of daily) map[String(d.day).slice(0, 10)] = Number(d.seconds || 0)
  const bars = []
  for (let n = span - 1; n >= 0; n--) {
    const key = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
    bars.push({ key, v: map[key] || 0 })
  }
  const max = Math.max(1, ...bars.map((b) => b.v))
  const w = 600 / bars.length
  const peak = bars.reduce((a, b) => (b.v > a.v ? b : a), bars[0])
  return (
    <div className="chart">
      <svg viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label="Hours watched per day">
        {bars.map((b, i) => {
          const h = Math.max(b.v ? 2 : 0, (b.v / max) * 128)
          return <rect key={b.key} x={i * w + 1} y={134 - h} width={Math.max(1, w - 2)} height={h} rx="1.5" className="bar"><title>{b.key}: {hours(b.v)} hours</title></rect>
        })}
      </svg>
      <div className="chart-axis"><span>{bars[0].key}</span><span>Peak {peak.key}: {hours(peak.v)} hours</span><span>{bars[bars.length - 1].key}</span></div>
    </div>
  )
}

function Analytics({ data, days, setDays, assume, setAssume }) {
  const fById = useMemo(() => Object.fromEntries(data.festivals.map((f) => [f.id, f])), [data.festivals])

  const rev = (row, f) => {
    const real = Number(row.impressions) > 0
    const imp = real ? Number(row.impressions) : (Number(row.seconds) / 3600) * Number(assume.adsPerHour) * (Number(assume.fill) / 100)
    const gross = (imp / 1000) * Number(assume.cpm)
    const pct = Number((f && f.revenue_share_pct) ?? 80)
    return { real, imp, gross, mine: (gross * (100 - pct)) / 100 }
  }

  const rows = data.festivals.map((f) => {
    const o = data.overview.find((x) => x.festival_id === f.id) || { views: 0, seconds: 0, impressions: 0, viewers: 0 }
    const r = rev(o, f)
    return { f, films: data.films.filter((m) => m.festival_id === f.id && m.status === 'published').length, views: Number(o.views), viewers: Number(o.viewers), seconds: Number(o.seconds), ...r }
  }).sort((a, b) => b.seconds - a.seconds)

  const grossTotal = rows.reduce((a, r) => a + r.gross, 0)
  const mineTotal = rows.reduce((a, r) => a + r.mine, 0)
  const anyReal = rows.some((r) => r.real)
  const publishedFests = data.festivals.filter((f) => f.status === 'published').length
  const publishedFilms = data.films.filter((m) => m.status === 'published').length

  const topFilms = data.filmStats.slice(0, 10).map((s) => {
    const film = data.films.find((m) => m.id === s.film_id)
    const f = fById[s.festival_id]
    return { title: film ? film.title : 'Removed film', fest: f ? f.name : '', views: Number(s.views), seconds: Number(s.seconds) }
  })

  const srcTotal = data.sources.reduce((a, s) => a + Number(s.seconds), 0) || 1
  const sourceName = { web: 'Website player', channel: 'Automatic channels', roku: 'Roku app' }

  const issues = []
  for (const f of data.festivals) {
    const mine = data.films.filter((m) => m.festival_id === f.id)
    const pub = mine.filter((m) => m.status === 'published')
    if (!data.admins.some((a) => a.festival_id === f.id)) issues.push(f.name + ' has no administrator linked yet.')
    if (f.status === 'published' && pub.length === 0) issues.push(f.name + ' is published but has no published films.')
    if (f.auto_channel && !pub.some((m) => m.video_url && durationOf(m) > 0)) issues.push(f.name + ' has its automatic channel on, but no film with a video link and a length.')
    for (const l of data.feeds.filter((x) => x.festival_id === f.id && !x.stream_url)) issues.push(f.name + ': live channel "' + l.name + '" has no stream link.')
  }

  const exportCsv = () => downloadCsv('festaview-network-' + days + 'd.csv', [
    ['Festival', 'Status', 'Published films', 'Viewers', 'Views', 'Hours', 'Ad impressions (real or modeled)', 'Est. gross revenue', 'Festaview share'],
    ...rows.map((r) => [r.f.name, r.f.status, r.films, r.viewers, r.views, (r.seconds / 3600).toFixed(2), Math.round(r.imp), r.gross.toFixed(2), r.mine.toFixed(2)]),
  ])

  return (
    <>
      {data.missingSql && <p className="banner-warn">Viewing totals are not available yet. Run the network analytics SQL (migration 007) in Supabase, then refresh.</p>}

      <div className="inline-form">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
        <button className="btn ghost" onClick={exportCsv}>Download CSV</button>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Viewers</span><strong>{num(data.totals.viewers)}</strong><small>unique devices</small></div>
        <div className="kpi"><span>Views</span><strong>{num(data.totals.views)}</strong><small>watch sessions</small></div>
        <div className="kpi"><span>Hours watched</span><strong>{hours(data.totals.seconds)}</strong><small>across the network</small></div>
        <div className="kpi"><span>Est. gross revenue</span><strong>{money(grossTotal)}</strong><small>{anyReal ? 'from real ad impressions' : 'modeled from watch time'}</small></div>
        <div className="kpi"><span>Festaview share</span><strong>{money(mineTotal)}</strong><small>after festival shares</small></div>
        <div className="kpi"><span>Festivals</span><strong>{publishedFests}</strong><small>{data.festivals.length} total</small></div>
        <div className="kpi"><span>Published films</span><strong>{num(publishedFilms)}</strong><small>{num(data.films.length)} total</small></div>
        <div className="kpi"><span>New inquiries</span><strong>{num(data.inquiries)}</strong><small>in this period</small></div>
      </div>

      <div className="panel">
        <h2>Hours watched per day</h2>
        <DailyChart daily={data.daily} days={days} />
      </div>

      <div className="panel">
        <h2>Festivals</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Festival</th><th>Films</th><th>Viewers</th><th>Views</th><th>Hours</th><th>Est. revenue</th><th>Festaview share</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="note">No festivals yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.f.id}>
                  <td>{r.f.name} <span className={'pill ' + r.f.status}>{r.f.status}</span></td>
                  <td>{r.films}</td><td>{num(r.viewers)}</td><td>{num(r.views)}</td><td>{hours(r.seconds)}</td><td>{money(r.gross)}</td><td>{money(r.mine)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td>Total</td><td>{publishedFilms}</td><td>{num(data.totals.viewers)}</td><td>{num(data.totals.views)}</td><td>{hours(data.totals.seconds)}</td><td>{money(grossTotal)}</td><td>{money(mineTotal)}</td></tr></tfoot>}
          </table>
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Top films</h2>
          {topFilms.length === 0 && <p className="note">No viewing yet.</p>}
          <ol className="rank">
            {topFilms.map((t, i) => <li key={i}><span><strong>{t.title}</strong><small>{t.fest}</small></span><span className="muted">{hours(t.seconds)} h | {num(t.views)} views</span></li>)}
          </ol>
        </div>
        <div className="panel">
          <h2>Where people watch</h2>
          {data.sources.length === 0 && <p className="note">No viewing yet.</p>}
          {data.sources.map((s) => (
            <div key={s.source} className="srcbar">
              <div className="srcbar-top"><span>{sourceName[s.source] || s.source}</span><span>{Math.round((Number(s.seconds) / srcTotal) * 100)}%</span></div>
              <div className="srcbar-track"><i style={{ width: (Number(s.seconds) / srcTotal) * 100 + '%' }} /></div>
            </div>
          ))}
          {!data.sources.some((s) => s.source === 'roku') && <p className="note small">No Roku viewing recorded yet. It appears here once the Roku channel is in use.</p>}
        </div>
      </div>

      <div className="panel">
        <h2>Needs attention</h2>
        {issues.length === 0 ? <p className="ok">Everything looks healthy.</p> : <ul className="issues">{issues.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      </div>

      <div className="panel">
        <h2>Revenue assumptions</h2>
        <p className="note small">Until real ad data is connected, revenue is modeled from watch time. Festivals with real ad impressions use those instead. Festaview's share is 100% minus each festival's share (80% by default).</p>
        <div className="inline-form">
          <label className="cpm">Effective CPM ($) <input value={assume.cpm} onChange={(e) => setAssume({ ...assume, cpm: e.target.value })} inputMode="decimal" /></label>
          <label className="cpm">Ads per viewer-hour <input value={assume.adsPerHour} onChange={(e) => setAssume({ ...assume, adsPerHour: e.target.value })} inputMode="decimal" /></label>
          <label className="cpm">Fill rate (%) <input value={assume.fill} onChange={(e) => setAssume({ ...assume, fill: e.target.value })} inputMode="decimal" /></label>
        </div>
      </div>
    </>
  )
}

function Manage({ data, reload, note }) {
  const [name, setName] = useState('')
  const [assign, setAssign] = useState({ email: '', festival: '' })
  const create = async (e) => {
    e.preventDefault()
    try { await api.createFestival({ name, slug: slugify(name) }); setName(''); note('Festival created as a draft.'); reload() } catch (x) { note(x.message, true) }
  }
  const publish = async (f, status) => { try { await api.setFestivalStatus(f.id, status); reload() } catch (x) { note(x.message, true) } }
  const link = async (e) => {
    e.preventDefault()
    try { const r = await api.assignAdmin(assign.email, assign.festival); note(r === 'ok' ? 'Admin linked.' : r, r !== 'ok'); reload() } catch (x) { note(x.message, true) }
  }
  if (api.isDemo) return <p className="note pad">Managing festivals needs a connected database.</p>
  return (
    <>
      <div className="panel">
        <h2>Festivals</h2>
        <ul className="list">
          {data.festivals.map((f) => (
            <li key={f.id}>
              <div><strong>{f.name}</strong><small>/{f.slug} | {data.admins.filter((a) => a.festival_id === f.id).length} admin(s)</small></div>
              <span className={'pill ' + f.status}>{f.status}</span>
              {f.status !== 'published' && <button className="btn ghost" onClick={() => publish(f, 'published')}>Publish</button>}
              {f.status === 'published' && <button className="btn ghost" onClick={() => publish(f, 'draft')}>Unpublish</button>}
              <a className="btn ghost" href={'#/festival/' + f.slug}>View</a>
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
            {data.festivals.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="btn" type="submit">Link</button>
        </form>
      </div>
    </>
  )
}

function Inquiries({ note }) {
  const [list, setList] = useState(null)
  useEffect(() => { if (api.isDemo) { setList([]); return } api.listInquiries().then(setList).catch((e) => note(e.message, true)) }, [note])
  if (list === null) return <p className="note pad">Loading...</p>
  return (
    <div className="panel">
      <h2>Founding festival inquiries</h2>
      {list.length === 0 && <p className="note">No inquiries yet.</p>}
      <ul className="list">
        {list.map((i) => (
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
  )
}

// Network owner console: Festaview-wide analytics, festival management, inquiries.
export default function Network() {
  const [session, setSession] = useState(undefined)
  const [ok, setOk] = useState(api.isDemo ? true : null)
  const [tab, setTab] = useState('analytics')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState(null)
  const [version, setVersion] = useState(0)
  const [assume, setAssume] = useState({ cpm: 12, adsPerHour: 4, fill: 70 })
  const note = useCallback((text, isError) => setMsg({ text, isError: !!isError }), [])
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => { api.getSession().then(setSession); return api.onAuth(setSession) }, [])
  useEffect(() => {
    if (api.isDemo) return
    if (!session) { setOk(null); return }
    api.isPlatformAdmin().then(setOk)
  }, [session])
  useEffect(() => {
    if (!ok) return
    api.networkData(days).then(setData).catch((e) => note(e.message, true))
  }, [ok, days, version, note])

  if (!api.isDemo) {
    if (session === undefined) return <p className="note pad">Loading...</p>
    if (!session) return <p className="note pad">Sign in first at <a href="#/admin">the festival login</a>, then return to this page.</p>
    if (ok === null) return <p className="note pad">Checking access...</p>
    if (!ok) return <p className="note pad">This account is not a network owner.</p>
  }

  return (
    <div>
      <div className="admin-head">
        <h1>Network console</h1>
        {api.isDemo && <span className="pill draft">Demo data</span>}
      </div>
      <nav className="tabs">
        {[['analytics', 'Analytics'], ['festivals', 'Festivals'], ['inquiries', 'Inquiries']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(null) }}>{label}</button>
        ))}
      </nav>
      {msg && <p className={msg.isError ? 'error' : 'ok'}>{msg.text}</p>}
      {!data && <p className="note pad">Loading...</p>}
      {data && tab === 'analytics' && <Analytics data={data} days={days} setDays={setDays} assume={assume} setAssume={setAssume} />}
      {data && tab === 'festivals' && <Manage data={data} reload={reload} note={note} />}
      {tab === 'inquiries' && <Inquiries note={note} />}
    </div>
  )
}
