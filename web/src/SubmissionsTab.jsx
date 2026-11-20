import { useCallback, useEffect, useState } from 'react'
import * as api from './adminData.js'
import { csvText } from './submissionRules.js'
import { submissionFileUrl } from './submissions.js'

// Festival admin: filmmaker submissions (settings, categories and fee steps, waiver codes, entries).
const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : '')
const endOfDay = (d) => (d ? d + 'T23:59:59Z' : null)
const startOfDay = (d) => (d ? d + 'T00:00:00Z' : null)
const dollars = (c) => (c ? (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)) : '0')
const toCents = (v) => Math.round(parseFloat(String(v || '0').replace(/[$,]/g, '')) * 100) || 0
const EMPTY_CAT = { name: '', description: '', max_runtime_min: '', active: true, tiers: [{ name: 'Early', deadline: '', fee: '' }, { name: 'Regular', deadline: '', fee: '' }] }
const EMPTY_WAIVER = { code: '', percent_off: '100', max_uses: '', expires: '', note: '' }
const SUB_STATUS = { submitted: 'Submitted', under_review: 'Under review', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

const DETAIL_LABELS = [['logline', 'Logline'], ['production_company', 'Production company'], ['producer', 'Producer'], ['writer', 'Writer'], ['cinematographer', 'Cinematographer'], ['editor', 'Editor'], ['composer', 'Composer'], ['cast', 'Cast'],
  ['shooting_format', 'Shot on'], ['aspect_ratio', 'Aspect ratio'], ['color', 'Color'], ['premiere_status', 'Premiere status'], ['previous_festivals', 'Played at'], ['awards', 'Awards'],
  ['director_bio', 'Director bio'], ['director_statement', 'Director statement'], ['trailer_url', 'Trailer'], ['website', 'Website'], ['imdb_url', 'IMDb'], ['social', 'Social'], ['phone', 'Phone']]
const FILE_KIND = { film: 'Film', poster: 'Poster', still: 'Still', subtitles: 'Subtitles', script: 'Script', presskit: 'Press kit', other: 'File' }

// Everything the filmmaker filled in, with private file downloads (links last an hour).
function EntryDetails({ s, setMsg }) {
  const d = s.details || {}
  const open = async (f) => {
    const u = await submissionFileUrl(f.path)
    if (u) window.open(u, '_blank', 'noopener'); else setMsg('Could not open that file.', true)
  }
  const flags = [d.student && 'Student film', d.first_time && 'First-time filmmaker', d.subtitles && 'English subtitles'].filter(Boolean)
  return (
    <div className="note small">
      <dl>
        {DETAIL_LABELS.filter(([k]) => d[k]).map(([k, l]) => <div key={k}><dt><strong>{l}</strong></dt><dd>{d[k]}</dd></div>)}
      </dl>
      {flags.length > 0 && <p>{flags.join(' | ')}</p>}
      {(s.files || []).length > 0 && (
        <p>{s.files.map((f) => <button key={f.path} type="button" className="btn ghost small" onClick={() => open(f)}>{(FILE_KIND[f.kind] || 'File') + ': ' + f.name}</button>)}</p>
      )}
    </div>
  )
}

function downloadCsv(name, rows) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function SubmissionsTab({ festival, setMsg, onFestival }) {
  const [d, setD] = useState({ categories: [], tiers: [], waivers: [], submissions: [] })
  const [set, setSet] = useState({ open: !!festival.submissions_open, opens: dateOnly(festival.submissions_opens_at), closes: dateOnly(festival.submissions_closes_at), notes: festival.submission_notes || '' })
  const [cat, setCat] = useState(null)
  const [w, setW] = useState(EMPTY_WAIVER)
  const [fStatus, setFStatus] = useState('')
  const [fCat, setFCat] = useState('')
  const [q, setQ] = useState('')

  const refresh = useCallback(() => api.submissionAdminData(festival.id).then(setD).catch((e) => setMsg(e.message, true)), [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const saveSettings = async (e) => {
    e.preventDefault()
    if (set.closes && new Date(endOfDay(set.closes)).getTime() < Date.now()) {
      setMsg('The final deadline ' + set.closes + ' has already passed, so filmmakers could not enter. Choose a later date, or clear the date.', true)
      return
    }
    try {
      const opens_at = startOfDay(set.opens), closes_at = endOfDay(set.closes)
      await api.saveSubmissionSettings(festival.id, { open: set.open, opens_at, closes_at, notes: set.notes })
      // Keep the festival the admin is holding in step, so the form shows what was saved when you come back to this tab.
      if (onFestival) onFestival({ submissions_open: !!set.open, submissions_opens_at: opens_at || null, submissions_closes_at: closes_at || null, submission_notes: set.notes || null })
      setMsg('Submission settings saved.')
    } catch (x) { setMsg(x.message, true) }
  }
  const editCat = (c) => setCat({
    id: c.id, name: c.name, description: c.description || '', max_runtime_min: c.max_runtime_min || '', active: c.active,
    tiers: d.tiers.filter((t) => t.category_id === c.id).map((t) => ({ name: t.name, deadline: dateOnly(t.deadline), fee: dollars(t.fee_cents) })),
  })
  const setTier = (i, k, v) => setCat((p) => ({ ...p, tiers: p.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }))
  const saveCat = async (e) => {
    e.preventDefault()
    try {
      await api.saveSubmissionCategory(festival.id, {
        ...cat, max_runtime_min: parseInt(cat.max_runtime_min, 10) || null,
        tiers: cat.tiers.map((t) => ({ name: t.name, deadline: endOfDay(t.deadline), fee_cents: toCents(t.fee) })),
      })
      setCat(null); setMsg('Category saved.'); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const delCat = async (c) => {
    if (!window.confirm('Remove "' + c.name + '"? If it already has entries it is hidden instead of deleted.')) return
    try { const r = await api.deleteSubmissionCategory(c.id); setMsg(r === 'hidden' ? 'Category hidden (it has entries).' : 'Category deleted.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const saveWaiver = async (e) => {
    e.preventDefault()
    try {
      await api.saveSubmissionWaiver(festival.id, { code: w.code, percent_off: parseInt(w.percent_off, 10), max_uses: parseInt(w.max_uses, 10) || null, expires_at: endOfDay(w.expires), note: w.note })
      setW(EMPTY_WAIVER); setMsg('Code saved.'); refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const toggleWaiver = async (x) => {
    try { await api.saveSubmissionWaiver(festival.id, { ...x, active: !x.active }); refresh() } catch (err) { setMsg(err.message, true) }
  }
  const delWaiver = async (x) => {
    if (!window.confirm('Delete code ' + x.code + '?')) return
    try { await api.deleteSubmissionWaiver(x.id); refresh() } catch (err) { setMsg(err.message, true) }
  }
  const status = async (s, st) => {
    try { await api.setSubmissionStatus(s.id, st); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const toFilms = async (s) => {
    try { await api.addSubmissionToFilms(s.id); setMsg('"' + s.title + '" was added to your Films as a draft. Add its video there to publish it.'); refresh() } catch (x) { setMsg(x.message, true) }
  }

  const catName = (id) => { const c = d.categories.find((x) => x.id === id); return c ? c.name : '' }
  const shown = d.submissions.filter((s) => (!fStatus || s.status === fStatus) && (!fCat || s.category_id === fCat) &&
    (!q || (s.title + ' ' + s.director + ' ' + (s.country || '')).toLowerCase().includes(q.toLowerCase())))
  const exportCsv = () => downloadCsv('submissions-' + festival.slug + '.csv', [
    ['Title', 'Director', 'Category', 'Fee step', 'Runtime (min)', 'Year', 'Country', 'Language', 'Genre', 'Status', 'Payment', 'Paid ($)', 'Contact email', 'Screener link', 'Screener password', 'Uploaded files', 'Logline', 'Producer', 'Writer', 'Cinematographer', 'Cast', 'Premiere status', 'Trailer', 'Website', 'Director bio', 'Synopsis', 'Submitted', 'Note'],
    ...shown.map((s) => [s.title, s.director, catName(s.category_id), s.tier_name, s.runtime_min, s.year, s.country, s.language, s.genre, SUB_STATUS[s.status], s.payment_status, dollars(s.amount_paid_cents), s.contact_email, s.screener_url, s.screener_password, (s.files || []).length, (s.details || {}).logline, (s.details || {}).producer, (s.details || {}).writer, (s.details || {}).cinematographer, (s.details || {}).cast, (s.details || {}).premiere_status, (s.details || {}).trailer_url, (s.details || {}).website, (s.details || {}).director_bio, s.synopsis, String(s.created_at || '').slice(0, 10), s.admin_note]),
  ])
  const anyFee = d.tiers.some((t) => t.fee_cents > 0)

  return (
    <div>
      <form className="panel" onSubmit={saveSettings}>
        <h2>Submission settings</h2>
        <p className="note">Filmmakers enter from <a href={'/festival/' + festival.slug + '/submit'}>/festival/{festival.slug}/submit</a>. Your festival must be published.</p>
        {(!set.open || d.categories.length === 0) && <p className="banner">Filmmakers cannot enter yet. To open your festival for entries: 1) add at least one category with a fee below, 2) tick Accept submissions, 3) Save settings.</p>}
        <label className="check"><input type="checkbox" checked={set.open} onChange={(e) => setSet({ ...set, open: e.target.checked })} /> Accept submissions</label>
        <div className="two">
          <Field label="Opens (optional)"><input type="date" value={set.opens} onChange={(e) => setSet({ ...set, opens: e.target.value })} /></Field>
          <Field label="Final deadline (optional)" hint="Submissions close at the end of this day (UTC)."><input type="date" value={set.closes} onChange={(e) => setSet({ ...set, closes: e.target.value })} /></Field>
        </div>
        <Field label="Notes for filmmakers (rules, eligibility, premiere requirements)"><textarea rows={3} value={set.notes} onChange={(e) => setSet({ ...set, notes: e.target.value })} /></Field>
        {anyFee && !festival.payments_enabled && <p className="error">You have paid fees but card payments are off for this festival. Turn them on in Access and sales, or filmmakers cannot pay.</p>}
        <div className="actions"><button className="btn" type="submit">Save settings</button></div>
      </form>

      <div className="panel">
        <h2>Categories and fees</h2>
        <p className="note">Each category has fee steps by deadline, for example Early, Regular and Late. The step whose deadline has not passed yet applies. Use fee 0 for free entry. Entry fees are paid by card, and Festaview keeps its platform fee.</p>
        {d.categories.length === 0 && <p className="note">No categories yet.</p>}
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {d.categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.active ? '' : ' (hidden)'}{c.max_runtime_min ? ' - up to ' + c.max_runtime_min + ' min' : ''}</td>
                  <td>{d.tiers.filter((t) => t.category_id === c.id).map((t) => t.name + ' $' + dollars(t.fee_cents) + (t.deadline ? ' to ' + dateOnly(t.deadline) : '')).join('  |  ')}</td>
                  <td><button className="btn ghost" type="button" onClick={() => editCat(c)}>Edit</button> <button className="btn ghost danger" type="button" onClick={() => delCat(c)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cat && <div className="actions"><button className="btn ghost" type="button" onClick={() => setCat(EMPTY_CAT)}>Add category</button></div>}
        {cat && (
          <form onSubmit={saveCat}>
            <h3>{cat.id ? 'Edit category' : 'New category'}</h3>
            <div className="two">
              <Field label="Name"><input value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="Short film" required /></Field>
              <Field label="Longest film allowed (minutes, optional)"><input type="number" min="1" value={cat.max_runtime_min} onChange={(e) => setCat({ ...cat, max_runtime_min: e.target.value })} /></Field>
            </div>
            <Field label="Description (optional)"><input value={cat.description} onChange={(e) => setCat({ ...cat, description: e.target.value })} /></Field>
            <h4>Fee steps</h4>
            {cat.tiers.map((t, i) => (
              <div className="two" key={i}>
                <Field label="Step name and deadline">
                  <input value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} placeholder="Early" required />
                  <input type="date" value={t.deadline} onChange={(e) => setTier(i, 'deadline', e.target.value)} aria-label="Deadline (empty for the final step)" />
                </Field>
                <Field label="Fee in dollars (0 = free)">
                  <input value={t.fee} onChange={(e) => setTier(i, 'fee', e.target.value)} placeholder="35" inputMode="decimal" />
                  {cat.tiers.length > 1 && <button className="btn ghost" type="button" onClick={() => setCat({ ...cat, tiers: cat.tiers.filter((_, j) => j !== i) })}>Remove step</button>}
                </Field>
              </div>
            ))}
            <p className="note small">Leave the deadline empty on the last step to keep it open until the final deadline.</p>
            {cat.tiers.length < 6 && <button className="btn ghost" type="button" onClick={() => setCat({ ...cat, tiers: [...cat.tiers, { name: 'Late', deadline: '', fee: '' }] })}>Add fee step</button>}
            <label className="check"><input type="checkbox" checked={cat.active} onChange={(e) => setCat({ ...cat, active: e.target.checked })} /> Visible to filmmakers</label>
            <div className="actions"><button className="btn" type="submit">Save category</button><button className="btn ghost" type="button" onClick={() => setCat(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Waiver and discount codes</h2>
        <p className="note">Give a code to a filmmaker for percent off the fee. 100 percent makes entry free.</p>
        {d.waivers.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Off</th><th>Used</th><th>Expires</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {d.waivers.map((x) => (
                  <tr key={x.id}>
                    <td><code>{x.code}</code>{x.active ? '' : ' (off)'}</td><td>{x.percent_off}%</td><td>{x.uses}{x.max_uses ? ' / ' + x.max_uses : ''}</td><td>{dateOnly(x.expires_at) || '-'}</td><td>{x.note || ''}</td>
                    <td><button className="btn ghost" type="button" onClick={() => toggleWaiver(x)}>{x.active ? 'Turn off' : 'Turn on'}</button> <button className="btn ghost danger" type="button" onClick={() => delWaiver(x)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={saveWaiver}>
          <div className="two">
            <Field label="Code"><input value={w.code} onChange={(e) => setW({ ...w, code: e.target.value })} placeholder="FRIENDS" minLength={3} required /></Field>
            <Field label="Percent off"><input type="number" min="1" max="100" value={w.percent_off} onChange={(e) => setW({ ...w, percent_off: e.target.value })} required /></Field>
          </div>
          <div className="two">
            <Field label="Limit (uses, optional)"><input type="number" min="1" value={w.max_uses} onChange={(e) => setW({ ...w, max_uses: e.target.value })} /></Field>
            <Field label="Expires (optional)"><input type="date" value={w.expires} onChange={(e) => setW({ ...w, expires: e.target.value })} /></Field>
          </div>
          <Field label="Note (who it is for)"><input value={w.note} onChange={(e) => setW({ ...w, note: e.target.value })} /></Field>
          <div className="actions"><button className="btn ghost" type="submit">Add code</button></div>
        </form>
      </div>

      <div className="panel">
        <h2>Entries ({d.submissions.length})</h2>
        <div className="actions">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{Object.entries(SUB_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input placeholder="Search title or director" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" type="button" onClick={exportCsv} disabled={!shown.length}>Export CSV ({shown.length})</button>
        </div>
        {shown.length === 0 && <p className="note">No entries yet. Only paid, free and waived entries appear here.</p>}
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.title}</strong><br /><span className="note small">{s.director} | {s.runtime_min} min{s.year ? ' | ' + s.year : ''}{s.country ? ' | ' + s.country : ''}</span>
                    {(s.details && Object.keys(s.details).length > 0 || (s.files || []).length > 0) && <details><summary className="note small">Full entry details</summary><EntryDetails s={s} setMsg={setMsg} /></details>}</td>
                  <td>{catName(s.category_id)}<br /><span className="note small">{s.tier_name || ''} {s.payment_status === 'paid' ? '$' + dollars(s.amount_paid_cents) : s.payment_status}</span></td>
                  <td><span className={'pill ' + (s.status === 'accepted' ? 'published' : 'draft')}>{SUB_STATUS[s.status]}</span></td>
                  <td>
                    {s.screener_url && s.screener_url !== 'uploaded' && <a className="btn ghost" href={s.screener_url} target="_blank" rel="noreferrer noopener">Watch screener</a>}
                    {(s.files || []).filter((f) => f.kind === 'film').map((f) => <button key={f.path} type="button" className="btn ghost" onClick={async () => { const u = await submissionFileUrl(f.path); if (u) window.open(u, '_blank', 'noopener'); else setMsg('Could not open the film.', true) }}>Watch uploaded film</button>)}
                    {s.screener_password && <span className="note small"> Password: {s.screener_password}</span>}
                  </td>
                  <td>
                    {s.status !== 'withdrawn' && (
                      <>
                        {s.status !== 'under_review' && <button className="btn ghost" type="button" onClick={() => status(s, 'under_review')}>Under review</button>}{' '}
                        {s.status !== 'accepted' && <button className="btn" type="button" onClick={() => status(s, 'accepted')}>Accept</button>}{' '}
                        {s.status !== 'declined' && <button className="btn ghost danger" type="button" onClick={() => status(s, 'declined')}>Decline</button>}{' '}
                        {s.status === 'accepted' && (s.film_id ? <span className="note small">In your Films</span> : <button className="btn ghost" type="button" onClick={() => toFilms(s)}>Add to Films</button>)}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note small">Screener links belong to the filmmakers and are never shown to the public. An accepted film is added to your Films as a draft without its screener.</p>
      </div>
    </div>
  )
}
