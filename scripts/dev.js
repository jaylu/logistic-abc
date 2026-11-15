import { spawn } from 'node:child_process'
import { developmentEnv } from './dev-env.js'
let env
try { env = developmentEnv() } catch (error) { console.error(error.message); process.exit(1) }
const children = ['server', 'client'].map(workspace => spawn('npm', ['run', 'dev', '--workspace', workspace], { stdio: 'inherit', env }))
let closing = false
function close(code = 0) { if (closing) return; closing = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code }
children.forEach(child => { child.on('exit', code => close(code ?? 1)); child.on('error', error => { console.error(error.message); close(1) }) })
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close())
