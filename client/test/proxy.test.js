import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import config from '../vite.config.js'
import { createApp } from '../../server/src/app.js'
import { openDb } from '../../server/src/db.js'
import { createScenarioStore } from '../../server/src/scenario.js'

test('Vite 代理保留同源信息：登录与 Cookie 会话成功，外部来源仍被拒绝', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-proxy-test-'))
  const db = openDb(dataDir)
  const quiet = { info() {}, error() {} }
  let backend, vite
  t.after(async () => {
    await vite?.close()
    if (backend?.listening) await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()))
    db.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })
  backend = createApp({ db, scenarios: createScenarioStore(dataDir, quiet), password: 'proxy-test-only', log: quiet }).listen(0, '127.0.0.1')
  await once(backend, 'listening')
  const target = `http://127.0.0.1:${backend.address().port}`
  const configuredProxy = config.server.proxy['/api']
  vite = await createServer({
    ...config,
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      ...config.server, host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null,
      proxy: { '/api': typeof configuredProxy === 'string' ? target : { ...configuredProxy, target } },
    },
  })
  await vite.listen()
  const frontend = `http://127.0.0.1:${vite.httpServer.address().port}`
  async function login(base, origin) {
    return fetch(`${base}/api/teacher/login`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'proxy-test-only' }),
    })
  }
  const direct = await login(target, target)
  assert.equal(direct.status, 200)
  const proxied = await login(frontend, frontend)
  assert.equal(proxied.status, 200, JSON.stringify(await proxied.json()))
  const cookie = proxied.headers.get('set-cookie').split(';')[0]
  assert.match(proxied.headers.get('set-cookie'), /HttpOnly/)
  const me = await fetch(`${frontend}/api/teacher/me`, { headers: { Cookie: cookie } })
  assert.equal((await me.json()).loggedIn, true)
  const round = await fetch(`${frontend}/api/teacher/rounds`, { method: 'POST', headers: { Cookie: cookie, Origin: frontend } })
  assert.equal(round.status, 200)
  for (const origin of ['http://evil.example', frontend.replace('http:', 'https:'), target]) {
    const rejected = await login(frontend, origin)
    assert.equal(rejected.status, 403)
    assert.equal((await rejected.json()).error.code, 'BAD_ORIGIN')
  }
})
