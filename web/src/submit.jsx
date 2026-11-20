import { useCallback, useEffect, useState } from 'react'
import { getSession, onAuth, signIn, signUp, signOut } from './adminData.js'
import { claimAccess } from './data.js'
import { loadSubmissionBoard, getQuote, createSubmission, updateSubmission, withdrawSubmission, listMySubmissions, payForSubmission, getProfile, saveProfile, uploadSubmissionFile, removeSubmissionFile, listMyFilms, saveMyFilm, deleteMyFilm, filmToForm } from './submissions.js'
import { money, fmtDate, submissionState, STATUS_LABEL, PAY_LABEL } from './submissionRules.js'
import { submitPath, festivalPath } from './paths.js'
import { navigate } from './router.js'
import { useSeo } from './seo.js'
import { NotFoundPage } from './pages.jsx'

function useAuth() {
  const [session, setSession] = useState(undefined)
  useEffect(() => { getSession().then(setSession); return onAuth(setSession) }, [])
  return [session, () => getSession().then(setSession)]
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

// One account for every festival. Sign in or create it right where the filmmaker is.
export function AuthBox({ onDone, intro, title }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [create, setCreate] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo('')
    try {
      if (create) {
        await signUp(email, password)
        setInfo('Account created. If we asked you to confirm your email, open the message we sent, then come back here and sign in.')
        setCreate(false)
      } else { await signIn(email, password); onDone() }
    } catch (x) { setErr(x.message) }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>{create ? 'Create your account' : (title || 'Filmmaker sign in')}</h2>
      <p className="note">{intro || 'One Festaview account lets you submit to any festival on the platform and track every entry.'}</p>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
      <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} minLength={6} required /></Field>
      {err && <p className="error">{err}</p>}
      {info && <p className="ok">{info}</p>}
      <div className="actions">
        <button className="btn" type="submit">{create ? 'Create account' : 'Sign in'}</button>
        <button className="btn ghost" type="button" onClick={() => { setCreate(!create); setErr(''); setInfo('') }}>{create ? 'I have an account' : 'Create account'}</button>
      </div>
    </form>
  )
}

const deadlineText = (cat) => (cat.current ? (cat.current.deadline ? cat.current.name + ' fee until ' + fmtDate(cat.current.deadline) : cat.current.name + ' fee') : 'Closed')

function FeeTable({ cat }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Fee step</th><th>Deadline</th><th>Fee</th></tr></thead>
        <tbody>
          {cat.tiers.map((t) => (
            <tr key={t.id} className={cat.current && cat.current.id === t.id ? 'on' : ''}>
              <td>{t.name}{cat.current && cat.current.id === t.id ? ' (now)' : ''}</td>
              <td>{t.deadline ? fmtDate(t.deadline) : 'Final deadline'}</td>
              <td>{money(t.fee_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- /submit : festivals accepting entries
export function SubmitIndexPage() {
  useSeo({ title: 'Submit Your Film to Festivals', description: 'Create one Festaview account, find film festivals that are accepting submissions, enter your short or feature, and pay the entry fee by card.' })
  const [board, setBoard] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { loadSubmissionBoard().then(setBoard).catch(() => setErr('Could not load festivals right now. Please refresh in a moment.')) }, [])
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Submit your film</span></nav>
      <h1>Submit your film</h1>
      <p className="lede">One Festaview account, every festival on the platform. Choose where to enter, fill out one form for each festival, pay the entry fee by card, and follow the result.</p>
      <div className="actions"><a className="btn" href="/filmmaker">My submissions</a></div>
      {board && board.demo && <p className="banner">Demo content. Connect Supabase to show real festivals.</p>}
      {err && <p className="error">{err}</p>}
      {!board && !err && <p className="note">Loading...</p>}
      {board && board.entries.length === 0 && <p className="note">No festival is accepting submissions right now. Check back soon, or <a href="/festivals">browse festivals</a>.</p>}
      {board && board.entries.length > 0 && (
        <div className="grid">
          {board.entries.map(({ festival: f, state, categories }) => {
            const fees = categories.map((c) => c.current && c.current.fee_cents).filter((x) => x != null)
            const next = categories.map((c) => c.current && c.current.deadline).filter(Boolean).sort()[0]
            return (
              <article className="panel" key={f.id}>
                <h2><a href={submitPath(f)}>{f.name}</a></h2>
                {f.tagline && <p className="note">{f.tagline}</p>}
                <p>{categories.map((c) => c.name).join(', ')}</p>
                <p className="note">
                  {state === 'not_open' ? 'Opens ' + fmtDate(f.submissions_opens_at) : state === 'closed' ? 'Closed' : (fees.length ? 'Fees from ' + money(Math.min(...fees)) : '') + (f.submissions_closes_at ? ' | Final deadline ' + fmtDate(f.submissions_closes_at) : '')}
                  {state === 'open' && next && f.submissions_closes_at && next !== f.submissions_closes_at ? ' | Next price change ' + fmtDate(next) : ''}
                </p>
                <div className="actions"><a className="btn" href={submitPath(f)}>{state === 'open' ? 'Submit' : 'View details'}</a></div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

const EMPTY = {
  title: '', director: '', runtime_min: '', year: '', synopsis: '', logline: '', screener_url: '', screener_password: '', poster_url: '', country: '', language: '', genre: '',
  producer: '', writer: '', cinematographer: '', editor: '', composer: '', cast: '', production_company: '',
  shooting_format: '', aspect_ratio: '', color: '', premiere_status: '', student: false, first_time: false, previous_festivals: '', awards: '',
  subtitles: false, trailer_url: '', director_bio: '', director_statement: '', website: '', imdb_url: '', social: '', phone: '', rights_confirmed: false, files: [],
}
const fmtSize = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB')

// Uploads one or more files of a kind into the entry. The list of uploaded files lives in f.files.
function FileBox({ label, hint, kind, accept, multiple, f, set }) {
  const [pct, setPct] = useState(null)
  const [err, setErr] = useState('')
  const mine = (f.files || []).filter((x) => x.kind === kind)
  const add = async (e) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    if (!list.length) return
    setErr('')
    let next = multiple ? [...(f.files || [])] : (f.files || []).filter((x) => x.kind !== kind)
    for (const file of list) {
      try {
        setPct(0)
        const up = await uploadSubmissionFile(file, kind, setPct)
        next = [...next, up]
        set('files', next)
      } catch (x) { setErr(x.message); break }
    }
    setPct(null)
  }
  const remove = async (x) => {
    set('files', (f.files || []).filter((y) => y.path !== x.path))
    removeSubmissionFile(x.path).catch(() => {})
  }
  return (
    <div className="field">
      <span>{label}</span>
      {mine.map((x) => <p className="note" key={x.path}>{x.name} ({fmtSize(x.size)}) <button type="button" className="btn ghost small" onClick={() => remove(x)}>Remove</button></p>)}
      {(multiple || mine.length === 0) && pct === null && <input type="file" accept={accept} multiple={multiple} onChange={add} />}
      {pct !== null && <progress value={pct} max="100" aria-label="Upload progress">{pct}%</progress>}
      {pct !== null && <small>Uploading {pct}%. Keep this page open until it finishes.</small>}
      {hint && <small>{hint}</small>}
      {err && <small className="error">{err}</small>}
    </div>
  )
}

function EntryFields({ f, set, draft }) {
  const bind = (k) => ({ value: f[k] || '', onChange: (e) => set(k, e.target.value) })
  const tick = (k) => ({ checked: !!f[k], onChange: (e) => set(k, e.target.checked) })
  return (
    <>
      <h3>About the film</h3>
      <Field label="Film title"><input {...bind('title')} maxLength={200} required /></Field>
      <Field label="Director (or directors)"><input {...bind('director')} maxLength={200} required={!draft} /></Field>
      <div className="two">
        <Field label="Running time (minutes)"><input type="number" min="1" max="1000" {...bind('runtime_min')} required={!draft} /></Field>
        <Field label="Year completed"><input type="number" min="1890" max="2100" {...bind('year')} /></Field>
      </div>
      <Field label="Logline" hint="One sentence that sells the film."><input {...bind('logline')} maxLength={300} /></Field>
      <Field label="Synopsis" hint="A few sentences about the film."><textarea rows={4} {...bind('synopsis')} required={!draft} /></Field>
      <div className="two">
        <Field label="Country of production"><input {...bind('country')} maxLength={80} /></Field>
        <Field label="Language"><input {...bind('language')} maxLength={80} /></Field>
      </div>
      <div className="two">
        <Field label="Genre"><input {...bind('genre')} maxLength={80} /></Field>
        <Field label="Production company"><input {...bind('production_company')} maxLength={200} /></Field>
      </div>

      <h3>Your film</h3>
      <FileBox label="Upload your film" kind="film" accept="video/*,.mkv,.mov,.mp4" f={f} set={set} hint="MP4 or MOV is best. Large films can take a while to upload. If your file is too large, use a private screener link below instead." />
      <Field label="Or a screener link" hint="A Vimeo, YouTube or other private link the festival can watch. It must stay live through the decision date. Needed if you do not upload the film."><input type="url" placeholder="https://" {...bind('screener_url')} /></Field>
      <Field label="Screener password (if any)"><input {...bind('screener_password')} maxLength={100} autoComplete="off" /></Field>
      <Field label="Trailer link (optional)"><input type="url" placeholder="https://" {...bind('trailer_url')} /></Field>
      <FileBox label="Subtitles (.srt or .vtt, optional)" kind="subtitles" accept=".srt,.vtt,.txt" f={f} set={set} />
      <label className="check"><input type="checkbox" {...tick('subtitles')} /> The film has English subtitles</label>

      <h3>Artwork</h3>
      <FileBox label="Poster" kind="poster" accept="image/*" f={f} set={set} />
      <Field label="Poster link (optional, if it is online)"><input type="url" placeholder="https://" {...bind('poster_url')} /></Field>
      <FileBox label="Film stills" kind="still" accept="image/*" multiple f={f} set={set} hint="Add a few frames from the film for the festival's program." />

      <h3>Cast and crew</h3>
      <div className="two">
        <Field label="Producer"><input {...bind('producer')} maxLength={300} /></Field>
        <Field label="Writer"><input {...bind('writer')} maxLength={300} /></Field>
        <Field label="Cinematographer"><input {...bind('cinematographer')} maxLength={300} /></Field>
        <Field label="Editor"><input {...bind('editor')} maxLength={300} /></Field>
        <Field label="Composer"><input {...bind('composer')} maxLength={300} /></Field>
      </div>
      <Field label="Main cast"><textarea rows={2} {...bind('cast')} /></Field>

      <h3>Technical and background</h3>
      <div className="two">
        <Field label="Shot on (camera or format)"><input {...bind('shooting_format')} maxLength={200} /></Field>
        <Field label="Aspect ratio"><input {...bind('aspect_ratio')} placeholder="16:9" maxLength={40} /></Field>
        <Field label="Color"><select {...bind('color')}><option value="">Choose</option><option value="color">Color</option><option value="bw">Black and white</option><option value="both">Both</option></select></Field>
        <Field label="Premiere status"><select {...bind('premiere_status')}><option value="">Choose</option><option value="world">World premiere</option><option value="international">International premiere</option><option value="national">National premiere</option><option value="regional">Regional premiere</option><option value="none">Has played elsewhere</option></select></Field>
      </div>
      <label className="check"><input type="checkbox" {...tick('student')} /> Student film</label>
      <label className="check"><input type="checkbox" {...tick('first_time')} /> First-time filmmaker</label>
      <Field label="Festivals this film has played at (optional)"><textarea rows={2} {...bind('previous_festivals')} /></Field>
      <Field label="Awards (optional)"><textarea rows={2} {...bind('awards')} /></Field>

      <h3>About the filmmaker</h3>
      <Field label="Director biography"><textarea rows={3} {...bind('director_bio')} /></Field>
      <Field label="Director's statement (optional)"><textarea rows={3} {...bind('director_statement')} /></Field>
      <div className="two">
        <Field label="Website (optional)"><input type="url" placeholder="https://" {...bind('website')} /></Field>
        <Field label="IMDb page (optional)"><input type="url" placeholder="https://" {...bind('imdb_url')} /></Field>
        <Field label="Instagram or other social (optional)"><input {...bind('social')} maxLength={300} /></Field>
        <Field label="Phone (optional, for the festival only)"><input {...bind('phone')} maxLength={60} /></Field>
      </div>
      <FileBox label="Script (optional)" kind="script" accept=".pdf,.doc,.docx,.txt" f={f} set={set} />
      <FileBox label="Press kit or other documents (optional)" kind="presskit" accept=".pdf,.doc,.docx,.zip,image/*" multiple f={f} set={set} />

      <label className="check"><input type="checkbox" {...tick('rights_confirmed')} required={!draft} /> I confirm I hold the rights to submit this film, and that the information above is true.</label>
    </>
  )
}

const needsScreener = (f) => !String(f.screener_url || '').trim() && !(f.files || []).some((x) => x.kind === 'film')

// ---------------------------------------------------------------- /festival/<slug>/submit
export function FestivalSubmitPage({ slug }) {
  const [board, setBoard] = useState(null)
  const [session, refreshSession] = useAuth()
  const [catId, setCatId] = useState('')
  const [code, setCode] = useState('')
  const [quote, setQuote] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [made, setMade] = useState(null)
  const [films, setFilms] = useState([])
  useEffect(() => { if (session) listMyFilms().then(setFilms).catch(() => {}) }, [session])
  useEffect(() => { loadSubmissionBoard().then(setBoard).catch(() => setBoard({ failed: true, entries: [], festivals: [], categories: [], tiers: [] })) }, [])
  const entry = board && board.entries.find((x) => x.festival.slug === slug)
  const fest = entry ? entry.festival : board && board.festivals.find((x) => x.slug === slug)
  useSeo(fest
    ? { title: 'Submit to ' + fest.name, description: 'Submit your film to ' + fest.name + '. See categories, fees and deadlines, then enter and pay online.', canonicalPath: submitPath(fest) }
    : { title: 'Submit your film' })

  const cats = entry ? entry.categories : []
  const cat = cats.find((c) => c.id === catId)
  const state = entry ? entry.state : 'closed'
  useEffect(() => {
    if (!catId || !fest) { setQuote(null); return undefined }
    let stop = false
    const t = setTimeout(() => { getQuote(fest.id, catId, code, board).then((q) => { if (!stop) setQuote(q) }) }, 250)
    return () => { stop = true; clearTimeout(t) }
  }, [catId, code, fest, board])

  if (!board) return <p className="note pad">Loading...</p>
  if (!fest) return board.failed ? <p className="note pad">Could not load this festival right now. Please refresh in a moment.</p> : <NotFoundPage />

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const go = async (e) => {
    e.preventDefault()
    setErr('')
    if (!cat) { setErr('Choose a category.'); return }
    if (needsScreener(f)) { setErr('Upload your film or enter a screener link.'); return }
    setBusy(true)
    try {
      const created = await createSubmission(fest.id, catId, f, code, board)
      if (created.payment_status !== 'unpaid') { navigate('/filmmaker?entered=1'); return }
      setMade(created)
      const pay = await payForSubmission(created.id, code)
      if (pay.ok && pay.url) { window.location.href = pay.url; return }
      if (pay.ok && pay.done) { navigate('/filmmaker?entered=1'); return }
      setErr((pay.message || 'The payment could not be started.') + ' Your entry is saved. You can finish paying from My submissions.')
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/submit">Submit your film</a> / <span>{fest.name}</span></nav>
      <h1>Submit to {fest.name}</h1>
      {fest.tagline && <p className="lede">{fest.tagline}</p>}
      {state === 'not_open' && <p className="note">Submissions open {fmtDate(fest.submissions_opens_at)}.</p>}
      {state === 'closed' && <p className="note">This festival is not accepting submissions right now. <a href={festivalPath(fest)}>Back to the festival page</a>.</p>}
      {fest.submission_notes && <p>{fest.submission_notes}</p>}
      {cats.length > 0 && (
        <>
          <h2>Categories and fees</h2>
          {cats.map((c) => (
            <div key={c.id}>
              <h3>{c.name}{c.max_runtime_min ? ' (up to ' + c.max_runtime_min + ' min)' : ''}</h3>
              {c.description && <p className="note">{c.description}</p>}
              <FeeTable cat={c} />
            </div>
          ))}
          {fest.submissions_closes_at && <p className="note">Final deadline {fmtDate(fest.submissions_closes_at)}. All deadlines are the end of the day, UTC.</p>}
        </>
      )}
      {state === 'open' && session === undefined && <p className="note">Loading...</p>}
      {state === 'open' && session === null && <AuthBox onDone={refreshSession} intro="Sign in or create your free filmmaker account to enter. You can use the same account for every festival." />}
      {state === 'open' && session && (
        <form className="panel" onSubmit={go}>
          <h2>Your entry</h2>
          <Field label="Category">
            <select value={catId} onChange={(e) => setCatId(e.target.value)} required>
              <option value="">Choose a category</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.current ? money(c.current.fee_cents) + ' (' + deadlineText(c) + ')' : 'closed'}</option>)}
            </select>
          </Field>
          {films.length > 0 ? (
            <Field label="Choose your film" hint="Fills in the form from the film you saved. You can still change anything.">
              <select value="" onChange={(e) => { const x = films.find((q) => q.id === e.target.value); if (x) setF({ ...EMPTY, ...filmToForm(x) }) }}><option value="">Choose a film</option>{films.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
            </Field>
          ) : <p className="note">Tip: add your film first on <a href="/filmmaker">My submissions</a>, then it fills in here for every festival.</p>}
          <EntryFields f={f} set={set} />
          <Field label="Waiver or discount code (optional)"><input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} autoComplete="off" /></Field>
          {quote && quote.ok && (
            <p className="ok">
              Entry fee: <strong>{money(quote.amount_cents)}</strong>{quote.tier_name ? ' (' + quote.tier_name + ' fee)' : ''}
              {code && (quote.code_ok ? ' - code applied.' : ' - that code is not valid.')}
            </p>
          )}
          {quote && !quote.ok && catId && <p className="error">Submissions are closed for this category.</p>}
          {err && <p className="error">{err}</p>}
          {made && <p className="note">Entry saved. <a href="/filmmaker">Go to My submissions</a> to finish paying.</p>}
          <div className="actions">
            <button className="btn" type="submit" disabled={busy || !cat}>{busy ? 'Working...' : quote && quote.ok && quote.amount_cents > 0 ? 'Continue to payment' : 'Submit entry'}</button>
            <button className="btn ghost" type="button" onClick={() => signOut()}>Sign out</button>
          </div>
          <p className="note small">Payments are handled by Stripe. Entry fees are set by the festival.</p>
        </form>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- /filmmaker : my submissions
function MyEntry({ s, names, refresh, setMsg }) {
  const [edit, setEdit] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }))
  const pay = async () => {
    setBusy(true)
    const r = await payForSubmission(s.id, code)
    if (r.ok && r.url) { window.location.href = r.url; return }
    if (r.ok && r.done) { setMsg('Your entry is complete.'); refresh() } else setMsg(r.message || 'The payment could not be started.', true)
    setBusy(false)
  }
  const save = async (e) => {
    e.preventDefault()
    if (needsScreener(edit)) { setMsg('Upload your film or enter a screener link.', true); return }
    try { await updateSubmission(s.id, edit); setEdit(null); setMsg('Entry updated.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const withdraw = async () => {
    if (!window.confirm('Withdraw "' + s.title + '"? Refunds are decided by the festival.')) return
    try { await withdrawSubmission(s.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const paid = ['paid', 'free', 'waived'].includes(s.payment_status)
  return (
    <article className="panel">
      <h3>{s.title}</h3>
      <p>
        <span className={'pill ' + (s.status === 'accepted' ? 'published' : 'draft')}>{STATUS_LABEL[s.status] || s.status}</span>{' '}
        <span className={'pill ' + (paid ? 'published' : 'draft')}>{PAY_LABEL[s.payment_status] || s.payment_status}</span>
      </p>
      <p className="note">{names.festival(s.festival_id)} | {names.category(s.category_id)}{s.tier_name ? ' | ' + s.tier_name + ' fee' : ''}{s.amount_due_cents > 0 ? ' | ' + money(s.amount_due_cents) : ''}</p>
      {s.status === 'accepted' && <p className="ok">Congratulations, your film was accepted.</p>}
      {s.payment_status === 'unpaid' && s.status !== 'withdrawn' && (
        <div className="actions">
          <input placeholder="Waiver code (optional)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} aria-label="Waiver code" />
          <button className="btn" type="button" disabled={busy} onClick={pay}>{busy ? 'Working...' : 'Pay entry fee'}</button>
        </div>
      )}
      {edit ? (
        <form onSubmit={save}>
          <EntryFields f={edit} set={set} />
          <div className="actions"><button className="btn" type="submit">Save changes</button><button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      ) : (
        <div className="actions">
          {s.status === 'submitted' && <button className="btn ghost" type="button" onClick={() => setEdit({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s[k] == null ? EMPTY[k] : s[k]])), ...(s.details || {}), screener_url: s.screener_url === 'uploaded' ? '' : s.screener_url || '', files: s.files || [] })}>Edit details</button>}
          {(s.status === 'submitted' || s.status === 'under_review') && <button className="btn ghost danger" type="button" onClick={withdraw}>Withdraw</button>}
        </div>
      )}
    </article>
  )
}

function MyFilms({ setMsg }) {
  const [films, setFilms] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { listMyFilms().then(setFilms).catch((e) => setMsg(e.message, true)) }, [setMsg])
  useEffect(() => { load() }, [load])
  const set = (k, v) => setEdit((p) => ({ ...p, [k]: v }))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await saveMyFilm(edit.id, edit); setEdit(null); setMsg('Film saved. Now you can enter it into any festival.'); load() } catch (x) { setMsg(x.message, true) }
    setBusy(false)
  }
  const del = async (x) => {
    if (!window.confirm('Remove "' + x.title + '" from My films? Entries already sent to festivals are not affected.')) return
    try { await deleteMyFilm(x.id); load() } catch (err) { setMsg(err.message, true) }
  }
  return (
    <div className="panel">
      <h2>Step 1: Your films</h2>
      <p className="note">Add your film once, with its video, poster, credits and details. Then enter it into any festival without typing it again.</p>
      {films && films.length === 0 && !edit && <p className="note">You have not added a film yet.</p>}
      {films && films.map((x) => (
        <p key={x.id}><strong>{x.title}</strong> <span className="note small">{(x.data && x.data.director) || ''}{x.data && x.data.runtime_min ? ' | ' + x.data.runtime_min + ' min' : ''} | {(x.files || []).length} files</span>{' '}
          <button type="button" className="btn ghost small" onClick={() => setEdit({ ...EMPTY, ...filmToForm(x), id: x.id })}>Edit</button>{' '}
          <a className="btn small" href="/submit">Enter a festival</a>{' '}
          <button type="button" className="btn ghost danger small" onClick={() => del(x)}>Remove</button></p>
      ))}
      {!edit && <div className="actions"><button type="button" className="btn" onClick={() => setEdit({ ...EMPTY })}>Add a film</button></div>}
      {edit && (
        <form onSubmit={save}>
          <h3>{edit.id ? 'Edit film' : 'New film'}</h3>
          <EntryFields f={edit} set={set} draft />
          <div className="actions"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save film'}</button><button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
    </div>
  )
}

export function FilmmakerPage({ search }) {
  useSeo({ title: 'My submissions', robots: 'noindex,nofollow' })
  const [session, refreshSession] = useAuth()
  const [subs, setSubs] = useState(null)
  const [board, setBoard] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pf, setPf] = useState({ name: '', country: '' })
  const [msg, setMsgState] = useState(null)
  const setMsg = useCallback((text, isError) => setMsgState({ text, isError: !!isError }), [])
  const params = new URLSearchParams(search || '')
  const sid = params.get('session_id')

  const refresh = useCallback(() => {
    listMySubmissions().then(setSubs).catch((e) => setMsg(e.message, true))
  }, [setMsg])
  useEffect(() => { if (session) { refresh(); loadSubmissionBoard().then(setBoard).catch(() => {}); getProfile().then((p) => { setProfile(p); if (p) setPf({ name: p.name || '', country: p.country || '' }) }) } }, [session, refresh])

  // Back from Stripe: the payment is recorded by the webhook a moment later, so check a few times.
  useEffect(() => {
    if (!sid || !session) return undefined
    let stop = false, tries = 0
    const tick = async () => {
      const r = await claimAccess(sid)
      if (stop) return
      if (r.status === 'ready') { setMsg('Payment received. Your entry is complete.'); refresh(); return }
      if (++tries < 12) setTimeout(tick, 2500); else setMsg('Your payment is still being confirmed. Refresh this page in a minute.')
    }
    tick()
    return () => { stop = true }
  }, [sid, session, refresh, setMsg])
  useEffect(() => { if (params.get('entered')) setMsg('Your entry was submitted.') }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const names = {
    festival: (id) => { const x = board && board.festivals.find((q) => q.id === id); return x ? x.name : 'Festival' },
    category: (id) => { const x = board && board.categories.find((q) => q.id === id); return x ? x.name : 'Category' },
  }
  const saveMe = async (e) => {
    e.preventDefault()
    try { await saveProfile(pf); setProfile({ ...pf }); setMsg('Profile saved.') } catch (x) { setMsg(x.message, true) }
  }

  return (
    <section className="block">
      <h1>My submissions</h1>
      {session === undefined && <p className="note">Loading...</p>}
      {session === null && <AuthBox onDone={refreshSession} />}
      {session && (
        <>
          {msg && <p className={msg.isError ? 'error' : 'ok'} role="status">{msg.text}</p>}
          <MyFilms setMsg={setMsg} />
          <div className="actions">
            <a className="btn" href="/submit">Step 2: Find festivals to enter</a>
            <button className="btn ghost" type="button" onClick={() => signOut()}>Sign out</button>
          </div>
          <form className="panel" onSubmit={saveMe}>
            <h2>Filmmaker profile</h2>
            <div className="two">
              <Field label="Your name"><input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} minLength={2} required /></Field>
              <Field label="Country"><input value={pf.country} onChange={(e) => setPf({ ...pf, country: e.target.value })} /></Field>
            </div>
            <div className="actions"><button className="btn ghost" type="submit">{profile ? 'Update profile' : 'Save profile'}</button></div>
          </form>
          <h2>Your entries</h2>
          {!subs && <p className="note">Loading...</p>}
          {subs && subs.length === 0 && <p className="note">You have not entered any festivals yet. <a href="/submit">Find a festival</a>.</p>}
          {subs && subs.map((s) => <MyEntry key={s.id} s={s} names={names} refresh={refresh} setMsg={setMsg} />)}
        </>
      )}
    </section>
  )
}
