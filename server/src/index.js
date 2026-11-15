import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { openDb } from './db.js'
import { createScenarioStore } from './scenario.js'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const envFile = path.join(serverDir, '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

const password = process.env.TEACHER_PASSWORD
if (!password) {
  console.error('未设置 TEACHER_PASSWORD，拒绝启动。请在 .env 中设置教师密码。')
  process.exit(1)
}

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const dataDir = path.resolve(serverDir, process.env.DATA_DIR || './runtime')
fs.mkdirSync(dataDir, { recursive: true })

const log = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}]`, msg),
}

const db = openDb(dataDir)
const scenarios = createScenarioStore(dataDir, log)
const app = createApp({ db, scenarios, password, publicDir: path.join(serverDir, 'public'), log })

const server = app.listen(port, host, () => {
  log.info(`服务已启动：http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  数据目录：${dataDir}`)
})

function shutdown() {
  log.info('正在停止服务…')
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
