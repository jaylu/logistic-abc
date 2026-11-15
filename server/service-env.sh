#!/usr/bin/env bash
# Shared service settings; parse .env with Node rather than execute it as shell code.
set -euo pipefail
SERVER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${SERVER_DIR}"
CONFIG=()
while IFS= read -r line; do CONFIG+=("$line"); done < <(node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
console.log(path.resolve(process.env.DATA_DIR || "./runtime"));
console.log(process.env.PORT || "3000");
')
DATA_DIR="${CONFIG[0]:-}"
PORT="${CONFIG[1]:-}"
if [[ -z "${DATA_DIR}" || -z "${PORT}" ]]; then echo '无法读取配置，请检查 Node.js ≥ 22.13 和 .env。' >&2; exit 1; fi
PID_FILE="${DATA_DIR}/app.pid"
LOG_FILE="${DATA_DIR}/app.log"
APP_ENTRY="${SERVER_DIR}/src/index.js"
owned_process() {
  [[ -f "${PID_FILE}" ]] || return 1
  read -r APP_PID < "${PID_FILE}"
  [[ "${APP_PID}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${APP_PID}" 2>/dev/null || return 1
  local command
  command="$(ps -p "${APP_PID}" -o args= 2>/dev/null)" || return 1
  [[ "$command" == *"node ${APP_ENTRY}" || "$command" == *"node ${APP_ENTRY} "* ]]
}
