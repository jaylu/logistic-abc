import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DRAFT_KEY, newDraft, saveDraft } from '../src/draft.js'
import { initialize, checkRound, state } from '../src/state.js'
const scenario = JSON.parse(fs.readFileSync(new URL('../../server/data/default-scenario.json', import.meta.url)))
test('首次网络失败后重试仍恢复原草稿，新轮次只锁定旧答案', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const round = { id: 'round-1', scenario }
  const draft = newDraft(round, 'S01', '张三')
  draft.reflection = '尚未提交的反思'; draft.step = 'layout'; draft.abcAnswers = { P01: 'A' }
  const data = new Map()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage })
  saveDraft(draft)
  let offline = true
  t.mock.method(globalThis, 'fetch', async () => {
    if (offline) throw new Error('offline')
    return { ok: true, json: async () => structuredClone(round) }
  })
  await initialize()
  assert.equal(state.draft, null)
  assert.match(state.error, /无法连接服务器/)
  offline = false
  assert.equal(await checkRound(), true)
  assert.equal(state.draft.reflection, draft.reflection)
  assert.equal(state.draft.abcGuideDone, true)
  round.id = 'round-2'
  assert.equal(await checkRound(), false)
  assert.equal(state.expired, true)
  assert.equal(state.draft.sessionId, 'round-1')
  assert.equal(state.round.id, 'round-1')
})
