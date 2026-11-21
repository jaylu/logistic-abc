import { state, checkRound, locked, layoutLocked, classified, notify } from './state.js'
import { bestPlacement } from '../../server/src/warehouse.js'
import { demoMarks, demoReflection } from '../../server/src/demo.js'

// Recheck the server-owned mode before changing the current draft.
export async function fillDemoStep(step) {
  if (!await checkRound() || !state.round?.demo || locked.value || !state.draft) return
  const d = state.draft, scenario = state.round.scenario
  if (step === 'abc') {
    d.abcCalculations = Object.fromEntries(classified.value.rows.map(r => [r.sku, { turnover: String(+(r.cumAfter * 100).toFixed(6)), itemCount: String(+(r.itemCumAfter * 100).toFixed(6)) }]))
    d.abcAnswers = { ...classified.value.classes }
    d.abcSort = 'desc'; d.abcGuideDone = true
  } else if (step === 'layout') {
    if (layoutLocked.value) return
    d.placement = bestPlacement(scenario)
  } else if (step === 'review') {
    if (!d.review) return
    d.review.marks = demoMarks(d.placement, scenario, { sessionId: d.sessionId, studentId: d.studentId }, d.review)
    d.review.completed = false
  } else if (step === 'submit') d.reflection = demoReflection
  else return
  notify('已填入本步骤的演示数据，可继续修改或进入下一步。')
}
