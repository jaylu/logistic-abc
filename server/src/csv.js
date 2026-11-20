export function formatBeijingTime(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function cell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  // 防止 Excel 把用户输入当作公式执行
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const HEADERS = [
  '轮次', '学号', '姓名', '提交时间', '分类正确数', '商品总数', '分类得分', '布局得分', '反思得分', '总分',
  '初始指标（v3加权等效米/旧版米）', '当前指标（v3加权等效米/旧版米）', '改善率(%)', '反思内容',
  'placementValidityScore', 'placementEfficiencyScore', 'documentReviewScore', 'documentReviewCorrectMarks', 'documentReviewWrongMarks', 'documentReviewMissedMarks', 'documentReviewErrorCount', 'baselineCost', 'currentCost', 'placementValid', 'occupiedSlots', 'slotCapacityErrors', '储位编码清单', 'availableSlots', 'disabledSlots', 'availableUtilization',
]

export function submissionsCsv(roundId, submissions) {
  const lines = [HEADERS.map(cell).join(',')]
  for (const s of submissions) {
    const { scores, metrics } = s.result
    lines.push(
      [
        roundId, s.studentId, s.studentName, formatBeijingTime(s.submittedAt),
        metrics.abcCorrect, metrics.abcTotal, scores.abc, scores.layout ?? (scores.placementValidity + scores.placementEfficiency), scores.reflection, scores.total,
        metrics.baselineDistance, metrics.currentDistance, Math.round(metrics.improvement * 1000) / 10,
        s.answer.reflection, scores.placementValidity, scores.placementEfficiency, scores.documentReview ?? '历史版本/未参加', s.result.review?.correctMarks, s.result.review?.wrongMarks, s.result.review?.missedMarks, s.result.review?.errorCount, metrics.baselineCost, metrics.currentCost, metrics.placementValid, metrics.occupiedSlots, metrics.slotCapacityErrors?.join('；'), Object.entries(s.answer.placement).map(([sku, code]) => `${sku}:${code}`).join('; '), metrics.availableSlots, metrics.disabledSlots, metrics.availableUtilization,
      ]
        .map(cell)
        .join(','),
    )
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
