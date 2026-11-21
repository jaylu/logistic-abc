import { createReview, reviewDocument } from '../src/review.js'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'
import { createScenarioStore } from '../src/scenario.js'
import { classifyAbc } from '../src/calc.js'

const PASSWORD = 'test-password'
const quiet = { info() {}, error() {} }
let server, base, db, dataDir, cookie

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-test-'))
  db = openDb(dataDir)
  const app = createApp({ db, scenarios: createScenarioStore(dataDir, quiet), password: PASSWORD, log: quiet })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  base = `http://127.0.0.1:${server.address().port}/api`
})

after(() => {
  server.close()
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // Response.text strips UTF-8 BOM; inspect the actual response bytes instead.
  const text = Buffer.from(await res.arrayBuffer()).toString('utf8')
  let data = text
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, headers: res.headers }
}

async function startRound() {
  return (await call('POST', '/teacher/rounds')).data
}

function answerFor(round, overrides = {}) {
  const { scenario } = round
  const answer = {
    schemaVersion: 3,
    roundId: round.id,
    studentId: '20260101',
    studentName: '张三',
    abcAnswers: classifyAbc(scenario.products, scenario.thresholds).classes,
    placement: { ...scenario.baselinePlacement },
    reflection: '因为周转量高的A类商品拣货频繁，所以优先放在靠近出库口的位置，以缩短拣货距离。如果订单结构变化，我会重新计算并更新ABC分类，再按新结果重新分配储位，同时复核容量、堆高和载荷。',
    ...overrides,
  }
  answer.review = createReview(answer.placement, scenario, { sessionId: round.id, studentId: answer.studentId }, 'test-attempt', '2026-11-20T00:00:00Z')
  answer.review.completed = true
  return answer
}

test('教师鉴权', async () => {
  assert.equal((await call('GET', '/teacher/statistics')).status, 401)
  assert.equal((await call('GET', '/teacher/statistics.csv')).status, 401)
  assert.equal((await call('GET', '/teacher/me')).status, 401)
  assert.equal((await call('POST', '/teacher/rounds')).status, 401)
  assert.equal((await call('GET', '/teacher/export.csv')).status, 401)
  assert.equal((await call('POST', '/teacher/logout')).status, 401)
  assert.equal((await call('GET', '/teacher/me', undefined, { Cookie: 'teacher_session=%ZZ' })).status, 401)
  assert.equal((await call('POST', '/teacher/login', { password: 'wrong' })).status, 401)
  const bad = await call('POST', '/teacher/login', { password: PASSWORD }, { Origin: 'http://evil.example' })
  assert.equal(bad.status, 403)
  assert.equal((await call('POST', '/teacher/login', { password: PASSWORD }, { Origin: base.replace('http:', 'https:').replace('/api', '') })).status, 403)

  const ok = await call('POST', '/teacher/login', { password: PASSWORD })
  assert.equal(ok.status, 200)
  cookie = ok.headers.get('set-cookie').split(';')[0]
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/)
  const me = await call('GET', '/teacher/me')
  assert.equal(me.data.round, null)
})

test('无轮次时学生得到 NO_ROUND，空 CSV', async () => {
  assert.equal((await call('GET', '/round')).data.error.code, 'NO_ROUND')
  assert.equal((await call('GET', '/teacher/statistics')).data.statistics, null)
})

test('提交流程：成功、重试、冲突、不完整', async () => {
  await startRound()
  const round = (await call('GET', '/round')).data
  assert.equal(round.scenario.products.length, 12)

  const csvEmpty = await call('GET', '/teacher/export.csv')
  assert.equal(csvEmpty.status, 200)
  assert.ok(csvEmpty.data.startsWith('﻿轮次,学号'))

  const first = await call('POST', '/submissions', answerFor(round))
  assert.equal(first.status, 200)
  assert.equal(first.data.scores.abc, 35)
  assert.equal(first.data.scores.placementEfficiency, 0)
  assert.equal(first.data.scores.reflection, 5)

  // 网络重试：内容相同（反思前后多了空格）返回原结果
  const again = await call('POST', '/submissions', answerFor(round, { reflection: `  ${answerFor(round).reflection}  ` }))
  assert.equal(again.status, 200)
  assert.equal(again.data.submissionId, first.data.submissionId)
  assert.equal((await call('GET', '/teacher/submissions')).data.length, 1)

  const different = await call('POST', '/submissions', answerFor(round, { reflection: '改了' }))
  assert.equal(different.status, 409)
  assert.equal(different.data.error.code, 'ALREADY_SUBMITTED')

  const placement = { ...round.scenario.baselinePlacement }
  delete placement.P01
  const incomplete = await call('POST', '/submissions', answerFor(round, { studentId: 'S2', placement }))
  assert.equal(incomplete.status, 422)
  assert.match(incomplete.data.error.message, /未分配/)

  const dup = { ...round.scenario.baselinePlacement, P01: round.scenario.baselinePlacement.P02 }
  assert.equal((await call('POST', '/submissions', answerFor(round, { studentId: 'S3', placement: dup }))).status, 422)
  assert.equal((await call('POST', '/submissions', answerFor(round, { studentId: 'bad id!' }))).status, 422)
  assert.equal((await call('POST', '/submissions', answerFor(round, { reflection: 'x'.repeat(33000) }))).status, 422)
})

test('教师详情、删除后可重新提交、CSV 防注入', async () => {
  const round = (await call('GET', '/round')).data
  const list = (await call('GET', '/teacher/submissions')).data
  const detail = await call('GET', `/teacher/submissions/${list[0].id}`)
  assert.equal(detail.data.correctClasses.P01, 'C')

  assert.equal((await call('DELETE', `/teacher/submissions/${list[0].id}`)).status, 200)
  const redo = await call('POST', '/submissions', answerFor(round, { reflection: '=HYPERLINK("x") 重新提交' }))
  assert.equal(redo.status, 200)

  const csv = (await call('GET', '/teacher/export.csv')).data
  assert.match(csv, /"'=HYPERLINK\(""x""\) 重新提交"/)
  assert.match(csv, /张三/)
})

test('开始新一轮后旧轮次不能提交', async () => {
  const oldRound = (await call('GET', '/round')).data
  await startRound()
  const res = await call('POST', '/submissions', answerFor(oldRound, { studentId: 'S9' }))
  assert.equal(res.status, 409)
  assert.equal(res.data.error.code, 'SESSION_EXPIRED')
  assert.equal((await call('GET', '/teacher/submissions')).data.length, 0)
})

test('实验数据：校验、保存后下一轮生效、恢复默认', async () => {
  const current = (await call('GET', '/teacher/scenario')).data
  assert.equal(current.isDefault, true)
  assert.equal(current.reference.baselineDistance, 41846.5)

  const invalid = await call('PUT', '/teacher/scenario', { ...current.scenario, map: ['ES'] })
  assert.equal(invalid.status, 422)

  const tooHard = await call('POST', '/teacher/scenario/validate', { ...current.scenario, fullScoreImprovement: 0.9 })
  assert.equal(tooHard.status, 422)
  assert.match(tooHard.data.error.message, /最优改善率/)

  const edited = structuredClone(current.scenario)
  edited.products[0].name = '游戏本'
  assert.equal((await call('PUT', '/teacher/scenario', edited)).status, 200)
  assert.ok(fs.existsSync(path.join(dataDir, 'scenario.json')))

  // 当前一轮不受影响
  assert.equal((await call('GET', '/round')).data.scenario.products[0].name, '笔记本电脑')
  await startRound()
  assert.equal((await call('GET', '/round')).data.scenario.products[0].name, '游戏本')

  const reset = await call('DELETE', '/teacher/scenario')
  assert.equal(reset.data.isDefault, true)
  assert.ok(!fs.existsSync(path.join(dataDir, 'scenario.json')))
})

test('自定义数据文件损坏时改用默认数据', () => {
  fs.writeFileSync(path.join(dataDir, 'scenario.json'), '{ broken')
  const store = createScenarioStore(dataDir, quiet)
  assert.equal(store.current().isDefault, true)
  fs.rmSync(path.join(dataDir, 'scenario.json'))
})

test('v3 API拒绝绕过审核、篡改布局和标注，忽略前端自报分数', async () => {
  await startRound()
  const round=(await call('GET','/round')).data
  const base=answerFor(round,{studentId:'REVIEW1'})
  const document=reviewDocument(base.placement,round.scenario,{sessionId:round.id,studentId:base.studentId,studentName:base.studentName},base.review)
  for (const change of [b=>delete b.review,b=>b.schemaVersion=1,b=>b.review.completed=false,b=>b.placement.P09='01101102',b=>b.placement.P01=Object.keys(round.scenario.warehouse.disabledLocations)[0],b=>b.review.marks=[{rowId:'P01',fieldKey:'bad'}],b=>b.review.marks=Array(2).fill({rowId:'P01',fieldKey:'sku'})]) {
    const body=structuredClone(base); change(body)
    assert.equal((await call('POST','/submissions',body)).status,422)
  }
  const body=structuredClone(base)
  body.review.marks=document.errorCells.map(({rowId,fieldKey})=>({rowId,fieldKey}))
  body.review.reviewScore=999;body.review.errorCells=[];body.review.generatedRows=[];body.scores={total:999}
  const result=await call('POST','/submissions',body)
  assert.equal(result.status,200);assert.equal(result.data.scores.documentReview,20);assert.equal(result.data.scores.total,75)
  assert.equal(result.data.review.correctMarks,5)
  const detail=(await call('GET',`/teacher/submissions/${result.data.submissionId}`)).data
  assert.equal(detail.result.review.document.errorCells.length,5)
  assert.equal(detail.answer.review.reviewScore,undefined)
  const csv=(await call('GET','/teacher/export.csv')).data
  for(const field of ['单据审核得分','误标数','漏标数','占用货位数','01101101']) assert.ok(csv.includes(field))
  const oldCount=db.countSubmissions(round.id)
  await startRound();assert.equal(db.countSubmissions(round.id),oldCount)
})

test('教学统计随提交、删除和新轮次更新，CSV使用本轮数据', async () => {
  await startRound()
  const round = (await call('GET', '/round')).data
  assert.equal((await call('GET', '/teacher/statistics')).data.statistics.count, 0)
  const submitted = await call('POST', '/submissions', answerFor(round))
  const stats = (await call('GET', '/teacher/statistics')).data.statistics
  assert.equal(stats.roundId, round.id)
  assert.equal(stats.count, 1)
  assert.equal(stats.tasks[0].achieved, 1)
  assert.equal(stats.reviewTotals.missedMarks, round.scenario.documentReview.errorCount)
  const csv = await call('GET', '/teacher/statistics.csv')
  assert.equal(csv.status, 200)
  assert.ok(csv.data.startsWith('\uFEFF轮次,'))
  assert.match(csv.data, /商品分类错误/)
  assert.match(csv.data, /加权等效米/)
  await call('DELETE', `/teacher/submissions/${submitted.data.submissionId}`)
  assert.equal((await call('GET', '/teacher/statistics')).data.statistics.count, 0)
  await startRound()
  assert.notEqual((await call('GET', '/teacher/statistics')).data.statistics.roundId, round.id)
})

test('演示轮次：鉴权、模式隔离、50份真实评分、重试及历史数据保留', async () => {
  assert.equal((await call('POST', '/teacher/demo/submissions', {}, { Cookie: '' })).status, 401)
  assert.equal((await call('POST', '/teacher/rounds', { demo: 'true' })).status, 422)
  const normal = await startRound()
  assert.equal(normal.demo, false)
  const normalRound = (await call('GET', '/round')).data
  await call('POST', '/submissions', answerFor(normalRound))
  const normalSubmission = db.listSubmissions(normal.id)[0]
  assert.equal((await call('POST', '/teacher/demo/submissions', { roundId: normal.id })).status, 403)
  const demo = (await call('POST', '/teacher/rounds', { demo: true })).data
  assert.equal(demo.demo, true)
  assert.equal((await call('GET', '/round')).data.demo, true)
  assert.equal((await call('POST', '/teacher/demo/submissions', { roundId: normal.id })).status, 409)
  const generated = await call('POST', '/teacher/demo/submissions', { roundId: demo.id })
  assert.equal(generated.status, 200)
  assert.equal(generated.data.created, 50)
  const saved = db.listSubmissions(demo.id)
  assert.equal(saved.length, 50)
  assert.ok(new Set(saved.map(s => s.result.scores.total)).size > 5)
  assert.ok(new Set(saved.map(s => s.result.metrics.improvement)).size > 2)
  assert.ok(saved.every(s => s.answer.review.completed))
  assert.equal((await call('POST', '/teacher/demo/submissions', { roundId: demo.id })).data.created, 0)
  assert.deepEqual(db.listSubmissions(demo.id), saved)
  assert.equal((await call('GET', '/teacher/submissions')).data.length, 50)
  assert.match((await call('GET', '/teacher/export.csv')).data, /演示学生50/)
  await call('DELETE', `/teacher/submissions/${saved[0].id}`)
  assert.equal((await call('POST', '/teacher/demo/submissions', { roundId: demo.id })).data.created, 1)
  const next = await startRound()
  assert.equal(next.demo, false)
  assert.deepEqual((await call('GET', '/teacher/submissions')).data, [])
  assert.equal((await call('POST', '/teacher/demo/submissions', { roundId: next.id })).status, 403)
  assert.deepEqual(db.getSubmission(normalSubmission.id), normalSubmission)
  assert.equal(db.listSubmissions(demo.id).length, 50)
  const reopened = openDb(dataDir)
  assert.equal(reopened.activeRound().demo, false)
  reopened.close()
})
