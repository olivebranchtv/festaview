// Pure judging rules (no database access): rubric checks and score math. The database enforces the same limits.
export const SCORE_MIN = 1
export const SCORE_MAX = 10
export const RECS = { accept: 'Accept', maybe: 'Maybe', decline: 'Decline' }

export const DEFAULT_RUBRIC = [
  { id: 'story', name: 'Story', weight: 1 },
  { id: 'direction', name: 'Direction', weight: 1 },
  { id: 'craft', name: 'Craft', weight: 1 },
  { id: 'overall', name: 'Overall', weight: 1 },
]

export const criterionId = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

// Returns the cleaned rubric, or throws an Error with a plain message. Ids come from names when missing.
export function validateRubric(list) {
  if (!Array.isArray(list) || list.length < 1) throw new Error('Add at least one scoring criterion.')
  if (list.length > 10) throw new Error('Use at most 10 criteria.')
  const seen = new Set()
  return list.map((c) => {
    const name = String((c && c.name) || '').trim()
    if (!name) throw new Error('Give every criterion a name.')
    if (name.length > 40) throw new Error('A criterion name can be at most 40 characters.')
    const w = c.weight === '' || c.weight == null ? 1 : Number(c.weight)
    if (!Number.isFinite(w) || w < 0.1 || w > 10) throw new Error('A weight must be between 0.1 and 10.')
    const id = criterionId(c.id || name)
    if (!id) throw new Error('A criterion name needs letters or numbers.')
    if (seen.has(id)) throw new Error('Two criteria are named "' + name + '". Give each a different name.')
    seen.add(id)
    return { id, name, weight: Math.round(w * 100) / 100 }
  })
}

const round2 = (n) => Math.round(n * 100) / 100

// Valid score: a whole number from 1 to 10.
export const validScore = (v) => Number.isInteger(v) && v >= SCORE_MIN && v <= SCORE_MAX

// Weighted total on the same 1 to 10 scale. Missing criteria are skipped; returns null when nothing is scored.
export function weightedTotal(rubric, scores) {
  let sum = 0, wsum = 0
  for (const c of rubric || []) {
    const v = scores && scores[c.id]
    if (!validScore(v)) continue
    sum += v * c.weight
    wsum += c.weight
  }
  return wsum > 0 ? round2(sum / wsum) : null
}

// Plain average of the scored criteria (ignores weights).
export function plainAverage(rubric, scores) {
  const v = (rubric || []).map((c) => scores && scores[c.id]).filter(validScore)
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
}

export const isComplete = (rubric, scores) => (rubric || []).every((c) => validScore(scores && scores[c.id]))

// Everything a director sees for one entry. Only final (submitted) judgments count toward the numbers.
export function summarize(rubric, judgments) {
  const done = (judgments || []).filter((j) => j.final)
  const totals = done.map((j) => weightedTotal(rubric, j.scores)).filter((t) => t != null)
  const avgOf = (arr) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null)
  const perCriterion = {}
  for (const c of rubric || []) perCriterion[c.id] = avgOf(done.map((j) => j.scores && j.scores[c.id]).filter(validScore))
  const recs = { accept: 0, maybe: 0, decline: 0 }
  for (const j of done) if (recs[j.recommendation] != null) recs[j.recommendation]++
  return { judged: done.length, drafts: (judgments || []).length - done.length, weighted: avgOf(totals), perCriterion, recs }
}
