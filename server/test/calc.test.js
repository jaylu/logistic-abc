import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as serverCalc from '../src/calc.js'
import * as clientCalc from '../../client/src/calc.js'

const scenario = JSON.parse(fs.readFileSync(new URL('../data/default-scenario.json', import.meta.url)))

// 前后端各有一份 calc.js，同一组用例分别运行，保证结果一致
for (const [side, calc] of [['server', serverCalc], ['client', clientCalc]]) {
  test(`[${side}] 默认场景的 ABC 分类`, () => {
    const { classes } = calc.classifyAbc(scenario.products, scenario.thresholds)
    const group = (cls) => Object.keys(classes).filter((k) => classes[k] === cls).sort()
    assert.deepEqual(group('A'), ['P01', 'P02', 'P03', 'P04', 'P05'])
    assert.deepEqual(group('B'), ['P06', 'P07', 'P08', 'P09'])
    assert.deepEqual(group('C'), ['P10', 'P11', 'P12'])
  })

  test(`[${side}] 同销售额按 SKU 排序，加入前累计恰好等于阈值时归入下一类`, () => {
    const products = [
      { sku: 'B', monthlySalesQty: 1, unitPrice: 50, pickFrequency: 1 },
      { sku: 'A', monthlySalesQty: 1, unitPrice: 50, pickFrequency: 1 },
      { sku: 'C', monthlySalesQty: 1, unitPrice: 0.01, pickFrequency: 1 },
    ]
    // 总额 10001 分：A 前 0 → A；B 前 5000/10001 < 0.5 → A；C 前 10000/10001 ≥ 0.9 → C
    const { rows, classes } = calc.classifyAbc(products, { a: 0.5, b: 0.9 })
    assert.deepEqual(rows.map((r) => r.sku), ['A', 'B', 'C'])
    assert.deepEqual(classes, { A: 'A', B: 'A', C: 'C' })

    const even = [
      { sku: 'X', monthlySalesQty: 1, unitPrice: 1, pickFrequency: 1 },
      { sku: 'Y', monthlySalesQty: 1, unitPrice: 1, pickFrequency: 1 },
    ]
    // Y 加入前累计正好 50%，阈值 a = 0.5 → 不小于阈值，归 B
    assert.deepEqual(calc.classifyAbc(even, { a: 0.5, b: 0.9 }).classes, { X: 'A', Y: 'B' })
  })

  test(`[${side}] 地图解析与 BFS 距离`, () => {
    const { slots, errors } = calc.parseMap(scenario.map, scenario.cellSizeMeters)
    assert.deepEqual(errors, [])
    assert.equal(slots.length, 12)
    const d = Object.fromEntries(slots.map((s) => [s.slotId, s.distance]))
    assert.equal(d['R1-S1'], 5)
    assert.equal(d['R2-S6'], 30)

    // 不能穿过 #，只能绕行
    const walled = calc.parseMap(['E#S', '.#.', '...'], 1)
    assert.deepEqual(walled.errors, [])
    assert.equal(walled.slots[0].steps, 5)
    const blocked = calc.parseMap(['E#S.', '####'], 1)
    assert.match(blocked.errors.join(), /无法从出库口到达/)
  })

  test(`[${side}] 自定义阈值保留超过四位小数的精度`, () => {
    const products = [
      { sku: 'A', monthlySalesQty: 1, unitPrice: 1 },
      { sku: 'B', monthlySalesQty: 1, unitPrice: 1 },
    ]
    assert.equal(calc.classifyAbc(products, { a: 0.50001, b: 0.95 }).classes.B, 'A')
    assert.equal(calc.classifyAbc(products, { a: 0.5, b: 0.50001 }).classes.B, 'B')
  })

  test(`[${side}] 拣货距离、改善率与参考指标`, () => {
    const m = calc.layoutMetrics(scenario, scenario.baselinePlacement)
    assert.equal(m.baselineDistance, 95100)
    assert.equal(m.improvement, 0)
    const ref = calc.referenceMetrics(scenario)
    assert.equal(ref.bestImprovement.toFixed(3), '0.544')
    assert.equal(ref.abcImprovement.toFixed(3), '0.139')
    assert.deepEqual(ref.classCounts, { A: 5, B: 4, C: 3 })
  })

  test(`[${side}] 评分规则`, () => {
    const { classes } = calc.classifyAbc(scenario.products, scenario.thresholds)
    const base = { abcAnswers: classes, placement: scenario.baselinePlacement, reflection: '' }
    let r = calc.scoreSubmission(scenario, base)
    assert.deepEqual(r.scores, { abc: 50, layout: 0, reflection: 0, total: 50 })

    const tenOfTwelve = { ...classes, P01: 'B', P02: 'C' }
    assert.equal(calc.scoreSubmission(scenario, { ...base, abcAnswers: tenOfTwelve }).scores.abc, 41.7)

    // 改善率 15% 得 20 分、≥ 30% 得 40 分
    const half = { ...scenario, fullScoreImprovement: 0.3 }
    const swap = { ...scenario.baselinePlacement, P09: 'R1-S1', P01: 'R2-S6' }
    r = calc.scoreSubmission(half, { ...base, placement: swap })
    const expected = calc.round1(Math.min(r.metrics.improvement / 0.3, 1) * 40)
    assert.equal(r.scores.layout, expected)
    assert.equal(calc.scoreSubmission({ ...scenario, fullScoreImprovement: r.metrics.improvement * 2 }, { ...base, placement: swap }).scores.layout, 20)
    assert.equal(calc.scoreSubmission({ ...scenario, fullScoreImprovement: r.metrics.improvement }, { ...base, placement: swap }).scores.layout, 40)

    for (const [n, score] of [[9, 0], [10, 5], [29, 5], [30, 10]]) {
      assert.equal(calc.reflectionScore('  ' + '字'.repeat(n) + '  '), score, `${n} 字`)
    }
    assert.equal(calc.countChars('😀😀'), 2)
  })
}
