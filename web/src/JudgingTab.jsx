import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './adminData.js'
import { judgingAdminData, saveJudgingRound, saveJudge, removeJudge } from './judgingData.js'
import { DEFAULT_RUBRIC, RECS, validateRubric, weightedTotal, summarize } from './judging.js'
import { csvText } from './submissionRules.js'

// Festival admin: invite judges, set the rubric, open and close judging, and read every score.
const SUB_STATUS = { submitted: 'Submitted', under_review: 'Under review', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }
const ROUND_LABEL = { draft: 'Not open yet', open: 'Open: judges can score', closed: 'Closed: scores are locked' }
const EMPTY_JUDGE = { id: null, email: '', name: '', category_ids: [], entry_ids: [], active: true }

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function downloadCsv(name, rows) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const inScope = (j, s) => j.active && (j.category_ids.includes(s.category_id) || j.entry_ids.includes(s.id))

export default function JudgingTab({ festival, setMsg }) {
  const [d, setD] = useState({ categories: [], submissions: [] })
  const [jd, setJd] = useState({ round: null, judges: [], scores: [] })
  const [rubric, setRubric] = useState(DEFAULT_RUBRIC.map((c) => ({ ...c })))
  const [instructions, setInstructions] = useState('')
  const [judge, setJudge] = useState(null)
  const [fCat, setFCat] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [minScore, setMinScore] = useState('')
  const [sort, setSort] = useState('score_desc')

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.submissionAdminData(festival.id), judgingAdminData(festival.id)])
      setD(a); setJd(b)
      if (b.round) { setRubric(b.round.rubric); setInstructions(b.round.instructions || '') }
    } catch (e) { setMsg(e.message, true) }
  }, [festival.id, setMsg])
  useEffect(() => { refresh() }, [refresh])

  const status = jd.round ? jd.round.status : 'draft'
  const started = jd.scores.length > 0
  const catName = (id) => { const c = d.categories.find((x) => x.id === id); return c ? c.name : '' }
  const judgeName = (id) => { const j = jd.judges.find((x) => x.id === id); return j ? (j.name || j.email) : 'Removed judge' }
  const liveRubric = jd.round ? jd.round.rubric : rubric
  const entries = useMemo(() => d.submissions.filter((s) => s.status !== 'withdrawn'), [d.submissions])

  const rows = useMemo(() => entries.map((s) => {
    const mine = jd.scores.filter((x) => x.submission_id === s.id)
    const sum = summarize(liveRubric, mine)
    return { s, mine, sum, assigned: jd.judges.filter((j) => inScope(j, s)).length }
  }), [entries, jd, liveRubric])

  const shown = useMemo(() => {
    const min = parseFloat(minScore)
    const r = rows.filter(({ s, sum }) => (!fCat || s.category_id === fCat) && (!fStatus || s.status === fStatus) && (!Number.isFinite(min) || (sum.weighted != null && sum.weighted >= min)))
    const byScore = (x) => (x.sum.weighted == null ? -1 : x.sum.weighted)
    r.sort((a, b) => (sort === 'score_asc' ? byScore(a) - byScore(b) : sort === 'title' ? a.s.title.localeCompare(b.s.title) : sort === 'judged' ? b.sum.judged - a.sum.judged : byScore(b) - byScore(a)))
    return r
  }, [rows, fCat, fStatus, minScore, sort])

  const saveRound = async (st) => {
    try {
      const clean = validateRubric(rubric)
      await saveJudgingRound(festival.id, st, clean, instructions)
      setMsg(st === 'open' ? 'Judging is open. Judges can sign in at /judge.' : st === 'closed' ? 'Judging is closed. Judges can no longer change scores.' : 'Judging settings saved.')
      refresh()
    } catch (x) { setMsg(x.message, true) }
  }
  const setCrit = (i, k, v) => setRubric((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)))
  const toggle = (key, id) => setJudge((p) => ({ ...p, [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id] }))
  const submitJudge = async (e) => {
    e.preventDefault()
    try { await saveJudge(festival.id, judge); setJudge(null); setMsg('Judge saved. They sign in at /judge with that email address.'); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const dropJudge = async (j) => {
    if (!window.confirm('Remove ' + (j.name || j.email) + '? Their scores are deleted too.')) return
    try { await removeJudge(j.id); refresh() } catch (x) { setMsg(x.message, true) }
  }
  const setStatus = async (s, st) => { try { await api.setSubmissionStatus(s.id, st); refresh() } catch (x) { setMsg(x.message, true) } }
  const toFilms = async (s) => {
    try { await api.addSubmissionToFilms(s.id); setMsg('"' + s.title + '" is in your Films as a draft.'); refresh() } catch (x) { setMsg(x.message, true) }
  }

  const exportCsv = () => downloadCsv('judging-' + festival.slug + '.csv', [
    ['Title', 'Director', 'Category', 'Status', 'Judges scored', 'Weighted average', ...liveRubric.map((c) => 'Avg ' + c.name), 'Accept', 'Maybe', 'Decline', 'Judge', 'Judge weighted total', ...liveRubric.map((c) => c.name), 'Recommendation', 'Comment'],
    ...shown.flatMap(({ s, mine, sum }) => {
      const head = [s.title, s.director, catName(s.category_id), SUB_STATUS[s.status], sum.judged, sum.weighted, ...liveRubric.map((c) => sum.perCriterion[c.id]), sum.recs.accept, sum.recs.maybe, sum.recs.decline]
      const done = mine.filter((x) => x.final)
      return done.length === 0 ? [[...head]] : done.map((x) => [...head, judgeName(x.judge_id), weightedTotal(liveRubric, x.scores), ...liveRubric.map((c) => x.scores[c.id]), RECS[x.recommendation] || '', x.comment || ''])
    }),
  ])

  return (
    <div>
      <div className="panel">
        <h2>Judging round</h2>
        <p className="note">Status: <strong>{ROUND_LABEL[status]}</strong>. Judges sign in at <a href="/judge">/judge</a> with a Festaview account that uses the email you invite. They only see the entries you assign, and never see other judges' scores. Filmmakers never see judge names, scores or comments.</p>
        <h3>Scoring criteria</h3>
        <p className="note small">Each criterion is scored 1 to 10. A higher weight counts more toward the total. {started ? 'Scoring has started, so criteria are locked.' : ''}</p>
        {rubric.map((c, i) => (
          <div className="two" key={i}>
            <Field label={'Criterion ' + (i + 1)}><input value={c.name} disabled={started} onChange={(e) => setCrit(i, 'name', e.target.value)} placeholder="Story" /></Field>
            <Field label="Weight (0.1 to 10)">
              <input type="number" step="0.1" min="0.1" max="10" value={c.weight} disabled={started} onChange={(e) => setCrit(i, 'weight', e.target.value)} />
              {!started && rubric.length > 1 && <button className="btn ghost" type="button" onClick={() => setRubric(rubric.filter((_, j) => j !== i))}>Remove</button>}
            </Field>
          </div>
        ))}
        {!started && rubric.length < 10 && <button className="btn ghost" type="button" onClick={() => setRubric([...rubric, { id: '', name: '', weight: 1 }])}>Add criterion</button>}
        <Field label="Instructions for judges (optional)"><textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => saveRound(status)}>Save settings</button>
          {status !== 'open' && <button className="btn" type="button" onClick={() => saveRound('open')}>{status === 'closed' ? 'Reopen judging' : 'Open judging'}</button>}
          {status === 'open' && <button className="btn ghost danger" type="button" onClick={() => saveRound('closed')}>Close judging</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Judges ({jd.judges.length})</h2>
        {jd.judges.length === 0 && <p className="note">No judges yet. Invite one below, then tell them to sign in at festaview.com/judge.</p>}
        {jd.judges.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Judge</th><th>Sees</th><th>Scored</th><th></th></tr></thead>
              <tbody>
                {jd.judges.map((j) => {
                  const assigned = entries.filter((s) => inScope(j, s)).length
                  const done = jd.scores.filter((x) => x.judge_id === j.id && x.final).length
                  return (
                    <tr key={j.id}>
                      <td>{j.name || j.email}{j.name ? <><br /><span className="note small">{j.email}</span></> : null}{j.active ? '' : ' (off)'}</td>
                      <td>{j.category_ids.map(catName).filter(Boolean).join(', ') || 'No whole categories'}{j.entry_ids.length ? ' + ' + j.entry_ids.length + ' chosen' : ''}<br /><span className="note small">{assigned} entries</span></td>
                      <td>{done} / {assigned}</td>
                      <td><button className="btn ghost" type="button" onClick={() => setJudge({ ...j, name: j.name || '' })}>Edit</button> <button className="btn ghost danger" type="button" onClick={() => dropJudge(j)}>Remove</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!judge && <div className="actions"><button className="btn ghost" type="button" onClick={() => setJudge({ ...EMPTY_JUDGE, category_ids: d.categories.filter((c) => c.active).map((c) => c.id) })}>Invite a judge</button></div>}
        {judge && (
          <form onSubmit={submitJudge}>
            <h3>{judge.id ? 'Edit judge' : 'Invite a judge'}</h3>
            <div className="two">
              <Field label="Email" hint="They must sign in with this exact email."><input type="email" value={judge.email} onChange={(e) => setJudge({ ...judge, email: e.target.value })} required /></Field>
              <Field label="Name (optional)"><input value={judge.name} onChange={(e) => setJudge({ ...judge, name: e.target.value })} /></Field>
            </div>
            <h4>Categories this judge sees (every entry in them)</h4>
            {d.categories.map((c) => <label className="check" key={c.id}><input type="checkbox" checked={judge.category_ids.includes(c.id)} onChange={() => toggle('category_ids', c.id)} /> {c.name}</label>)}
            <h4>Extra single entries (from other categories)</h4>
            <div className="table-wrap" style={{ maxHeight: 200, overflow: 'auto' }}>
              {entries.filter((s) => !judge.category_ids.includes(s.category_id)).map((s) => <label className="check" key={s.id}><input type="checkbox" checked={judge.entry_ids.includes(s.id)} onChange={() => toggle('entry_ids', s.id)} /> {s.title} ({catName(s.category_id)})</label>)}
              {entries.filter((s) => !judge.category_ids.includes(s.category_id)).length === 0 && <p className="note small">None.</p>}
            </div>
            <label className="check"><input type="checkbox" checked={judge.active} onChange={(e) => setJudge({ ...judge, active: e.target.checked })} /> Can judge</label>
            <div className="actions"><button className="btn" type="submit">Save judge</button><button className="btn ghost" type="button" onClick={() => setJudge(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Scores by entry</h2>
        <div className="actions">
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{Object.entries(SUB_STATUS).filter(([k]) => k !== 'withdrawn').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input type="number" min="1" max="10" step="0.1" placeholder="Minimum score" value={minScore} onChange={(e) => setMinScore(e.target.value)} aria-label="Minimum weighted score" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="score_desc">Highest score first</option><option value="score_asc">Lowest score first</option><option value="judged">Most judged</option><option value="title">Title</option>
          </select>
          <button className="btn ghost" type="button" onClick={exportCsv} disabled={!shown.length}>Export CSV ({shown.length})</button>
        </div>
        {shown.length === 0 && <p className="note">No entries match.</p>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Entry</th><th>Score</th><th>Votes</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map(({ s, mine, sum, assigned }) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong><br /><span className="note small">{s.director} | {catName(s.category_id)}</span>
                    {mine.length > 0 && (
                      <details>
                        <summary className="note small">Each judge</summary>
                        {mine.map((x) => (
                          <div className="note small" key={x.judge_id}>
                            <strong>{judgeName(x.judge_id)}</strong> {x.final ? '' : '(draft) '}: {liveRubric.map((c) => c.name + ' ' + (x.scores[c.id] ?? '-')).join(', ')} | total {weightedTotal(liveRubric, x.scores) ?? '-'} | {RECS[x.recommendation] || 'no recommendation'}
                            {x.comment && <div>"{x.comment}"</div>}
                          </div>
                        ))}
                      </details>
                    )}
                  </td>
                  <td>{sum.weighted != null ? <strong>{sum.weighted}</strong> : '-'}<br /><span className="note small">{sum.judged} of {assigned} judges</span></td>
                  <td className="note small">Accept {sum.recs.accept}<br />Maybe {sum.recs.maybe}<br />Decline {sum.recs.decline}</td>
                  <td><span className={'pill ' + (s.status === 'accepted' ? 'published' : 'draft')}>{SUB_STATUS[s.status]}</span></td>
                  <td>
                    {s.status !== 'under_review' && <button className="btn ghost" type="button" onClick={() => setStatus(s, 'under_review')}>Under review</button>}{' '}
                    {s.status !== 'accepted' && <button className="btn" type="button" onClick={() => setStatus(s, 'accepted')}>Accept</button>}{' '}
                    {s.status !== 'declined' && <button className="btn ghost danger" type="button" onClick={() => setStatus(s, 'declined')}>Decline</button>}{' '}
                    {s.status === 'accepted' && (s.film_id ? <span className="note small">In your Films</span> : <button className="btn ghost" type="button" onClick={() => toFilms(s)}>Add to Films</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note small">Only submitted scores count toward the average. Accepting here uses the same buttons as the Submissions tab and never creates a second film for the same entry.</p>
      </div>
    </div>
  )
}
