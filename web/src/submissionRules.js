// Pure rules for festival submissions, shared by the website and the SEO server code (no database access here).
// The database makes the real decisions (submission_quote); these helpers only describe them to the visitor.

export const money = (cents) => (!cents ? 'Free' : '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)))

// The fee step that applies right now: the earliest deadline that has not passed; a step without a deadline comes last.
export function currentTier(tiers, now = Date.now()) {
  const live = (tiers || []).filter((t) => !t.deadline || new Date(t.deadline).getTime() >= now)
  live.sort((a, b) => (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity) || (a.sort_order || 0) - (b.sort_order || 0))
  return live[0] || null
}

// open | not_open | closed, from the festival's own switch and dates.
export function submissionState(f, now = Date.now()) {
  if (!f || !f.submissions_open) return 'closed'
  if (f.submissions_opens_at && now < new Date(f.submissions_opens_at).getTime()) return 'not_open'
  if (f.submissions_closes_at && now > new Date(f.submissions_closes_at).getTime()) return 'closed'
  return 'open'
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')

// Public categories of a festival, each with its tiers and the fee that applies today.
export function festivalCategories(categories, tiers, festivalId, now = Date.now()) {
  return (categories || [])
    .filter((c) => c.festival_id === festivalId && c.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((c) => {
      const mine = (tiers || []).filter((t) => t.category_id === c.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      return { ...c, tiers: mine, current: currentTier(mine, now) }
    })
}

export const STATUS_LABEL = { submitted: 'Submitted', under_review: 'Under review', accepted: 'Accepted', declined: 'Not selected', withdrawn: 'Withdrawn' }
export const PAY_LABEL = { unpaid: 'Payment needed', paid: 'Paid', free: 'No fee', waived: 'Fee waived', refunded: 'Refunded' }

// Spreadsheet-safe CSV: quotes every value and defuses cells that start with = + - @ so they cannot run as formulas.
export function csvText(rows) {
  const esc = (v) => {
    let t = String(v ?? '')
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t
    return '"' + t.replace(/"/g, '""') + '"'
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}
