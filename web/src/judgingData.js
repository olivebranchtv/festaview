import { supabase } from './data.js'

// Database calls for judging. Every call goes through a database function; the tables cannot be read directly.
const call = async (fn, args) => {
  if (!supabase) throw new Error('Judging needs the Festaview database connection.')
  const r = await supabase.rpc(fn, args)
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export const judgingAdminData = (fid) => (supabase ? call('judging_admin_data', { p_festival: fid }) : Promise.resolve({ round: null, judges: [], scores: [] }))
export const saveJudgingRound = (fid, status, rubric, instructions) => call('judging_save_round', { p_festival: fid, p_status: status, p_rubric: rubric, p_instructions: instructions || null })
export const saveJudge = (fid, j) => call('judging_save_judge', { p_festival: fid, p_id: j.id || null, p_email: j.email, p_name: j.name || null, p_category_ids: j.category_ids || [], p_entry_ids: j.entry_ids || [], p_active: j.active !== false })
export const removeJudge = (id) => call('judging_remove_judge', { p_id: id })

export const myJudgingFestivals = () => (supabase ? call('judging_my_festivals') : Promise.resolve([]))
export const myJudgingEntries = (fid) => call('judging_my_entries', { p_festival: fid })
export const saveScore = (submissionId, s) => call('judging_save_score', { p_submission: submissionId, p_scores: s.scores, p_comment: s.comment || null, p_recommendation: s.recommendation || null, p_final: !!s.final })
