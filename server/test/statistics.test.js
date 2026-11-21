import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { roundStatistics } from '../src/statistics.js'
import { classifyAbc } from '../src/calc.js'
import { statisticsCsv } from '../src/csv.js'
const scenario = JSON.parse(fs.readFileSync(new URL('../data/default-scenario.json', import.meta.url)))
const round = { id: 'test-round', scenario }
function submission(improvement, reflection = '') {
  return { id: String(improvement), studentId: 'S1', studentName: '学生', answer: { abcAnswers: { ...classifyAbc(scenario.products, scenario.thresholds).classes }, reflection }, result: { scores: { total: 80 }, metrics: { improvement, baselineCost: 100, currentCost: 100 * (1 - improvement), placementValid: true, slotCapacityErrors: [] } } }
}
test('空数据和历史缺失数据不冒充零分或通过', () => {
  const empty = roundStatistics(round, [])
  assert.equal(empty.averageAccuracy, null)
  assert.equal(empty.tasks[0].rate, null)
  const s = submission(0); delete s.result.metrics.placementValid; delete s.result.metrics.slotCapacityErrors
  const stats = roundStatistics(round, [s])
  assert.equal(stats.tasks[1].participants, 0)
  assert.equal(stats.capacityViolations, null)
  assert.equal(stats.tasks[3].rate, null)
})
test('分类错误、负改善、满分边界与反思量表达成', () => {
  const students = [-0.1, 0, 0.1, scenario.fullScoreImprovement].map(v => submission(v))
  const sku = scenario.products[0].sku
  students[0].answer.abcAnswers[sku] = 'X'
  students[1].answer.reflection = '因为周转量高的商品应该靠近出库口以缩短拣货距离。如果订单结构变化，我会重新计算ABC并重新分配储位。'
  const stats = roundStatistics(round, students)
  assert.deepEqual(stats.distribution.map(d => d.count), [1, 1, 1, 1])
  assert.equal(stats.products[0].sku, sku)
  assert.equal(stats.products[0].errorRate, 0.25)
  assert.equal(stats.tasks[0].achieved, 3)
  assert.equal(stats.tasks[4].achieved, 1)
  assert.equal(stats.averageAccuracy, 47 / 48)
})
test('审核按实际出题数统计，误标与漏标分开，无题字段保留误标', () => {
  const s = submission(0)
  s.result.review = { correctMarks: 1, wrongMarks: 1, missedMarks: 1, marks: [{ rowId: 'P01', fieldKey: 'sku' }, { rowId: 'P03', fieldKey: 'unit' }], document: { errorCells: [{ rowId: 'P01', fieldKey: 'sku' }, { rowId: 'P02', fieldKey: 'sku' }] } }
  const stats = roundStatistics(round, [s])
  const sku = stats.fields.find(f => f.fieldKey === 'sku')
  assert.equal(sku.recognitionRate, 0.5)
  assert.equal(sku.missed, 1)
  const unit = stats.fields.find(f => f.fieldKey === 'unit')
  assert.equal(unit.recognitionRate, null)
  assert.equal(unit.wrong, 1)
  assert.equal(stats.tasks[3].achieved, 0)
  stats.products[0].name = '=evil,"测试"'
  const csv = statisticsCsv(stats)
  assert.match(csv, /未出题/)
  assert.match(csv, /""测试""/)
})
