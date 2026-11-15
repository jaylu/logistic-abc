import { test } from 'node:test'
import assert from 'node:assert/strict'
import { percentageValue, calculationsComplete, parseCalculationPaste } from '../src/abc-input.js'
test('百分比输入：零值有效，空值、越界和公式无效', () => {
  for (const [value, expected] of [['80%', 80], ['80', 80], [' 0％ ', 0], ['0.8', 0.8], ['100', 100]]) assert.equal(percentageValue(value), expected)
  for (const value of ['', null, ' ', '-1', '100.01', '=1/2', 'NaN', '1e2', '80%%']) assert.equal(percentageValue(value), null)
})
test('Excel 两列粘贴按当前商品顺序绑定，支持表头和 CRLF', () => {
  const rows = [{ sku: 'B' }, { sku: 'A' }]
  const values = parseCalculationPaste('周转量累积占比\t品项数累积占比\r\n80%\t50%\r\n100\t100\r\n', rows)
  assert.deepEqual(values.B, { turnover: '80%', itemCount: '50%' })
  assert.equal(calculationsComplete(rows, values), true)
  assert.equal(calculationsComplete(rows, { B: values.B }), false)
  assert.throws(() => parseCalculationPaste('80\t50', rows), /2 行/)
  assert.throws(() => parseCalculationPaste('80\t50\tA\n100\t100\tB', rows), /两列/)
  assert.throws(() => parseCalculationPaste('80\t\n100\t100', rows), /第 1 行/)
})
