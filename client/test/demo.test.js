import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { state, complete } from '../src/state.js'
import { newDraft } from '../src/draft.js'
import { fillDemoStep } from '../src/demo.js'
import { createReview, validateReview } from '../../server/src/review.js'
import { validatePlacement } from '../../server/src/warehouse.js'

const scenario = JSON.parse(fs.readFileSync(new URL('../../server/data/default-scenario.json', import.meta.url)))
test('学生演示填写：逐步填写、审核锁定、提交锁定和普通轮次隔离', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage })
  const round = { id: 'demo-round', demo: true, scenario }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => structuredClone(round) }))
  state.round = round; state.draft = newDraft(round, 'demo', '演示')
  await fillDemoStep('abc')
  assert.equal(complete.value, true)
  assert.equal(state.draft.reflection, '')
  await fillDemoStep('layout')
  assert.deepEqual(validatePlacement(state.draft.placement, scenario), [])
  const context = { sessionId: round.id, studentId: 'demo' }
  state.draft.review = createReview(state.draft.placement, scenario, context, 'attempt', new Date().toISOString())
  const snapshot = JSON.stringify(state.draft)
  await fillDemoStep('layout')
  assert.equal(JSON.stringify(state.draft), snapshot)
  await fillDemoStep('review')
  assert.equal(state.draft.review.marks.length, scenario.documentReview.errorCount)
  assert.equal(state.draft.review.completed, false)
  state.draft.review.completed = true
  assert.deepEqual(validateReview(state.draft.review, state.draft.placement, scenario, context), [])
  await fillDemoStep('submit')
  assert.ok(state.draft.reflection.length > 40)
  state.draft.submissionResult = { scores: {} }
  let frozen = JSON.stringify(state.draft)
  for (const step of ['abc', 'layout', 'review', 'submit']) await fillDemoStep(step)
  assert.equal(JSON.stringify(state.draft), frozen)
  state.draft.submissionResult = null; round.demo = false
  frozen = JSON.stringify(state.draft)
  for (const step of ['abc', 'layout', 'review', 'submit']) await fillDemoStep(step)
  assert.equal(JSON.stringify(state.draft), frozen)
  round.demo = true; round.id = 'new-round'
  await fillDemoStep('abc')
  assert.equal(state.expired, true)
  assert.equal(JSON.stringify(state.draft), frozen)
})
