import { classifyAbc } from './calc.js'
import { bestPlacement, availableLocations, moveProduct } from './warehouse.js'
import { createReview, reviewDocument } from './review.js'

export const demoReflection = '因为周转量高的A类商品拣货频繁，所以优先放在靠近出库口的位置，以缩短拣货距离。如果订单结构变化，我会重新计算并更新ABC分类，再按新结果重新分配储位，同时复核容量、堆高和载荷。'

export function demoMarks(placement, scenario, context, review) {
  return reviewDocument(placement, scenario, context, review).errorCells
    .slice(0, scenario.documentReview.maxMarks).map(({ rowId, fieldKey }) => ({ rowId, fieldKey }))
}

export function demoSubmission(round, studentId, index) {
  const scenario = round.scenario
  const abcAnswers = { ...classifyAbc(scenario.products, scenario.thresholds).classes }
  scenario.products.forEach((p, j) => {
    if (index % 5 && (j + index) % 5 < index % 5) abcAnswers[p.sku] = { A: 'B', B: 'C', C: 'A' }[abcAnswers[p.sku]]
  })
  let placement = index % 5 === 4 ? { ...scenario.baselinePlacement } : bestPlacement(scenario)
  const slots = availableLocations(scenario)
  for (let j = 0; j < index % 5 * 3; j++) {
    const move = moveProduct(placement, scenario.products[(index + j) % scenario.products.length].sku, slots[(index * 7 + j * 3) % slots.length], scenario)
    if (!move.errors.length) placement = move.placement
  }
  const context = { sessionId: round.id, studentId }
  const review = createReview(placement, scenario, context, `demo-${index}`, new Date().toISOString())
  const correct = demoMarks(placement, scenario, context, review)
  review.marks = correct.slice(0, Math.max(0, correct.length - index % (correct.length + 1)))
  if (index % 3 && review.marks.length < scenario.documentReview.maxMarks) {
    const wrong = scenario.products.flatMap(p => scenario.documentReview.allowedErrorFields.map(fieldKey => ({ rowId: p.sku, fieldKey })))
      .find(m => !correct.some(c => c.rowId === m.rowId && c.fieldKey === m.fieldKey))
    if (wrong) review.marks.push(wrong)
  }
  review.completed = true
  return { roundId: round.id, schemaVersion: 3, studentId, studentName: `演示学生${index}`, abcAnswers, placement, review,
    reflection: [demoReflection, '将周转量高的商品放在靠近出库口的位置，减少拣货距离。', '本次完成了分类和储位规划。', ''][index % 4] }
}
