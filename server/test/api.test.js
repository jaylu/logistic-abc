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
  return {
    roundId: round.id,
    studentId: '20260101',
    studentName: '张三',
    abcAnswers: classifyAbc(scenario.products, scenario.thresholds).classes,
    placement: { ...scenario.baselinePlacement },
    reflection: '因为周转量高的商品应该放在离出库口更近的位置，这样往返距离最短。',
    ...overrides,
  }
}

test('教师鉴权', async () => {
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
  assert.equal(first.data.scores.abc, 50)
  assert.equal(first.data.scores.layout, 0)
  assert.equal(first.data.scores.reflection, 10)

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
  assert.match(incomplete.data.error.message, /1 个商品未放入储位/)

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
  assert.equal(current.reference.baselineDistance, 95100)

  const invalid = await call('PUT', '/teacher/scenario', { ...current.scenario, map: ['ES'] })
  assert.equal(invalid.status, 422)

  const tooHard = await call('POST', '/teacher/scenario/validate', { ...current.scenario, fullScoreImprovement: 0.9 })
  assert.equal(tooHard.status, 422)
  assert.match(tooHard.data.error.message, /无法拿到布局满分/)

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
