#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/service-env.sh"
mkdir -p "${DATA_DIR}"
if ! mkdir "${DATA_DIR}/start.lock" 2>/dev/null; then echo '启动操作正在进行；如上次异常退出，请检查进程后移除 start.lock。'; exit 1; fi
trap 'rmdir "${DATA_DIR}/start.lock"' EXIT
if owned_process; then echo "已在运行，PID ${APP_PID}，端口 ${PORT}"; exit 0; fi
nohup node "${APP_ENTRY}" >> "${LOG_FILE}" 2>&1 &
APP_PID=$!
printf '%s\n' "${APP_PID}" > "${PID_FILE}"
sleep 1
if owned_process; then echo "已启动，PID ${APP_PID}，端口 ${PORT}，日志 ${LOG_FILE}"; else echo "启动失败，请查看 ${LOG_FILE}"; exit 1; fi
