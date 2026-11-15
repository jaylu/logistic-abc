export const DRAFT_KEY = 'logistic-abc:student:v1'
export function readDraft(storage = localStorage) {
  try {
    const d = JSON.parse(storage.getItem(DRAFT_KEY))
    if (!d || d.schemaVersion !== 1 || typeof d.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(d.studentId) || typeof d.studentName !== 'string') return null
    if (!['start', 'abc', 'layout', 'submit'].includes(d.step) || !d.abcAnswers || !d.placement || typeof d.reflection !== 'string') return null
    if (!Number.isInteger(d.abcChecksUsed) || d.abcChecksUsed < 0) return null
    return d
  } catch { return null }
}
export function saveDraft(draft, storage = localStorage) {
  try { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); return true } catch { return false }
}
export function clearDraft(storage = localStorage) {
  try { storage.removeItem(DRAFT_KEY); return true } catch { return false }
}
export function newDraft(round, studentId, studentName) {
  return { schemaVersion: 1, sessionId: round.id, studentId, studentName, step: 'abc', abcGuideDone: false, abcAnswers: {}, abcChecksUsed: 0, placement: { ...round.scenario.baselinePlacement }, reflection: '', submissionResult: null }
}
