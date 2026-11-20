import { validatePlacement, bestPlacement, getPlacementCost, isValidLocation, availableLocations } from './warehouse.js'
import { REVIEW_FIELDS, buildAllocationDocument, generateReviewErrors } from './review.js'
const positive = x => Number.isFinite(x) && x > 0 && x <= 1e7
const integer = x => Number.isSafeInteger(x) && x > 0 && x <= 1e7
export function validateScenarioV3(s) {
  const errors = []
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) errors.push('场景名称必填，最多80字')
  if (typeof s.description !== 'string' || s.description.length > 500) errors.push('场景说明格式错误')
  if (s.map !== undefined || s.cellSizeMeters !== undefined) errors.push('v3仅使用warehouse，不再使用旧字符地图')
  for (const factor of ['turnover', 'itemCount']) { const t = s.thresholds?.[factor]; if (!t || !Number.isFinite(t.a) || !Number.isFinite(t.b) || !(0 < t.a && t.a < t.b && t.b < 1)) errors.push(`${factor}阈值必须满足0<a<b<1`) }
  if (!Number.isInteger(s.abcCheckLimit) || s.abcCheckLimit < 0 || s.abcCheckLimit > 10) errors.push('检查次数应为0～10')
  if (!Number.isFinite(s.fullScoreImprovement) || s.fullScoreImprovement <= 0 || s.fullScoreImprovement > 1) errors.push('满分改善率应在0～1之间')
  const w = s.warehouse, l = w?.layout, slot = w?.slot, pallet = w?.pallet
  if (!w || !/^\d{2}$/.test(w.zoneCode) || w.entry?.id !== 'E01' || w.entry?.side !== 'west' || w.entry?.aisle !== 'central') errors.push('需要两位库区编号和西侧中央入口E01')
  if (!l || l.rows !== 2 || l.baysPerRow !== 4 || l.levelsPerBay !== 3 || l.slotsPerLevel !== 2) errors.push('货架必须为2排×4列×3层×2位，共48位')
  if (!positive(l?.bayPitchMm) || !positive(l?.mainAisleWidthMm)) errors.push('列中心距与通道宽度必须是有限正数')
  if (!slot || !positive(slot.clearWidthMm) || !positive(slot.clearDepthMm) || !Number.isFinite(slot.handlingClearanceMm) || slot.handlingClearanceMm < 0 || !Array.isArray(slot.levelClearHeightsMm) || slot.levelClearHeightsMm.length !== 3 || !slot.levelClearHeightsMm.every(positive)) errors.push('货位尺寸、三层净高和净空无效')
  if (!pallet || !['lengthMm', 'widthMm', 'heightMm', 'tareWeightKg', 'maxPayloadKg'].every(k => positive(pallet[k]))) errors.push('托盘尺寸、重量及载荷须为有限正数')
  if (w?.levelPenalties !== undefined && (!Array.isArray(w.levelPenalties) || w.levelPenalties.length !== 3 || !w.levelPenalties.every(x => Number.isFinite(x) && x >= 0 && x <= 1e4))) errors.push('层高惩罚须为三个非负有限数')
  if (!Array.isArray(s.products) || s.products.length < 2 || s.products.length > 30) errors.push('商品须为2～30种')
  else {
    const seen = new Set()
    for (const p of s.products) {
      if (!p || typeof p.sku !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(p.sku) || seen.has(p.sku)) { errors.push('SKU无效或重复'); continue }
      seen.add(p.sku)
      if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 || !integer(p.turnover)) errors.push(`${p.sku}名称或周转量无效`)
      if (!Number.isSafeInteger(p.stockCartons) || p.stockCartons < 0 || p.stockCartons > 1e7) errors.push(`${p.sku}库存箱数必须为非负整数`)
      if (!p.carton || !['lengthMm', 'widthMm', 'heightMm', 'grossWeightKg'].every(k => positive(p.carton[k])) || !integer(p.carton?.unitsPerCarton)) errors.push(`${p.sku}外箱尺寸、重量或件/箱无效`)
    }
  }
  const weights = ['abc', 'placementValidity', 'placementEfficiency', 'documentReview', 'reflection']
  if (!s.scoring || !weights.every(k => Number.isFinite(s.scoring[k]) && s.scoring[k] >= 0) || Object.keys(s.scoring).length !== weights.length || weights.reduce((n, k) => n + s.scoring[k], 0) !== 100) errors.push('五项评分权重必须为非负数且合计100')
  const d = s.documentReview, fields = d?.allowedErrorFields
  if (!d || d.enabled !== true || d.randomization !== 'deterministic-seeded' || typeof d.oneErrorPerRow !== 'boolean') errors.push('本次任务须启用确定性单据审核')
  if (!Array.isArray(fields) || !fields.length || new Set(fields).size !== fields.length || !fields.every(f => REVIEW_FIELDS.includes(f))) errors.push('审核字段白名单无效')
  if (!Number.isInteger(d?.errorCount) || d.errorCount < 1 || d.errorCount > (s.products?.length ?? 0) * (d?.oneErrorPerRow ? 1 : fields?.length ?? 0)) errors.push('审核错误数超出可用单元格')
  if (!Number.isInteger(d?.maxMarks ?? d?.errorCount) || (d.maxMarks ?? d.errorCount) < d.errorCount || (d.maxMarks ?? d.errorCount) > (s.products?.length ?? 0) * (fields?.length ?? 0)) errors.push('标注上限无效')
  if (!positive(d?.grading?.pointsPerCorrectMark) || !Number.isFinite(d?.grading?.penaltyPerWrongMark) || d.grading.penaltyPerWrongMark < 0) errors.push('审核奖惩比例无效')
  if (errors.length) return errors
  const disabled = w.disabledLocations
  if (disabled !== undefined) {
    if (!disabled || typeof disabled !== 'object' || Array.isArray(disabled)) return ['warehouse.disabledLocations必须是货位编码到不可用原因的对象']
    for (const [code, reason] of Object.entries(disabled)) {
      if (!isValidLocation(code, s)) errors.push(`不可用货位 ${code} 不存在`)
      if (typeof reason !== 'string' || !reason.trim() || reason.length > 60) errors.push(`货位 ${code} 的不可用原因须为1～60字`)
    }
  }
  if (errors.length) return errors
  if (availableLocations(s).length < s.products.length) return ['可用货位数少于商品数量，请开放更多货位']
  errors.push(...validatePlacement(s.baselinePlacement, s).map(e => `初始布局：${e}`))
  if (errors.length) return errors
  const baseline = getPlacementCost(s.baselinePlacement, s), best = bestPlacement(s)
  if (!Number.isFinite(baseline) || baseline <= 0 || baseline > Number.MAX_SAFE_INTEGER) errors.push('基线成本必须在安全计算范围内且大于0')
  else if ((baseline - getPlacementCost(best, s)) / baseline + 1e-10 < s.fullScoreImprovement) errors.push('满分改善率高于容量约束下可达到的最优改善率')
  try { generateReviewErrors(buildAllocationDocument(s.baselinePlacement, s, { sessionId: 'validation', studentId: 'test', studentName: '测试', createdAt: '2026-01-01' }), d, 'validation', s) } catch (e) { errors.push(e.message) }
  return errors
}
