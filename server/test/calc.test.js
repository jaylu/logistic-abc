import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as serverCalc from '../src/calc.js'
import * as clientCalc from '../../client/src/calc.js'

const scenario = JSON.parse(fs.readFileSync(new URL('./fixtures/scenario-v1.json', import.meta.url)))

// 前后端各有一份 calc.js，同一组用例分别运行，保证结果一致
for (const [side, calc] of [['server', serverCalc], ['client', clientCalc]]) {
  test(`[${side}] 默认场景的 ABC 分类`, () => {
    const { classes } = calc.classifyAbc(scenario.products, scenario.thresholds)
    const group = (cls) => Object.keys(classes).filter((k) => classes[k] === cls).sort()
    assert.deepEqual(group('A'), ['P09', 'P10'])
    assert.deepEqual(group('B'), ['P04', 'P06', 'P08', 'P11'])
    assert.deepEqual(group('C'), ['P01', 'P02', 'P03', 'P05', 'P07', 'P12'])
  })

  test(`[${side}] 双因子取较低等级，包含当前商品且边界归前一类`, () => {
    const products = [{ sku: 'B', turnover: 40 }, { sku: 'A', turnover: 40 }, { sku: 'C', turnover: 15 }, { sku: 'D', turnover: 5 }]
    const limits = { turnover: { a: 0.8, b: 0.95 }, itemCount: { a: 0.25, b: 0.75 } }
    const { rows, classes } = calc.classifyAbc(products, limits)
    assert.deepEqual(rows.map(r => r.sku), ['A', 'B', 'C', 'D'])
    assert.deepEqual(classes, { A: 'A', B: 'B', C: 'B', D: 'C' })
    assert.equal(rows[1].cumAfter, 0.8)
    assert.equal(rows[1].itemCumAfter, 0.5)
    // 周转量等级低于品项数时，同样取较低等级。
    assert.equal(calc.classifyAbc(products, { turnover: { a: 0.3, b: 0.7 }, itemCount: { a: 0.5, b: 0.75 } }).classes.A, 'B')
    const twenty = Array.from({ length: 20 }, (_, i) => ({ sku: String(i).padStart(2, '0'), turnover: 1 }))
    assert.equal(calc.classifyAbc(twenty, limits).rows[0].itemCumAfter, 0.05)
  })

  test(`[${side}] 旧轮次仍按原快照算法计算`, () => {
    const products = [{ sku: 'A', monthlySalesQty: 1, unitPrice: 1, pickFrequency: 2 }, { sku: 'B', monthlySalesQty: 1, unitPrice: 1, pickFrequency: 3 }]
    assert.deepEqual(calc.classifyAbc(products, { a: 0.5, b: 0.95 }).classes, { A: 'A', B: 'B' })
    assert.equal(calc.pickDistance({ A: 'S1', B: 'S2' }, products, { S1: 5, S2: 10 }), 80)
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

  test(`[${side}] 自定义阈值不受显示精度影响`, () => {
    const products = [{ sku: 'A', turnover: 1 }, { sku: 'B', turnover: 1 }]
    const thresholds = { turnover: { a: 0.49999, b: 0.95 }, itemCount: { a: 0.5, b: 0.95 } }
    assert.equal(calc.classifyAbc(products, thresholds).classes.A, 'B')
    thresholds.turnover.a = 0.5
    assert.equal(calc.classifyAbc(products, thresholds).classes.A, 'A')
  })

  test(`[${side}] 拣货距离、改善率与参考指标`, () => {
    const m = calc.layoutMetrics(scenario, scenario.baselinePlacement)
    assert.equal(m.baselineDistance, 95100)
    assert.equal(m.improvement, 0)
    const ref = calc.referenceMetrics(scenario)
    assert.equal(ref.bestImprovement.toFixed(3), '0.544')
    assert.equal(ref.abcImprovement.toFixed(3), '0.544')
    assert.deepEqual(ref.classCounts, { A: 2, B: 4, C: 6 })
  })

  test(`[${side}] 评分规则`, () => {
    const { classes } = calc.classifyAbc(scenario.products, scenario.thresholds)
    const base = { abcAnswers: classes, placement: scenario.baselinePlacement, reflection: '' }
    let r = calc.scoreSubmission(scenario, base)
    assert.deepEqual(r.scores, { abc: 50, layout: 0, reflection: 0, total: 50 })

    const tenOfTwelve = { ...classes, P09: 'B', P10: 'C' }
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
