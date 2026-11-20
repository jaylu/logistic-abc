import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_KEY, readDraft, saveDraft, clearDraft, newDraft } from '../src/draft.js'
function storage() { const data = new Map([['other-app', 'keep']]); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) } }
test('草稿恢复、换人只删除本应用数据', () => {
  const s = storage(), draft = newDraft({ id: 'round-1', scenario: { baselinePlacement: { P01: 'R1-S1' } } }, 'S01', '张三')
  draft.reflection = '恢复的反思'; draft.abcChecksUsed = 2
  draft.abcGuideDone = true; draft.abcSort = 'desc'; draft.abcCalculations = { P01: { turnover: '80%', itemCount: '20%' } }
  assert.equal(saveDraft(draft,s),true); assert.deepEqual(readDraft(s),draft)
  assert.equal(clearDraft(s),true); assert.equal(readDraft(s),null); assert.equal(s.getItem('other-app'),'keep')
})
test('损坏草稿及浏览器存储异常不会中断页面', () => {
  const s = storage(); s.setItem(DRAFT_KEY,'{'); assert.equal(readDraft(s),null)
  s.setItem(DRAFT_KEY,JSON.stringify({ schemaVersion: 1 })); assert.equal(readDraft(s),null)
  const denied = { getItem() { throw new Error() }, setItem() { throw new Error() }, removeItem() { throw new Error() } }
  assert.equal(readDraft(denied),null); assert.equal(saveDraft({},denied),false); assert.equal(clearDraft(denied),false)
})
test('v3草稿隔离学号并保留审核题、标注、锁定快照', () => {
  const s=storage(), a=newDraft({id:'r1',scenario:{schemaVersion:3,baselinePlacement:{P01:'01101101'}}},'S01','张三')
  a.step='review';a.review={reviewId:'same',reviewAttemptId:'attempt',createdAt:'2026-11-20',placementSnapshot:{...a.placement},marks:[{rowId:'P01',fieldKey:'unit'}]}
  saveDraft(a,s);assert.deepEqual(readDraft(s).review,a.review)
  const b=newDraft({id:'r1',scenario:{schemaVersion:3,baselinePlacement:{P01:'01101101'}}},'S02','李四')
  saveDraft(b,s);assert.equal(s.getItem('logistic-abc:r1:S01:3'),null);assert.equal(readDraft(s).review,null)
  s.setItem('logistic-abc:student:v1',JSON.stringify({...a,schemaVersion:1}));clearDraft(s)
  assert.equal(readDraft(s),null);assert.equal(s.getItem('other-app'),'keep')
})
