// 学生输入使用百分数：80 和 80% 都表示 80%，不把 0.8 隐式当成 80%。
export function percentageValue(value) {
  const text = String(value ?? '').trim().replace(/[%％]$/, '').trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null
}

export function calculationsComplete(products, values) {
  return products.every(p => ['turnover', 'itemCount'].every(key => percentageValue(values?.[p.sku]?.[key]) !== null))
}

export function parseCalculationPaste(text, rows) {
  const lines = text.trim().split(/\r?\n/).map(line => line.split('\t'))
  if (lines[0]?.[0]?.trim() === '周转量累积占比') lines.shift()
  if (lines.length !== rows.length) throw new Error(`请粘贴 ${rows.length} 行、两列计算结果，顺序与当前表格一致。`)
  const result = {}
  lines.forEach((cells, index) => {
    if (cells.length !== 2 || cells.some(cell => percentageValue(cell) === null)) {
      throw new Error(`第 ${index + 1} 行须为两列 0～100 的百分数，例如 35.5% 或 35.5。`)
    }
    result[rows[index].sku] = { turnover: cells[0].trim(), itemCount: cells[1].trim() }
  })
  return result
}
