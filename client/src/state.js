import { validatePlacement } from '../../server/src/warehouse.js'
import { validateReview } from '../../server/src/review.js'
import { reactive, computed, watch } from 'vue'
import { api } from './api.js'
import { readDraft, saveDraft, clearDraft, newDraft, hasStoredDraft } from './draft.js'
import { calculationsComplete } from './abc-input.js'
import { classifyAbc, layoutMetrics } from './calc.js'

export const state = reactive({ round: null, draft: null, ready: false, error: '', expired: false, saved: '', toast: '' })
export const scenario = computed(() => state.round?.scenario)
export const locked = computed(() => state.expired || !!state.draft?.submissionResult)
export const layoutLocked = computed(() => locked.value || !!state.draft?.review)
export const reviewReady = computed(() => !!state.draft?.review && !!scenario.value && validateReview(state.draft.review, state.draft.placement, scenario.value, { sessionId: state.draft.sessionId, studentId: state.draft.studentId }).length === 0)
export const classified = computed(() => scenario.value ? classifyAbc(scenario.value.products, scenario.value.thresholds) : null)
export const complete = computed(() => !!scenario.value && calculationsComplete(scenario.value.products, state.draft?.abcCalculations) && scenario.value.products.every(p => ['A', 'B', 'C'].includes(state.draft?.abcAnswers[p.sku])))
export const metrics = computed(() => scenario.value && state.draft ? layoutMetrics(scenario.value, state.draft.placement) : null)
let toastTimer
export function notify(message) { state.toast = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { state.toast = '' }, 4500) }
export function persist() {
  if (!state.draft) return
  state.saved = saveDraft(state.draft) ? `✓ 已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '⚠ 本机保存失败'
}
watch(() => state.draft, persist, { deep: true, flush: 'sync' })
export async function checkRound() {
  try {
    const round = await api('/round')
    state.error = ''
    if (state.draft && (state.draft.sessionId !== round.id || state.draft.schemaVersion !== round.scenario.schemaVersion || state.draft.scenarioRevision !== (round.scenario.scenarioRevision ?? null))) { state.expired = true; return false }
    if (round.scenario.schemaVersion !== 3 || !round.scenario.thresholds?.turnover || !round.scenario.thresholds?.itemCount) {
      state.error = '当前轮次使用旧版实验数据，请老师在教师页面开始新一轮。'
      return false
    }
    state.round = round
    state.expired = false
    if (!restored) { restored = true; restoreDraft() }
    return true
  } catch (error) {
    state.error = error.code === 'NO_ROUND' ? '老师还没有开始实训，请稍候。' : error.message
    return false
  }
}
let initialization
let restored = false
function restoreDraft() {
      const old = readDraft()
      if (!old && hasStoredDraft()) { clearDraft(); notify('课堂或场景已更新，旧草稿已失效，请重新开始。') }
      if (old && (old.sessionId !== state.round.id || old.schemaVersion !== state.round.scenario.schemaVersion || old.scenarioRevision !== (state.round.scenario.scenarioRevision ?? null))) { clearDraft(); notify('老师已开始新一轮，旧草稿已失效。') }
      else if (old) {
        const skus = state.round.scenario.products.map(p => p.sku)
        const valid = Object.keys(old.abcAnswers).every(sku => skus.includes(sku) && ['A', 'B', 'C'].includes(old.abcAnswers[sku])) && validatePlacement(old.placement, state.round.scenario).length === 0
        if (valid) {
          if (old.review && validateReview({ ...old.review, completed: true }, old.placement, state.round.scenario, { sessionId: old.sessionId, studentId: old.studentId }).length) { old.review = null; old.step = 'layout'; notify('审核状态已失效，请重新确认储位方案。') }
          state.draft = old; if (Object.keys(old.abcAnswers).length) old.abcGuideDone = true; notify('已恢复你上次的进度。') }
        else { clearDraft(); notify('本机草稿不完整，请重新开始。') }
      }
}
export function initialize() {
  if (initialization) return initialization
  initialization = (async () => {
    await checkRound()
    state.ready = true
  })()
  return initialization
}
export function startStudent(id, name) {
  id = id.trim(); name = name.trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('学号须为 1～32 位字母、数字、- 或 _。')
  if (!name || Array.from(name).length > 20) throw new Error('姓名须为 1～20 个字。')
  if (state.draft?.studentId === id && state.draft.sessionId === state.round.id) state.draft.studentName = name
  else { if (state.draft) notify('本机保存的是其他学号的进度，已清除。'); state.draft = newDraft(state.round, id, name) }
}
export async function changeStudent() {
  state.draft = null; state.expired = false
  state.saved = clearDraft() ? '' : '⚠ 本机保存失败'
  await checkRound()
}
