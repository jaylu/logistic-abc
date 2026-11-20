import { getPlacementCost, getStorageMetrics, getImprovementRate, bestPlacement } from './warehouse.js'
import { reviewDocument, scoreReview } from './review.js'
// ABC 分类、仓库距离与评分的纯函数。
// 本文件在 client/src/calc.js 有一份相同副本，两端由同一组测试保证结果一致。

export const SCORE_MAX = { abc: 50, layout: 40, reflection: 10 }
export const REFLECTION_MAX_CHARS = 1000

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function round1(x) {
  return Math.round(x * 10) / 10
}

export function countChars(text) {
  return Array.from(String(text ?? '').trim()).length
}

// 解析字符地图：E 出库口、. 通道、S 储位、# 不可通行。
// 返回储位列表（含取货点和距离）及发现的问题。
export function parseMap(map, cellSizeMeters = 1) {
  const errors = []
  const height = map.length
  const width = height ? map[0].length : 0
  const walkable = (r, c) => r >= 0 && r < height && c >= 0 && c < width && (map[r][c] === '.' || map[r][c] === 'E')

  let exit = null
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (map[r][c] === 'E') exit = { row: r, col: c }
    }
  }

  const steps = new Map()
  if (exit) {
    const key = (r, c) => r * width + c
    steps.set(key(exit.row, exit.col), 0)
    const queue = [[exit.row, exit.col]]
    while (queue.length) {
      const [r, c] = queue.shift()
      for (const [dr, dc] of DIRS) {
        const nr = r + dr
        const nc = c + dc
        if (walkable(nr, nc) && !steps.has(key(nr, nc))) {
          steps.set(key(nr, nc), steps.get(key(r, c)) + 1)
          queue.push([nr, nc])
        }
      }
    }
  }

  const slots = []
  let shelf = 0
  for (let r = 0; r < height; r++) {
    if (!map[r].includes('S')) continue
    shelf++
    let index = 0
    for (let c = 0; c < width; c++) {
      if (map[r][c] !== 'S') continue
      index++
      const slotId = `R${shelf}-S${index}`
      const adjacent = DIRS.map(([dr, dc]) => [r + dr, c + dc]).filter(([nr, nc]) => walkable(nr, nc))
      if (adjacent.length !== 1) {
        errors.push(`储位 ${slotId} 必须恰好与一个通道格相邻（当前 ${adjacent.length} 个）`)
        continue
      }
      const [pr, pc] = adjacent[0]
      const s = exit ? steps.get(pr * width + pc) : undefined
      if (s === undefined) {
        errors.push(`储位 ${slotId} 无法从出库口到达`)
        continue
      }
      slots.push({ slotId, row: r, col: c, pickRow: pr, pickCol: pc, steps: s, distance: s * cellSizeMeters })
    }
  }

  return { width, height, exit, slots, errors }
}

export function slotDistances(scenario) {
  const { slots } = parseMap(scenario.map, scenario.cellSizeMeters)
  return Object.fromEntries(slots.map((s) => [s.slotId, s.distance]))
}

// 按周转量降序、SKU 升序；两个累计值都包含当前商品，取较低等级。
export function classifyAbc(products, thresholds) {
  if (!thresholds.turnover && typeof thresholds.a === 'number') return classifyLegacyAbc(products, thresholds)
  const rows = products.map(({ sku, name, turnover }) => ({ sku, name, turnover }))
  rows.sort((x, y) => y.turnover - x.turnover || (x.sku < y.sku ? -1 : x.sku > y.sku ? 1 : 0))
  const total = rows.reduce((sum, r) => sum + r.turnover, 0)
  // 用整数分数比较，阈值边界归前一类，不依赖显示舍入。
  const fraction = (value) => {
    const [mantissa, exponent = '0'] = String(value).split('e')
    const digits = (mantissa.split('.')[1] || '').length - Number(exponent)
    return [BigInt(mantissa.replace('.', '')) * 10n ** BigInt(Math.max(0, -digits)), 10n ** BigInt(Math.max(0, digits))]
  }
  const grade = (count, sum, limits) => {
    for (const [index, key] of ['a', 'b'].entries()) {
      const [numerator, denominator] = fraction(limits[key])
      if (BigInt(count) * denominator <= numerator * BigInt(sum)) return index
    }
    return 2
  }
  const classes = {}
  let cum = 0
  rows.forEach((row, index) => {
    cum += row.turnover
    row.share = row.turnover / total
    row.cumAfter = cum / total
    row.itemCumAfter = (index + 1) / rows.length
    row.cls = ['A', 'B', 'C'][Math.max(grade(cum, total, thresholds.turnover), grade(index + 1, rows.length, thresholds.itemCount))]
    classes[row.sku] = row.cls
  })
  return { rows, total, classes }
}

// 仅用于读取已保存的旧轮次，旧快照和评分规则保持不变。
function classifyLegacyAbc(products, thresholds) {
  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    salesCents: p.monthlySalesQty * Math.round(p.unitPrice * 100),
  }))
  rows.sort((x, y) => y.salesCents - x.salesCents || (x.sku < y.sku ? -1 : x.sku > y.sku ? 1 : 0))
  const total = rows.reduce((sum, r) => sum + r.salesCents, 0)
  // Preserve every decimal digit of the configured thresholds, including scientific notation.
  const fraction = (value) => {
    const [mantissa, exponent = '0'] = String(value).split('e')
    const digits = (mantissa.split('.')[1] || '').length - Number(exponent)
    return [BigInt(mantissa.replace('.', '')) * 10n ** BigInt(Math.max(0, -digits)), 10n ** BigInt(Math.max(0, digits))]
  }
  const [aNumerator, aDenominator] = fraction(thresholds.a)
  const [bNumerator, bDenominator] = fraction(thresholds.b)
  const totalInteger = BigInt(total)
  const classes = {}
  let cum = 0
  for (const row of rows) {
    row.share = total ? row.salesCents / total : 0
    row.cumBefore = total ? cum / total : 0
    row.cumAfter = total ? (cum + row.salesCents) / total : 0
    row.cls = BigInt(cum) * aDenominator < aNumerator * totalInteger ? 'A' : BigInt(cum) * bDenominator < bNumerator * totalInteger ? 'B' : 'C'
    classes[row.sku] = row.cls
    cum += row.salesCents
  }
  return { rows, total, classes }
}

export function pickDistance(placement, products, distances) {
  let sum = 0
  for (const p of products) sum += 2 * distances[placement[p.sku]] * (p.turnover ?? p.pickFrequency)
  return sum
}

export function improvementRate(baseline, current) {
  return baseline > 0 ? (baseline - current) / baseline : 0
}

export function layoutMetrics(scenario, placement) {
  if (scenario.schemaVersion === 3) {
    const baselineCost = getPlacementCost(scenario.baselinePlacement, scenario), currentCost = getPlacementCost(placement, scenario)
    return { baselineCost, currentCost, baselineDistance: baselineCost, currentDistance: currentCost, improvement: getImprovementRate(baselineCost, currentCost), ...getStorageMetrics(placement, scenario), simulated: true }
  }
  const distances = slotDistances(scenario)
  const baselineDistance = pickDistance(scenario.baselinePlacement, scenario.products, distances)
  const currentDistance = pickDistance(placement, scenario.products, distances)
  return { baselineDistance, currentDistance, improvement: improvementRate(baselineDistance, currentDistance) }
}

// 把商品按给定顺序依次放入离出库口最近的储位
function placeInOrder(scenario, orderedSkus) {
  const { slots } = parseMap(scenario.map, scenario.cellSizeMeters)
  const nearest = [...slots].sort((x, y) => x.distance - y.distance)
  return Object.fromEntries(orderedSkus.map((sku, i) => [sku, nearest[i].slotId]))
}

// 供教师参考：按周转量摆放（最优）与按 ABC 分类摆放的改善率
export function referenceMetrics(scenario) {
  if (scenario.schemaVersion === 3) {
    const best = layoutMetrics(scenario, bestPlacement(scenario)), counts = { A: 0, B: 0, C: 0 }
    for (const cls of Object.values(classifyAbc(scenario.products, scenario.thresholds).classes)) counts[cls]++
    return { baselineDistance: best.baselineCost, bestImprovement: best.improvement, abcImprovement: best.improvement, classCounts: counts }
  }
  const { classes, rows } = classifyAbc(scenario.products, scenario.thresholds)
  const byFrequency = [...scenario.products]
    .sort((x, y) => (y.turnover ?? y.pickFrequency) - (x.turnover ?? x.pickFrequency) || (x.sku < y.sku ? -1 : 1))
    .map((p) => p.sku)
  const byAbc = rows.map((r) => r.sku) // 已按周转量降序，A 类在前
  const best = layoutMetrics(scenario, placeInOrder(scenario, byFrequency))
  const abc = layoutMetrics(scenario, placeInOrder(scenario, byAbc))
  const counts = { A: 0, B: 0, C: 0 }
  for (const cls of Object.values(classes)) counts[cls]++
  return {
    baselineDistance: best.baselineDistance,
    bestImprovement: best.improvement,
    abcImprovement: abc.improvement,
    classCounts: counts,
  }
}

export function reflectionScore(text) {
  const n = countChars(text)
  return n >= 30 ? 10 : n >= 10 ? 5 : 0
}

function pct(x) {
  return `${round1(x * 100).toFixed(1)}%`
}

export function scoreSubmission(scenario, answer, context = {}) {
  if (scenario.schemaVersion === 3) {
    const w = scenario.scoring, metrics = layoutMetrics(scenario, answer.placement)
    const classes = classifyAbc(scenario.products, scenario.thresholds).classes
    const abcCorrect = scenario.products.filter(p => answer.abcAnswers[p.sku] === classes[p.sku]).length
    const document = reviewDocument(answer.placement, scenario, context, answer.review)
    const review = scoreReview(answer.review.marks, document.errorCells, scenario.documentReview, w.documentReview)
    const scores = { abc: round1(abcCorrect / scenario.products.length * w.abc), placementValidity: w.placementValidity, placementEfficiency: round1(Math.min(1, Math.max(0, metrics.improvement) / scenario.fullScoreImprovement) * w.placementEfficiency), documentReview: review.score, reflection: round1(reflectionScore(answer.reflection) / 10 * w.reflection) }
    scores.total = round1(Object.values(scores).reduce((a, b) => a + b, 0))
    return { scores, scoreMax: w, metrics: { ...metrics, abcCorrect, abcTotal: scenario.products.length, reflectionChars: countChars(answer.reflection), placementValid: true, slotCapacityErrors: [] }, review: { ...review, document, marks: answer.review.marks }, feedback: { abc: `分类正确 ${abcCorrect}/${scenario.products.length}`, placementValidity: '全部商品货位合法、唯一且容量足够', placementEfficiency: `模拟成本改善 ${pct(metrics.improvement)}，满分线 ${pct(scenario.fullScoreImprovement)}`, documentReview: `命中 ${review.correctMarks}，误标 ${review.wrongMarks}，漏标 ${review.missedMarks}`, reflection: '30字以上满分，10～29字半分；教师另行阅读内容' } }
  }
  const { classes } = classifyAbc(scenario.products, scenario.thresholds)
  const total = scenario.products.length
  const correct = scenario.products.filter((p) => answer.abcAnswers[p.sku] === classes[p.sku]).length
  const abc = round1((correct / total) * SCORE_MAX.abc)

  const metrics = layoutMetrics(scenario, answer.placement)
  const ratio = Math.min(Math.max(metrics.improvement, 0) / scenario.fullScoreImprovement, 1)
  const layout = round1(ratio * SCORE_MAX.layout)

  const chars = countChars(answer.reflection)
  const reflection = reflectionScore(answer.reflection)

  const full = pct(scenario.fullScoreImprovement)
  let layoutText
  if (metrics.improvement <= 0) layoutText = `改善率 ${pct(metrics.improvement)}，未比初始布局缩短，得 0 分`
  else if (ratio >= 1) layoutText = `改善率 ${pct(metrics.improvement)}，达到满分线 ${full}，得 ${layout} 分`
  else layoutText = `改善率 ${pct(metrics.improvement)}，满分线 ${full}，按比例得 ${layout} 分`

  return {
    scores: { abc, layout, reflection, total: round1(abc + layout + reflection) },
    metrics: { abcCorrect: correct, abcTotal: total, ...metrics, reflectionChars: chars },
    feedback: {
      abc: `分类正确 ${correct}/${total}，得 ${abc} 分`,
      layout: layoutText,
      reflection: `反思 ${chars} 字，得 ${reflection} 分（30 字以上满分，10～29 字得 5 分）`,
    },
  }
}
