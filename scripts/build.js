import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
function run(command, args, cwd = root) { const r = spawnSync(command, args, { cwd, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${command} failed: ${r.error?.message || r.status}`) }
run('npm', ['run', 'build', '--workspace', 'client'])
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'logistic-abc-build-'))
try {
  const server = path.join(staging, 'server'); fs.mkdirSync(server)
  for (const item of ['src', 'data', 'public', 'package.json', '.env.example', 'start.sh', 'stop.sh', 'query.sh', 'service-env.sh']) fs.cpSync(path.join(root, 'server', item), path.join(server, item), { recursive: true })
  // Ship the documented HTTP/loopback defaults, never the developer's local .env.
  const releaseEnv = fs.readFileSync(path.join(server, '.env.example'), 'utf8')
  if (!/^PORT=28553$/m.test(releaseEnv) || !/^HOST=127\.0\.0\.1$/m.test(releaseEnv)) {
    throw new Error('Release must default to http://127.0.0.1:28553')
  }
  // A standalone install ensures the archive includes dependencies even with npm workspaces.
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], server)
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  run('tar', ['-czf', path.join(root, 'dist/logistic-abc-server.tar.gz'), '-C', staging, 'server'])
  console.log('发布包：dist/logistic-abc-server.tar.gz（HTTP 上游：http://127.0.0.1:28553）')
} finally { fs.rmSync(staging, { recursive: true, force: true }) }
