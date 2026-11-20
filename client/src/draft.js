export const DRAFT_KEY = 'logistic-abc:student:v3'
const scopedKey = d => `logistic-abc:${d.sessionId}:${d.studentId}:${d.schemaVersion}`
export function hasStoredDraft(storage = localStorage) { try { return !!(storage.getItem(DRAFT_KEY) || storage.getItem('logistic-abc:student:v1')) } catch { return false } }
export function readDraft(storage = localStorage) {
  try {
    const key = storage.getItem(DRAFT_KEY)
    if (!key?.startsWith('logistic-abc:')) return null
    const d = JSON.parse(storage.getItem(key))
    if (!d || d.schemaVersion !== 3 || typeof d.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(d.studentId) || typeof d.studentName !== 'string') return null
    if (!['start', 'abc', 'layout', 'review', 'submit'].includes(d.step) || !d.abcAnswers || !d.placement || typeof d.reflection !== 'string') return null
    if (!Number.isInteger(d.abcChecksUsed) || d.abcChecksUsed < 0 || scopedKey(d) !== key) return null
    return d
  } catch { return null }
}
export function saveDraft(draft, storage = localStorage) {
  try {
    const key = scopedKey(draft), previous = storage.getItem(DRAFT_KEY)
    storage.setItem(key, JSON.stringify(draft)); storage.setItem(DRAFT_KEY, key)
    if (previous?.startsWith('logistic-abc:') && previous !== key) storage.removeItem(previous)
    storage.removeItem('logistic-abc:student:v1')
    return true
  } catch { return false }
}
export function clearDraft(storage = localStorage) {
  try { const key = storage.getItem(DRAFT_KEY); if (key?.startsWith('logistic-abc:')) storage.removeItem(key); storage.removeItem(DRAFT_KEY); storage.removeItem('logistic-abc:student:v1'); return true } catch { return false }
}
export function newDraft(round, studentId, studentName) {
  return { schemaVersion: 3, scenarioRevision: round.scenario.scenarioRevision ?? null, sessionId: round.id, studentId, studentName, step: 'abc', abcGuideDone: false, abcCalculations: {}, abcSort: null, abcAnswers: {}, abcChecksUsed: 0, placement: { ...round.scenario.baselinePlacement }, review: null, reflection: '', submissionResult: null }
}
