import { spawn } from 'node:child_process'
const children = ['server', 'client'].map(workspace => spawn('npm', ['run', 'dev', '--workspace', workspace], { stdio: 'inherit' }))
let closing = false
function close(code = 0) { if (closing) return; closing = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code }
children.forEach(child => { child.on('exit', code => close(code ?? 1)); child.on('error', error => { console.error(error.message); close(1) }) })
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close())
