// Verify the distributable without using workspace dependencies or runtime data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-release-check-'))
const cwd = path.join(dir, 'server')
const env = { ...process.env, TEACHER_PASSWORD: 'release-check-only', DATA_DIR: path.join(dir, 'runtime') }
// Exercise the actual release defaults regardless of the caller's environment.
delete env.PORT
delete env.HOST
const baseUrl = 'http://127.0.0.1:28553'
function command(executable, args, location = cwd) {
  const result = spawnSync(executable, args, { cwd: location, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  return result.stdout
}
try {
  command('tar', ['-xzf', path.join(root, 'dist/logistic-abc-server.tar.gz'), '-C', dir], root)
  assert.ok(fs.existsSync(path.join(cwd, 'node_modules/express/package.json')))
  assert.ok(!fs.existsSync(path.join(cwd, '.env')))
  assert.ok(!fs.existsSync(path.join(cwd, 'runtime')))
  console.log(command('bash', ['start.sh']))
  const pid = fs.readFileSync(path.join(env.DATA_DIR, 'app.pid'), 'utf8')
  console.log(command('bash', ['start.sh']))
  assert.equal(fs.readFileSync(path.join(env.DATA_DIR, 'app.pid'), 'utf8'), pid)
  console.log(command('bash', ['query.sh']))
  for (const route of ['/student', '/student/abc', '/student/layout', '/student/review', '/student/submit', '/teacher']) {
    const response = await fetch(`${baseUrl}${route}`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /lang="zh-CN"/)
  }
  assert.deepEqual(await (await fetch(`${baseUrl}/api/health`)).json(), { ok: true })
  for (const origin of ['http://logistic.jaylu.tech', 'https://logistic.jaylu.tech', 'https://logistic.jaylu.tech.evil.example']) {
    const response = await fetch(`${baseUrl}/api/teacher/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.TEACHER_PASSWORD }),
    })
    assert.equal(response.status, origin.endsWith('.evil.example') ? 403 : 200)
  }
  const login = await fetch(`${baseUrl}/api/teacher/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.TEACHER_PASSWORD }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await fetch(`${baseUrl}/api/teacher/rounds`, { method: 'POST', headers: { Cookie: cookie } })).status, 200)
  const round = await (await fetch(`${baseUrl}/api/round`)).json()
  assert.equal(round.scenario.schemaVersion, 3, '发布包必须包含当前v3场景')
  const { classifyAbc } = await import(pathToFileURL(path.join(cwd, 'src/calc.js')))
  const { createReview, reviewDocument } = await import(pathToFileURL(path.join(cwd, 'src/review.js')))
  const context = { sessionId: round.id, studentId: 'release-check', studentName: '发布验收' }
  const placement = round.scenario.baselinePlacement
  const review = createReview(placement, round.scenario, context, 'release-attempt', new Date().toISOString())
  review.completed = true
  review.marks = reviewDocument(placement, round.scenario, context, review).errorCells.map(({ rowId, fieldKey }) => ({ rowId, fieldKey }))
  const response = await fetch(`${baseUrl}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schemaVersion: 3, roundId: round.id, studentId: context.studentId, studentName: context.studentName, placement, abcAnswers: classifyAbc(round.scenario.products, round.scenario.thresholds).classes, review, reflection: '发布验收'.repeat(10) }) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).scores.documentReview, round.scenario.scoring.documentReview)
  console.log('独立v3场景、审核生成、服务端提交评分验证通过。')
  console.log('发布包健康检查、前端路由刷新、重复启动检查通过。')
} finally {
  if (fs.existsSync(path.join(cwd, 'stop.sh'))) console.log(command('bash', ['stop.sh']))
  fs.rmSync(dir, { recursive: true, force: true })
}
