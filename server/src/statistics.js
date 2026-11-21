import { analyzeReflection, classifyAbc } from './calc.js'

export const FIELD_LABELS = { locationCode: '储位编码', productName: '货品名称', sku: '货品编号', specification: '规格', expectedCartons: '应放数量', actualCartons: '实放数量', unit: '单位' }
const ratio = (n, d) => d ? n / d : null
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const key = cell => `${cell.rowId}:${cell.fieldKey}`

// Only persisted final submissions are included. The scenario belongs to this round.
export function roundStatistics(round, submissions) {
  const scenario = round.scenario, n = submissions.length
  const classes = classifyAbc(scenario.products, scenario.thresholds).classes
  const products = scenario.products.map(p => {
    const errors = submissions.filter(s => s.answer.abcAnswers[p.sku] !== classes[p.sku]).length
    return { sku: p.sku, name: p.name, correctClass: classes[p.sku], errors, participants: n, errorRate: ratio(errors, n) }
  }).sort((a, b) => b.errors - a.errors || a.sku.localeCompare(b.sku))
  const reviews = submissions.filter(s => s.result.review)
  const fields = (scenario.documentReview?.allowedErrorFields ?? []).map(fieldKey => {
    let correct = 0, missed = 0, wrong = 0
    for (const s of reviews) {
      const review = s.result.review
      const truth = new Set(review.document.errorCells.map(key)), marks = new Set(review.marks.map(key))
      for (const cell of review.document.errorCells.filter(c => c.fieldKey === fieldKey)) {
        if (marks.has(key(cell))) correct++; else missed++
      }
      wrong += review.marks.filter(c => c.fieldKey === fieldKey && !truth.has(key(c))).length
    }
    return { fieldKey, label: FIELD_LABELS[fieldKey] ?? fieldKey, correct, missed, wrong, errors: correct + missed, recognitionRate: ratio(correct, correct + missed) }
  })
  const improvements = submissions.map(s => s.result.metrics.improvement)
  const threshold = scenario.fullScoreImprovement
  const distribution = [
    { label: '成本增加', count: improvements.filter(v => v < 0).length },
    { label: '未改善', count: improvements.filter(v => v === 0).length },
    { label: '有改善，未达满分线', count: improvements.filter(v => v > 0 && v < threshold).length },
    { label: '达到满分线', count: improvements.filter(v => v >= threshold).length },
  ]
  const reflections = submissions.map(s => {
    const analysis = s.result.metrics.reflectionAnalysis ?? analyzeReflection(s.answer.reflection)
    return { id: s.id, studentId: s.studentId, studentName: s.studentName, text: s.answer.reflection, chars: analysis.chars, analysis }
  })
  const validity = submissions.filter(s => typeof s.result.metrics.placementValid === 'boolean')
  const capacity = submissions.filter(s => Array.isArray(s.result.metrics.slotCapacityErrors))
  const reviewTotals = Object.fromEntries(['correctMarks', 'wrongMarks', 'missedMarks'].map(k => [k, reviews.reduce((sum, s) => sum + s.result.review[k], 0)]))
  const task = (label, criterion, achieved, participants) => ({ label, criterion, achieved, participants, rate: ratio(achieved, participants) })
  return {
    roundId: round.id, startedAt: round.startedAt, count: n, threshold,
    costUnit: scenario.schemaVersion === 3 ? '加权等效米' : '米（历史版本）',
    averageScore: mean(submissions.map(s => s.result.scores.total)),
    averageAccuracy: n ? 1 - products.reduce((sum, p) => sum + p.errors, 0) / (n * products.length) : null,
    averageImprovement: mean(improvements),
    averageBaselineCost: mean(submissions.map(s => s.result.metrics.baselineCost ?? s.result.metrics.baselineDistance)),
    averageCurrentCost: mean(submissions.map(s => s.result.metrics.currentCost ?? s.result.metrics.currentDistance)),
    capacityViolations: capacity.length ? capacity.reduce((sum, s) => sum + s.result.metrics.slotCapacityErrors.length, 0) : null,
    capacityParticipants: capacity.length,
    tasks: [
      task('ABC分类', '全部商品分类正确', submissions.filter(s => scenario.products.every(p => s.answer.abcAnswers[p.sku] === classes[p.sku])).length, n),
      task('容量与储位合法性', '最终方案通过容量、堆高、载荷与货位校验', validity.filter(s => s.result.metrics.placementValid).length, validity.length),
      task('储位合理性与效率', `改善率达到本轮满分线 ${+(threshold * 100).toFixed(2)}%`, distribution[3].count, n),
      task('单据审核', '全部错误正确标注，且无误标', reviews.filter(s => s.result.review.missedMarks === 0 && s.result.review.wrongMarks === 0).length, reviews.length),
      task('反思说明', '反思量表原始分达到6/10', reflections.filter(r => r.analysis.score >= 6).length, n),
    ],
    products, distribution, fields, reviewTotals, reviewParticipants: reviews.length,
    reflections, reflectionFilled: reflections.filter(r => r.chars > 0).length,
  }
}
