#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/service-env.sh"
if ! owned_process; then echo "本应用未运行，配置端口 ${PORT}。"; exit 0; fi
echo "正在运行，PID ${APP_PID}，端口 ${PORT}。"
node --input-type=module -e 'try { const r = await fetch("http://127.0.0.1:" + process.argv[1] + "/api/health", { signal: AbortSignal.timeout(3000) }); if (!r.ok) throw new Error("HTTP " + r.status); console.log("健康检查：", await r.json()) } catch(e) { console.error("健康检查失败：", e.message); process.exitCode=1 }' "${PORT}"
