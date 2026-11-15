#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/service-env.sh"
if ! owned_process; then echo '本应用未运行（不会停止其他进程）。'; exit 0; fi
kill -TERM "${APP_PID}"
for ((attempt=0; attempt<30; attempt++)); do
  if ! owned_process; then echo '已停止。'; exit 0; fi
  sleep 0.2
done
echo '服务仍在停止，请稍后运行 query.sh 查看状态。'
exit 1
