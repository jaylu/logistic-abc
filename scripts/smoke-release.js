// Verify the distributable without using workspace dependencies or runtime data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-release-check-'))
const cwd = path.join(dir, 'server')
const env = { ...process.env, PORT: '32187', HOST: '127.0.0.1', TEACHER_PASSWORD: 'release-check-only', DATA_DIR: path.join(dir, 'runtime') }
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
  for (const route of ['/student', '/student/abc', '/student/layout', '/student/submit', '/teacher']) {
    const response = await fetch(`http://127.0.0.1:${env.PORT}${route}`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /lang="zh-CN"/)
  }
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${env.PORT}/api/health`)).json(), { ok: true })
  console.log('发布包健康检查、前端路由刷新、重复启动检查通过。')
} finally {
  if (fs.existsSync(path.join(cwd, 'stop.sh'))) console.log(command('bash', ['stop.sh']))
  fs.rmSync(dir, { recursive: true, force: true })
}
