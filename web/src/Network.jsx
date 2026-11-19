import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './adminData.js'
import { durationOf } from './channels.js'
import CinemaAds from './CinemaAds.jsx'

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

// Owner-only: turns card payments on for a festival and sets Festaview's fee on paid sales.
function PaymentsControl({ f, reload, note }) {
  const [on, setOn] = useState(!!f.payments_enabled)
  const [fee, setFee] = useState(String(f.ticket_fee_pct ?? 0))
  const save = async () => {
    const pct = parseFloat(fee)
    if (!(pct >= 0 && pct <= 100)) { note('Fee must be between 0 and 100.', true); return }
    try { await api.setFestivalPayments(f.id, on, pct); note('Payments saved for ' + f.name + '.'); reload() } catch (x) { note(x.message, true) }
  }
  return (
    <span className="paymini">
      <label><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Payments</label>
      <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" aria-label="Fee percent" />%
      <button type="button" className="btn ghost small" onClick={save}>Save</button>
    </span>
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
              <PaymentsControl f={f} reload={reload} note={note} />
              {f.status !== 'published' && <button className="btn ghost" onClick={() => publish(f, 'published')}>Publish</button>}
              {f.status === 'published' && <button className="btn ghost" onClick={() => publish(f, 'draft')}>Unpublish</button>}
              <a className="btn ghost" href={'/festival/' + f.slug}>View</a>
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
// Owner controls for the virtual theater: booking rules, screens and approvals.
function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function CinemaOwner({ data, note }) {
  const [d, setD] = useState(null)
  const [settings, setSettings] = useState(null)
  const [newScreen, setNewScreen] = useState('')
  const reload = useCallback(() => api.cinemaOwnerData().then((r) => { setD(r); setSettings(r.settings) }).catch((e) => note(e.message, true)), [note])
  useEffect(() => { if (!api.isDemo) reload() }, [reload])
  if (api.isDemo) return <p className="note pad">The theater controls need a connected database.</p>
  if (!d || !settings) return <p className="note pad">Loading...</p>

  const fest = (id) => (data.festivals.find((f) => f.id === id) || {}).name || 'Festival'
  const screen = (id) => (d.screens.find((s) => s.id === id) || {}).name || 'Screen'
  const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  const pending = d.showings.filter((s) => s.status === 'pending')
  const scheduled = d.showings.filter((s) => s.status === 'scheduled')

  const saveSettings = async (e) => {
    e.preventDefault()
    try { await api.saveCinemaSettings({ ...settings, min_notice_hours: parseInt(settings.min_notice_hours, 10) || 0, max_upcoming: parseInt(settings.max_upcoming, 10) || 1 }); note('Theater rules saved.'); reload() } catch (x) { note(x.message, true) }
  }
  const approve = async (s, yes) => { try { await api.approveShowing(s.id, yes); note(yes ? 'Approved. It is on the marquee.' : 'Rejected.'); reload() } catch (x) { note(x.message, true) } }
  const cancel = async (s) => { if (!window.confirm('Cancel "' + s.title + '"?')) return; try { await api.cancelShowing(s.id); note('Cancelled.'); reload() } catch (x) { note(x.message, true) } }
  const addScreen = async () => {
    const next = Math.max(0, ...d.screens.map((s) => s.number)) + 1
    try { await api.addCinemaScreen(next, newScreen.trim() || 'Screen ' + next); setNewScreen(''); note('Screen added.'); reload() } catch (x) { note(x.message, true) }
  }
  const toggleScreen = async (s) => { try { await api.updateCinemaScreen(s.id, { active: !s.active }); reload() } catch (x) { note(x.message, true) } }

  return (
    <>
      <div className="panel">
        <h2>Booking rules</h2>
        <form onSubmit={saveSettings}>
          <label className="check"><input type="checkbox" checked={!!settings.require_approval} onChange={(e) => setSettings({ ...settings, require_approval: e.target.checked })} /> New showings from festivals wait for my approval (your own bookings are always approved)</label>
          <div className="two">
            <Field label="Minimum notice (hours)" hint="How far ahead a festival must book."><input value={settings.min_notice_hours} onChange={(e) => setSettings({ ...settings, min_notice_hours: e.target.value })} inputMode="numeric" /></Field>
            <Field label="Most upcoming showings per festival"><input value={settings.max_upcoming} onChange={(e) => setSettings({ ...settings, max_upcoming: e.target.value })} inputMode="numeric" /></Field>
          </div>
          <button className="btn" type="submit">Save rules</button>
        </form>
      </div>

      <div className="panel">
        <h2>Waiting for approval ({pending.length})</h2>
        <ul className="list">
          {pending.length === 0 && <li><span className="note">Nothing is waiting.</span></li>}
          {pending.map((s) => (
            <li key={s.id}>
              <div><strong>{s.title}</strong><small>{fest(s.festival_id)} | {screen(s.screen_id)} | {when(s.starts_at)} | {s.runtime_min} min</small></div>
              <button type="button" className="btn" onClick={() => approve(s, true)}>Approve</button>
              <button type="button" className="btn ghost danger" onClick={() => approve(s, false)}>Reject</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>Screens</h2>
        <ul className="list">
          {d.screens.map((s) => (
            <li key={s.id}>
              <div><strong>{s.name}</strong><small>Screen {s.number}</small></div>
              <span className={'pill ' + (s.active ? 'published' : 'draft')}>{s.active ? 'open' : 'closed'}</span>
              <button type="button" className="btn ghost" onClick={() => toggleScreen(s)}>{s.active ? 'Close screen' : 'Open screen'}</button>
            </li>
          ))}
        </ul>
        <div className="inline-form">
          <input placeholder="Name for the next screen (optional)" value={newScreen} onChange={(e) => setNewScreen(e.target.value)} />
          <button type="button" className="btn ghost" onClick={addScreen}>Add a screen</button>
        </div>
      </div>

      <div className="panel">
        <h2>Upcoming showings ({scheduled.length})</h2>
        <ul className="list">
          {scheduled.length === 0 && <li><span className="note">No showings are scheduled.</span></li>}
          {scheduled.map((s) => (
            <li key={s.id}>
              <div><strong>{s.title}</strong><small>{fest(s.festival_id)} | {screen(s.screen_id)} | {when(s.starts_at)}</small></div>
              <a className="btn ghost" href={'/cinema/' + s.id}>View</a>
              <button type="button" className="btn ghost danger" onClick={() => cancel(s)}>Cancel</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// Owner-only: the box office cut. Every festival has a default rate (20%); any pass, ticket or showing can have its own.
function TicketRates({ data, note }) {
  const [d, setD] = useState(null)
  const [edit, setEdit] = useState({})
  const reload = useCallback(() => api.ticketRatesData().then(setD).catch((e) => note(e.message, true)), [note])
  useEffect(() => { if (!api.isDemo) reload() }, [reload])
  if (api.isDemo) return <p className="note pad">Ticket rates need a connected database.</p>
  if (!d) return <p className="note pad">Loading...</p>
  const fest = (id) => data.festivals.find((f) => f.id === id) || {}
  const money = (c) => '$' + (c / 100).toFixed(2)
  const rows = [
    ...d.showings.map((s) => ({ key: 'showing:' + s.id, kind: 'showing', id: s.id, festival_id: s.festival_id, label: 'Theater showing: ' + s.title, price: s.price_cents, pct: s.fee_pct })),
    ...d.products.map((p) => ({ key: 'product:' + p.id, kind: 'product', id: p.id, festival_id: p.festival_id, label: (p.event_id ? 'Event ticket: ' : p.film_id ? 'Film ticket: ' : 'Pass: ') + p.name, price: p.price_cents, pct: p.fee_pct })),
  ]
  const save = async (r) => {
    const raw = edit[r.key]
    const pct = raw === undefined ? undefined : String(raw).trim() === '' ? null : parseFloat(raw)
    if (pct === undefined) return
    if (pct !== null && !(pct >= 0 && pct <= 100)) { note('The rate must be between 0 and 100.', true); return }
    try { await api.setTicketRate(r.kind, r.id, pct); note(pct === null ? 'Back to the festival default.' : 'Rate saved.'); setEdit((e) => { const n = { ...e }; delete n[r.key]; return n }); reload() } catch (x) { note(x.message, true) }
  }
  return (
    <div className="panel">
      <h2>Box office cut</h2>
      <p className="note">Festaview keeps this percentage of every ticket price. Each festival has a default (set under Festivals, now 20%). Set a different rate for one title below, or leave it empty to use the festival's default. Card processing fees are separate and charged by Stripe. Festivals can see their rate but cannot change it.</p>
      <ul className="list">
        {rows.length === 0 && <li><span className="note">No paid titles yet.</span></li>}
        {rows.map((r) => {
          const f = fest(r.festival_id)
          const eff = r.pct != null ? Number(r.pct) : Number(f.ticket_fee_pct || 0)
          const shown = edit[r.key] !== undefined ? edit[r.key] : r.pct != null ? String(r.pct) : ''
          return (
            <li key={r.key}>
              <div><strong>{r.label}</strong><small>{f.name || 'Festival'} | {money(r.price)} ticket | Festaview earns {money(Math.round(r.price * eff / 100))} per sale at {eff}%{r.pct == null ? ' (festival default)' : ''}</small></div>
              <input value={shown} onChange={(e) => setEdit({ ...edit, [r.key]: e.target.value })} inputMode="decimal" placeholder={String(f.ticket_fee_pct ?? 20)} aria-label="Rate percent" style={{ width: '5rem' }} />%
              <button type="button" className="btn ghost small" onClick={() => save(r)} disabled={edit[r.key] === undefined}>Save</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

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
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), msg.isError ? 12000 : 5000)
    return () => clearTimeout(t)
  }, [msg])
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
    if (!session) return <p className="note pad">Sign in first at <a href="/admin">the festival login</a>, then return to this page.</p>
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
        {[['analytics', 'Analytics'], ['festivals', 'Festivals'], ['cinema', 'Festaview Cinemas'], ['ads', 'Cinema ads'], ['rates', 'Box office cut'], ['inquiries', 'Inquiries']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(null) }}>{label}</button>
        ))}
      </nav>
      {msg && (
        <div className={'toast ' + (msg.isError ? 'bad' : 'good')} role="status" aria-live="polite">
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">Close</button>
        </div>
      )}
      {!data && <p className="note pad">Loading...</p>}
      {data && tab === 'analytics' && <Analytics data={data} days={days} setDays={setDays} assume={assume} setAssume={setAssume} />}
      {data && tab === 'festivals' && <Manage data={data} reload={reload} note={note} />}
      {data && tab === 'rates' && <TicketRates data={data} note={note} />}
      {data && tab === 'cinema' && <CinemaOwner data={data} note={note} />}
      {tab === 'ads' && <CinemaAds note={note} />}
      {tab === 'inquiries' && <Inquiries note={note} />}
    </div>
  )
}
