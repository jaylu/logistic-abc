import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateScenario, normalizeScenario } from '../src/scenario.js'
const scenario = JSON.parse(fs.readFileSync(new URL('./fixtures/scenario-v1.json', import.meta.url)))
test('场景验证拒绝无法精确计算的周转量', () => {
  assert.deepEqual(validateScenario(scenario), [])
  for (const value of [Infinity, Number.MAX_VALUE, 0, -1, 1.5]) {
    const s = structuredClone(scenario); s.products[0].turnover = value
    assert.ok(validateScenario(s).length)
  }
  const s = structuredClone(scenario); s.products[0].turnover = Number.MAX_SAFE_INTEGER
  assert.match(validateScenario(s).join(), /安全计算范围/)
})
test('场景验证拒绝不可达和多个取货点的储位', () => {
  const s = structuredClone(scenario); s.map = ['E#S.', '####']
  assert.match(validateScenario(s).join(), /无法从出库口到达/)
  s.map = ['E..', '.S.', '###']
  assert.match(validateScenario(s).join(), /恰好与一个通道格相邻/)
})

test('两个因子分别校验且只保存商品新字段', () => {
  const extra = structuredClone(scenario); extra.products[0].pickFrequency = 999
  assert.deepEqual(Object.keys(normalizeScenario(extra).products[0]), ['sku', 'name', 'turnover'])
  for (const factor of ['turnover', 'itemCount']) {
    for (const limits of [null, { a: 0, b: 0.5 }, { a: 0.8, b: 0.8 }, { a: 0.8, b: 1 }, { a: 0.8, b: NaN }]) {
      const s = structuredClone(scenario); s.thresholds[factor] = limits
      assert.match(validateScenario(s).join(), /阈值/)
    }
  }
})
