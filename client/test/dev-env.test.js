import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { developmentEnv } from '../../scripts/dev-env.js'

test('开发启动前检查密码，后端与代理共享端口且环境变量优先', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-dev-env-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const envFile = path.join(directory, '.env')
  assert.throws(() => developmentEnv({ envFile, env: {} }), /cp server\/\.env.example server\/\.env/)
  fs.writeFileSync(envFile, 'TEACHER_PASSWORD=test-only\nPORT=3100\n')
  assert.equal(developmentEnv({ envFile, env: {} }).PORT, '3100')
  assert.equal(developmentEnv({ envFile, env: { PORT: '3200' } }).PORT, '3200')
  assert.throws(() => developmentEnv({ envFile, env: { PORT: 'not-a-port' } }), /PORT/)
})
