import { analyzeReflection, countChars } from './calc.js'
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
  '储位合法性得分', '储位效率得分', '单据审核得分', '正确标注数', '误标数', '漏标数', '实际错误数', '初始模拟拣货成本', '当前模拟拣货成本', '最终储位是否合法', '占用货位数', '最终容量违规说明', '储位编码清单', '可用货位数', '不可用货位数', '可用货位占用率', '分类错误数', '分类正确率(%)', '最终容量违规数', '反思字数', '反思原始分', '篇幅分', '摆放依据分', '变化调整分', '约束分', '因果表达分', '反思待补充项',
]

export function submissionsCsv(roundId, submissions) {
  const lines = [HEADERS.map(cell).join(',')]
  for (const s of submissions) {
    const { scores, metrics } = s.result
    const reflection = metrics.reflectionAnalysis ?? analyzeReflection(s.answer.reflection)
    lines.push(
      [
        roundId, s.studentId, s.studentName, formatBeijingTime(s.submittedAt),
        metrics.abcCorrect, metrics.abcTotal, scores.abc, scores.layout ?? (scores.placementValidity + scores.placementEfficiency), scores.reflection, scores.total,
        metrics.baselineDistance, metrics.currentDistance, Math.round(metrics.improvement * 1000) / 10,
        s.answer.reflection, scores.placementValidity, scores.placementEfficiency, scores.documentReview ?? '历史版本/未参加', s.result.review?.correctMarks, s.result.review?.wrongMarks, s.result.review?.missedMarks, s.result.review?.errorCount, metrics.baselineCost, metrics.currentCost, metrics.placementValid, metrics.occupiedSlots, metrics.slotCapacityErrors?.join('；'), Object.entries(s.answer.placement).map(([sku, code]) => `${sku}:${code}`).join('; '), metrics.availableSlots, metrics.disabledSlots, metrics.availableUtilization, metrics.abcTotal - metrics.abcCorrect, metrics.abcTotal ? Math.round(metrics.abcCorrect / metrics.abcTotal * 1000) / 10 : '', metrics.slotCapacityErrors?.length, countChars(s.answer.reflection), reflection.score, reflection.breakdown.length, reflection.breakdown.placementReason, reflection.breakdown.adjustment, reflection.breakdown.constraints, reflection.breakdown.causal, reflection.missing.join('；'),
      ]
        .map(cell)
        .join(','),
    )
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

export function statisticsCsv(stats) {
  const rows = [['轮次', '统计范围', '项目', '指标/标准', '分子/数值', '分母', '比例(%)', '单位/说明']]
  const add = (group, label, value, denominator = null, rate = null, note = '') => rows.push([stats.roundId, '本轮已提交学生的最终结果', group, label, value, denominator, rate === null ? '' : Math.round(rate * 10000) / 100, note])
  add('概览', '已提交人数', stats.count)
  add('概览', '平均总分', stats.averageScore)
  for (const t of stats.tasks) add(t.label, t.criterion, t.achieved, t.participants, t.rate, t.participants ? '人数' : '无参与数据')
  add('ABC分类', '平均正确率', null, null, stats.averageAccuracy)
  add('容量', '最终容量违规数', stats.capacityViolations, stats.capacityParticipants, null, '不代表操作过程违规次数；无数据留空')
  add('模拟拣货成本', '平均初始成本', stats.averageBaselineCost, null, null, stats.costUnit)
  add('模拟拣货成本', '平均优化后成本', stats.averageCurrentCost, null, null, stats.costUnit)
  add('布局效率', '平均改善率', null, null, stats.averageImprovement)
  add('布局效率', '本轮满分线', null, null, stats.threshold)
  for (const p of stats.products) add('商品分类错误', `${p.sku} ${p.name}（正确类别${p.correctClass}）`, p.errors, p.participants, p.errorRate)
  for (const d of stats.distribution) add('改善率分布', d.label, d.count, stats.count, stats.count ? d.count / stats.count : null)
  for (const f of stats.fields) {
    add('审核字段', `${f.label}正确标注`, f.correct, f.errors, f.recognitionRate, f.errors ? '实际错误数为分母' : '未出题')
    add('审核字段', `${f.label}漏标`, f.missed)
    add('审核字段', `${f.label}误标`, f.wrong)
  }
  for (const [key, label] of [['correctMarks', '正确标注'], ['wrongMarks', '误标'], ['missedMarks', '漏标']]) {
    add('审核汇总', `${label}总次数`, stats.reviewTotals[key], stats.reviewParticipants)
    add('审核汇总', `${label}人均次数`, stats.reviewParticipants ? stats.reviewTotals[key] / stats.reviewParticipants : null)
  }
  add('反思', '已填写人数', stats.reflectionFilled, stats.count, stats.count ? stats.reflectionFilled / stats.count : null)
  add('反思', '量表原始分达到6/10', stats.tasks[4].achieved, stats.tasks[4].participants, stats.tasks[4].rate, '篇幅2、摆放依据3、变化调整3、约束1、因果表达1')
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
