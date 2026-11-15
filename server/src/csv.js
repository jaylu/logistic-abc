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
  '初始拣货距离(米)', '当前拣货距离(米)', '改善率(%)', '反思内容',
]

export function submissionsCsv(roundId, submissions) {
  const lines = [HEADERS.map(cell).join(',')]
  for (const s of submissions) {
    const { scores, metrics } = s.result
    lines.push(
      [
        roundId, s.studentId, s.studentName, formatBeijingTime(s.submittedAt),
        metrics.abcCorrect, metrics.abcTotal, scores.abc, scores.layout, scores.reflection, scores.total,
        metrics.baselineDistance, metrics.currentDistance, Math.round(metrics.improvement * 1000) / 10,
        s.answer.reflection,
      ]
        .map(cell)
        .join(','),
    )
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
