import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateScenario } from '../src/scenario.js'
const scenario = JSON.parse(fs.readFileSync(new URL('../data/default-scenario.json', import.meta.url)))
test('场景验证拒绝无法精确计算的金额和频次', () => {
  assert.deepEqual(validateScenario(scenario), [])
  for (const value of [Infinity, Number.MAX_VALUE]) {
    const s = structuredClone(scenario); s.products[0].unitPrice = value
    assert.ok(validateScenario(s).length)
  }
  const s = structuredClone(scenario); s.products[0].monthlySalesQty = Number.MAX_SAFE_INTEGER
  assert.match(validateScenario(s).join(), /安全计算范围/)
})
test('场景验证拒绝不可达和多个取货点的储位', () => {
  const s = structuredClone(scenario); s.map = ['E#S.', '####']
  assert.match(validateScenario(s).join(), /无法从出库口到达/)
  s.map = ['E..', '.S.', '###']
  assert.match(validateScenario(s).join(), /恰好与一个通道格相邻/)
})
