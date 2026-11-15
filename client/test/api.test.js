import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api, requests } from '../src/api.js'

test('空代理错误和 HTML 响应显示可操作提示，不泄漏 JSON 解析错误', async t => {
  for (const [body, status, code] of [['', 500, 'NETWORK'], ['<html>Bad Gateway</html>', 502, 'NETWORK'], ['', 200, 'INVALID_RESPONSE']]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status }))
    await assert.rejects(api('/round'), error => error.code === code && error.status === status && /后端已启动/.test(error.message))
    assert.equal(requests.loading, false)
    t.mock.restoreAll()
  }
})
test('保留 API 的业务错误，合法 JSON 正常返回', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'NO_ROUND', message: '老师还没有开始实训' } }, { status: 404 }))
  await assert.rejects(api('/round'), error => error.code === 'NO_ROUND' && error.status === 404)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }))
  assert.deepEqual(await api('/health'), { ok: true })
})
test('空 JSON 值不会引发 TypeError', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(null))
  await assert.rejects(api('/health'), error => error.code === 'INVALID_RESPONSE')
})
test('教师提交列表允许 JSON 数组', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([]))
  assert.deepEqual(await api('/teacher/submissions'), [])
})
