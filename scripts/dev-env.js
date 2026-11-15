import fs from 'node:fs'
import { parseEnv } from 'node:util'

export function developmentEnv({ envFile = new URL('../server/.env', import.meta.url), env = process.env } = {}) {
  const settings = { ...(fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}), ...env }
  if (!settings.TEACHER_PASSWORD) {
    throw new Error('未设置 TEACHER_PASSWORD，开发服务未启动。\n请先运行 cp server/.env.example server/.env，编辑 server/.env 设置教师密码，然后重新运行 npm run dev。')
  }
  const port = settings.PORT || '3000'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('PORT 必须是 1～65535 的整数，请检查 server/.env 或环境变量。')
  return { ...settings, PORT: port }
}
