import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_KEY, readDraft, saveDraft, clearDraft, newDraft } from '../src/draft.js'
function storage() { const data = new Map([['other-app', 'keep']]); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) } }
test('草稿恢复、换人只删除本应用数据', () => {
  const s = storage(), draft = newDraft({ id: 'round-1', scenario: { baselinePlacement: { P01: 'R1-S1' } } }, 'S01', '张三')
  draft.reflection = '恢复的反思'; draft.abcChecksUsed = 2
  assert.equal(saveDraft(draft,s),true); assert.deepEqual(readDraft(s),draft)
  assert.equal(clearDraft(s),true); assert.equal(readDraft(s),null); assert.equal(s.getItem('other-app'),'keep')
})
test('损坏草稿及浏览器存储异常不会中断页面', () => {
  const s = storage(); s.setItem(DRAFT_KEY,'{'); assert.equal(readDraft(s),null)
  s.setItem(DRAFT_KEY,JSON.stringify({ schemaVersion: 1 })); assert.equal(readDraft(s),null)
  const denied = { getItem() { throw new Error() }, setItem() { throw new Error() }, removeItem() { throw new Error() } }
  assert.equal(readDraft(denied),null); assert.equal(saveDraft({},denied),false); assert.equal(clearDraft(denied),false)
})
