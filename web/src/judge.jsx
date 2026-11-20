import { useCallback, useEffect, useState } from 'react'
import { getSession, onAuth, signOut } from './adminData.js'
import { AuthBox } from './submit.jsx'
import { myJudgingFestivals, myJudgingEntries, saveScore } from './judgingData.js'
import { RECS, SCORE_MIN, SCORE_MAX, weightedTotal, isComplete } from './judging.js'
import { submissionFileUrl } from './submissions.js'
import { useSeo } from './seo.js'

// Private judging portal at /judge: a judge sees only the festivals they are invited to and the entries assigned to them.
const DETAIL_LABELS = [['logline', 'Logline'], ['production_company', 'Production company'], ['producer', 'Producer'], ['writer', 'Writer'], ['cinematographer', 'Cinematographer'], ['editor', 'Editor'], ['composer', 'Composer'], ['cast', 'Cast'],
  ['shooting_format', 'Shot on'], ['aspect_ratio', 'Aspect ratio'], ['premiere_status', 'Premiere status'], ['director_bio', 'Director bio'], ['director_statement', 'Director statement'], ['trailer_url', 'Trailer']]
const FILE_KIND = { film: 'Film', poster: 'Poster', still: 'Still', subtitles: 'Subtitles', other: 'File' }

function EntryCard({ entry, round, onSaved, setMsg }) {
  const rubric = round.rubric
  const open = round.status === 'open'
  const mine = entry.mine || { scores: {}, comment: '', recommendation: '', final: false }
  const [scores, setScores] = useState(mine.scores || {})
  const [comment, setComment] = useState(mine.comment || '')
  const [rec, setRec] = useState(mine.recommendation || '')
  const [busy, setBusy] = useState(false)
  const d = entry.details || {}
  const total = weightedTotal(rubric, scores)

  const save = async (final) => {
    setBusy(true)
    try {
      await saveScore(entry.id, { scores, comment, recommendation: rec || null, final })
      setMsg(final ? '"' + entry.title + '" submitted. You can still change it until judging closes.' : 'Draft saved for "' + entry.title + '".')
      onSaved()
    } catch (x) { setMsg(x.message, true) } finally { setBusy(false) }
  }
  const openFile = async (f) => {
    const u = await submissionFileUrl(f.path)
    if (u) window.open(u, '_blank', 'noopener'); else setMsg('Could not open that file.', true)
  }
  const uploaded = (entry.files || []).filter((f) => f.kind === 'film')

  return (
    <div className="panel">
      <h3>{entry.title} <span className={'pill ' + (mine.final ? 'published' : 'draft')}>{mine.final ? 'Scored' : mine.updated_at ? 'Draft' : 'Not scored'}</span></h3>
      <p className="note small">{entry.director} | {entry.runtime_min} min{entry.year ? ' | ' + entry.year : ''}{entry.country ? ' | ' + entry.country : ''}{entry.language ? ' | ' + entry.language : ''}{entry.genre ? ' | ' + entry.genre : ''} | {entry.category}</p>
      <p>{entry.synopsis}</p>
      <div className="actions">
        {entry.screener_url && entry.screener_url !== 'uploaded' && <a className="btn" href={entry.screener_url} target="_blank" rel="noreferrer noopener">Watch screener</a>}
        {uploaded.map((f) => <button key={f.path} type="button" className="btn" onClick={() => openFile(f)}>Watch uploaded film</button>)}
        {entry.screener_password && <span className="note">Screener password: <code>{entry.screener_password}</code></span>}
      </div>
      <details>
        <summary className="note small">Credits and details</summary>
        <div className="note small">
          <dl>{DETAIL_LABELS.filter(([k]) => d[k]).map(([k, l]) => <div key={k}><dt><strong>{l}</strong></dt><dd>{d[k]}</dd></div>)}</dl>
          {(entry.files || []).filter((f) => f.kind !== 'film').map((f) => <button key={f.path} type="button" className="btn ghost small" onClick={() => openFile(f)}>{(FILE_KIND[f.kind] || 'File') + ': ' + f.name}</button>)}
        </div>
      </details>
      <h4>Your score</h4>
      {rubric.map((c) => (
        <label className="field" key={c.id}>
          <span>{c.name}{c.weight !== 1 ? ' (weight ' + c.weight + ')' : ''}</span>
          <select value={scores[c.id] || ''} disabled={!open} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value ? parseInt(e.target.value, 10) : undefined })}>
            <option value="">Not scored</option>
            {Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      ))}
      {total != null && <p className="note">Weighted total: <strong>{total}</strong> out of 10</p>}
      <label className="field">
        <span>Recommendation</span>
        <select value={rec} disabled={!open} onChange={(e) => setRec(e.target.value)}>
          <option value="">Choose</option>
          {Object.entries(RECS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Private comments (only the festival directors see these)</span>
        <textarea rows={4} value={comment} disabled={!open} onChange={(e) => setComment(e.target.value)} />
      </label>
      {open ? (
        <div className="actions">
          <button className="btn ghost" type="button" disabled={busy} onClick={() => save(false)}>Save draft</button>
          <button className="btn" type="button" disabled={busy || !isComplete(rubric, scores) || !rec} onClick={() => save(true)}>{mine.final ? 'Update my score' : 'Submit my score'}</button>
        </div>
      ) : <p className="note">Judging is closed. Your scores are locked.</p>}
    </div>
  )
}

function FestivalJudging({ festival, onBack }) {
  const [data, setData] = useState(null)
  const [msg, setMsgState] = useState(null)
  const [filter, setFilter] = useState('')
  const setMsg = useCallback((text, isError) => setMsgState({ text, isError: !!isError }), [])
  const refresh = useCallback(() => myJudgingEntries(festival.festival_id).then(setData).catch((e) => setMsg(e.message, true)), [festival.festival_id, setMsg])
  useEffect(() => { refresh() }, [refresh])
  const entries = data ? data.entries.filter((e) => !filter || (filter === 'todo' ? !(e.mine && e.mine.final) : e.mine && e.mine.final)) : []
  return (
    <div>
      <button className="btn ghost" type="button" onClick={onBack}>All my festivals</button>
      <h2>{festival.name}</h2>
      {msg && <p className={msg.isError ? 'error' : 'ok'} role="status">{msg.text}</p>}
      {!data && !msg && <p className="note">Loading...</p>}
      {data && (
        <>
          {data.round.status === 'closed' && <p className="banner">Judging is closed. You can read your scores but not change them.</p>}
          {data.round.instructions && <div className="note"><strong>From the festival:</strong> {data.round.instructions}</div>}
          <p className="note">Scores run from {SCORE_MIN} to {SCORE_MAX}. Your scores and comments are private: other judges and the filmmakers never see them. You can save a draft and keep editing until judging closes.</p>
          <div className="actions">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
              <option value="">All my entries ({data.entries.length})</option>
              <option value="todo">Still to score</option>
              <option value="done">Scored</option>
            </select>
          </div>
          {entries.length === 0 && <p className="note">No entries to show.</p>}
          {entries.map((e) => <EntryCard key={e.id + ':' + (e.mine ? e.mine.updated_at : '')} entry={e} round={data.round} onSaved={refresh} setMsg={setMsg} />)}
        </>
      )}
    </div>
  )
}

export default function JudgePage() {
  useSeo({ title: 'Judging', robots: 'noindex,nofollow' })
  const [session, setSession] = useState(undefined)
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  useEffect(() => { getSession().then(setSession); return onAuth(setSession) }, [])
  useEffect(() => { if (session) myJudgingFestivals().then(setList).catch((e) => setErr(e.message)); else setList(null) }, [session])
  return (
    <section className="block">
      <h1>Judging</h1>
      {session === undefined && <p className="note">Loading...</p>}
      {session === null && <AuthBox title="Judge sign in" intro="Sign in with the email address your festival invited. If you do not have a Festaview account yet, create one with that same email." onDone={() => getSession().then(setSession)} />}
      {session && (
        <>
          <div className="actions"><button className="btn ghost" type="button" onClick={() => signOut()}>Sign out</button></div>
          {err && <p className="error">{err}</p>}
          {!list && !err && <p className="note">Loading...</p>}
          {list && list.length === 0 && <p className="note">You are not invited to judge any festival right now, or judging has not opened yet. Check that you signed in with the email address the festival invited.</p>}
          {list && !pick && list.map((f) => (
            <div className="panel" key={f.festival_id}>
              <h2>{f.name}</h2>
              <p className="note">{f.status === 'open' ? 'Judging is open' : 'Judging is closed'} | {f.scored} of {f.assigned} scored</p>
              <button className="btn" type="button" onClick={() => setPick(f)}>{f.status === 'open' ? 'Judge entries' : 'View my scores'}</button>
            </div>
          ))}
          {pick && <FestivalJudging festival={pick} onBack={() => { setPick(null); myJudgingFestivals().then(setList).catch(() => {}) }} />}
        </>
      )}
    </section>
  )
}
