import { reactive } from 'vue'
export const requests = reactive({ loading: false })
let pending = 0, loadingTimer
export async function api(path, options = {}) {
  if (pending++ === 0) loadingTimer = setTimeout(() => { requests.loading = true }, 300)
  try { return await request(path, options) } finally {
    if (--pending === 0) { clearTimeout(loadingTimer); requests.loading = false }
  }
}
async function request(path, options) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin', signal: AbortSignal.timeout(15000), ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw Object.assign(new Error('无法连接服务器，请检查网络后重试。'), { code: 'NETWORK' })
  }
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error?.message || '请求失败，请重试。'), { code: data.error?.code, status: response.status })
  return data
}
export const post = (path, body) => api(path, { method: 'POST', body })
