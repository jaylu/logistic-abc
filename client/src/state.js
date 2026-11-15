import { reactive, computed, watch } from 'vue'
import { api } from './api.js'
import { readDraft, saveDraft, clearDraft, newDraft } from './draft.js'
import { classifyAbc, layoutMetrics, parseMap } from './calc.js'

export const state = reactive({ round: null, draft: null, ready: false, error: '', expired: false, saved: '', toast: '' })
export const scenario = computed(() => state.round?.scenario)
export const locked = computed(() => state.expired || !!state.draft?.submissionResult)
export const classified = computed(() => scenario.value ? classifyAbc(scenario.value.products, scenario.value.thresholds) : null)
export const complete = computed(() => !!scenario.value && scenario.value.products.every(p => ['A', 'B', 'C'].includes(state.draft?.abcAnswers[p.sku])))
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
    if (state.draft && state.draft.sessionId !== round.id) { state.expired = true; return false }
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
      if (old && old.sessionId !== state.round.id) { clearDraft(); notify('老师已开始新一轮，旧草稿已失效。') }
      else if (old) {
        const skus = state.round.scenario.products.map(p => p.sku)
        const slots = new Set(parseMap(state.round.scenario.map).slots.map(slot => slot.slotId))
        const valid = Object.keys(old.abcAnswers).every(sku => skus.includes(sku) && ['A', 'B', 'C'].includes(old.abcAnswers[sku])) && skus.every(sku => slots.has(old.placement[sku])) && new Set(Object.values(old.placement)).size === skus.length
        if (valid) { state.draft = old; if (Object.keys(old.abcAnswers).length) old.abcGuideDone = true; notify('已恢复你上次的进度。') }
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
