import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const destination = 'appuser@tc2'
const port = '18847'

// Node's .env parser does not support arbitrary quote escaping. Round-trip
// each candidate so passwords are never silently changed when written.
function envValue(value) {
  for (const quote of ["'", '"', '`']) {
    const encoded = quote + value + quote
    if (parseEnv('VALUE=' + encoded).VALUE === value) return encoded
  }
  throw new Error('Password cannot be represented in .env; avoid combining all three quote characters.')
}

function passwordOption() {
  let password = process.env.RELEASE_TEACHER_PASSWORD
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--password') {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
        throw new Error('Usage: npm run release -- --password <password>')
      }
      password = args[++i]
    } else if (args[i].startsWith('--password=')) {
      password = args[i].slice('--password='.length)
    } else {
      throw new Error('Unknown release option. Usage: npm run release -- --password <password>')
    }
  }
  if (password !== undefined) {
    if (!password || password === '请改成你的密码' || password.includes('\0')) {
      throw new Error('Provide a non-empty teacher password, different from the example placeholder, without NUL characters.')
    }
    envValue(password)
  }
  return password
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.signal || result.status}`)
  }
}

try {
  const password = passwordOption()
  // Do not pass this release-only secret to the build or SSH child environment.
  delete process.env.RELEASE_TEACHER_PASSWORD
  run('npm', ['run', 'build'])
  run('ssh', ['-p', port, destination, 'mkdir -p ~/apps/logistic'])
  // scp uses uppercase -P for the SSH port.
  run('scp', ['-P', port, 'dist/logistic-abc-server.tar.gz', `${destination}:~/apps/logistic/`])
  run('ssh', ['-p', port, destination, 'bash -ls'], {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: `set -eo pipefail
# Login profiles may skip nvm initialization in non-interactive sessions.
# Load it explicitly when node is missing; enable nounset only afterwards.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="\${NVM_DIR:-\${XDG_CONFIG_HOME:+$XDG_CONFIG_HOME/}nvm}"
  if [[ "$NVM_DIR" == nvm ]]; then export NVM_DIR="$HOME/.nvm"; fi
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    . "$NVM_DIR/nvm.sh"
  fi
fi
set -u
if ! command -v node >/dev/null 2>&1; then
  echo '远端未找到 Node.js。请为 appuser 安装 Node.js ≥ 26.0.0，并在登录环境的 PATH 中配置 node；使用 nvm 时请设置默认版本（nvm alias default 26）。' >&2
  exit 1
fi
node --input-type=module -e '
const [major] = process.versions.node.split(".").map(Number);
if (major < 26) {
  console.error("远端需要 Node.js ≥ 26.0.0，当前版本：" + process.version);
  process.exit(1);
}
'
cd "$HOME/apps/logistic"
tar -xzf logistic-abc-server.tar.gz
cd server
chmod +x ./*.sh
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
${password === undefined ? '' : `node --input-type=module <<'RELEASE_PASSWORD_NODE'
import fs from 'node:fs';
import { parseEnv } from 'node:util';
${envValue.toString()}
const password = Buffer.from('${Buffer.from(password).toString('base64')}', 'base64').toString('utf8');
const settings = parseEnv(fs.readFileSync('.env', 'utf8'));
settings.TEACHER_PASSWORD = password;
const content = Object.entries(settings).map(([key, value]) => key + '=' + envValue(value)).join(String.fromCharCode(10)) + String.fromCharCode(10);
const temporary = '.env.release-' + process.pid;
try {
  fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, '.env');
} finally {
  fs.rmSync(temporary, { force: true });
}
RELEASE_PASSWORD_NODE
`}
node --input-type=module -e '
import fs from "node:fs";
import { parseEnv } from "node:util";
const settings = { ...parseEnv(fs.readFileSync(".env", "utf8")), ...process.env };
if (!settings.TEACHER_PASSWORD || settings.TEACHER_PASSWORD === "请改成你的密码") {
  console.error("请先在 ~/apps/logistic/server/.env 设置 TEACHER_PASSWORD。");
  process.exit(1);
}
'
./stop.sh
./start.sh
./query.sh
`,
  })
  console.log('发布完成：appuser@tc2:~/apps/logistic/server')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
