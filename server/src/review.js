import { allLocations, validatePlacement } from './warehouse.js'
export const REVIEW_FIELDS = ['locationCode', 'productName', 'sku', 'specification', 'expectedCartons', 'actualCartons', 'unit']
export const specification = p => `${p.carton.lengthMm}×${p.carton.widthMm}×${p.carton.heightMm} mm/箱`
export const placementFingerprint = placement => JSON.stringify(Object.keys(placement).sort().map(sku => [sku, placement[sku]]))
function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function random(seed) { let a = hash(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function shuffle(values, rng) { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
export function buildAllocationDocument(placement, scenario, context) {
  const problems = validatePlacement(placement, scenario)
  if (problems.length) throw new Error(problems.join('；'))
  return {
    header: { jobNumber: `CW-${context.sessionId}-${context.studentId}`, inboundNumber: `RK-${context.sessionId}`, warehouse: scenario.warehouse.zoneCode, keeper: context.studentName, date: new Date(context.createdAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }), author: '模拟制单员', operator: context.studentName },
    rows: [...scenario.products].sort((a, b) => a.sku.localeCompare(b.sku)).map((p, i) => ({ rowId: p.sku, sequence: i + 1, zone: placement[p.sku].slice(0, 2), locationCode: placement[p.sku], productName: p.name, sku: p.sku, specification: specification(p), expectedCartons: p.stockCartons, actualCartons: p.stockCartons, unit: '箱', remarks: '按规划上架' })),
  }
}
function alternatives(field, row, scenario) {
  const values = field === 'locationCode' ? allLocations(scenario) : field === 'productName' ? scenario.products.map(p => p.name) : field === 'sku' ? scenario.products.map(p => p.sku) : field === 'specification' ? scenario.products.map(specification) : field === 'unit' ? ['件'] : [-3, -2, -1, 1, 2, 3].map(d => row[field] + d).filter(n => n > 0)
  return [...new Set(values)].filter(v => v !== row[field])
}
export function generateReviewErrors(document, config, seed, scenario) {
  const rng = random(seed), rows = document.rows.map(r => ({ ...r })), errorCells = []
  const candidates = shuffle(document.rows, rng).flatMap(row => shuffle(config.allowedErrorFields, rng).filter(field => alternatives(field, row, scenario).length).map(field => ({ row, field })))
  const usedRows = new Set()
  for (const { row, field } of candidates) {
    if (errorCells.length === config.errorCount) break
    if (config.oneErrorPerRow && usedRows.has(row.rowId)) continue
    const values = alternatives(field, row, scenario), displayedValue = values[Math.floor(rng() * values.length)]
    rows.find(r => r.rowId === row.rowId)[field] = displayedValue
    errorCells.push({ rowId: row.rowId, fieldKey: field, correctValue: row[field], displayedValue })
    usedRows.add(row.rowId)
  }
  if (errorCells.length !== config.errorCount) throw new Error('审核配置无法生成足量且不同的错误字段')
  return { ...document, rows, errorCells }
}
export function reviewSeed(scenario, context, review) { return JSON.stringify([context.sessionId, context.studentId, scenario.schemaVersion, scenario.scenarioRevision ?? '', review.placementFingerprint, review.reviewAttemptId]) }
export function createReview(placement, scenario, context, reviewAttemptId, createdAt) {
  const review = { reviewAttemptId, createdAt, placementFingerprint: placementFingerprint(placement), placementSnapshot: { ...placement }, marks: [], completed: false }
  review.reviewId = hash(reviewSeed(scenario, context, review)).toString(16)
  return review
}
export function reviewDocument(placement, scenario, context, review) {
  return generateReviewErrors(buildAllocationDocument(placement, scenario, { ...context, createdAt: review.createdAt }), scenario.documentReview, reviewSeed(scenario, context, review), scenario)
}
export function validateReview(review, placement, scenario, context) {
  if (!review || typeof review !== 'object') return ['请先完成储位分配单审核']
  const errors = [], fingerprint = placementFingerprint(placement)
  if (typeof review.reviewAttemptId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(review.reviewAttemptId)) errors.push('审核尝试编号无效')
  if (typeof review.createdAt !== 'string' || !Number.isFinite(Date.parse(review.createdAt))) errors.push('审核日期无效')
  if (review.placementFingerprint !== fingerprint || !review.placementSnapshot || placementFingerprint(review.placementSnapshot) !== fingerprint) errors.push('储位方案已改变，请重新完成审核')
  if (review.reviewId !== hash(reviewSeed(scenario, context, review)).toString(16)) errors.push('审核编号与当前课堂或方案不一致')
  if (review.completed !== true) errors.push('请完成审核后提交')
  if (!Array.isArray(review.marks) || review.marks.length > (scenario.documentReview.maxMarks ?? scenario.documentReview.errorCount)) errors.push('审核标注数量无效')
  else {
    const keys = new Set()
    for (const mark of review.marks) {
      if (!mark || !scenario.products.some(p => p.sku === mark.rowId) || !scenario.documentReview.allowedErrorFields.includes(mark.fieldKey)) { errors.push('审核标注行或字段无效'); continue }
      const key = `${mark.rowId}:${mark.fieldKey}`
      if (keys.has(key)) errors.push('审核标注不能重复')
      keys.add(key)
    }
  }
  return errors
}
export function scoreReview(marks, errorCells, config, weight = 20) {
  const truth = new Set(errorCells.map(c => `${c.rowId}:${c.fieldKey}`)), selected = new Set(marks.map(c => `${c.rowId}:${c.fieldKey}`))
  const correctMarks = [...selected].filter(k => truth.has(k)).length, wrongMarks = selected.size - correctMarks, missedMarks = truth.size - correctMarks
  const score = Math.round(Math.max(0, Math.min(weight, weight * (correctMarks - config.grading.penaltyPerWrongMark / config.grading.pointsPerCorrectMark * wrongMarks) / config.errorCount)) * 10) / 10
  return { correctMarks, wrongMarks, missedMarks, errorCount: truth.size, score }
}
