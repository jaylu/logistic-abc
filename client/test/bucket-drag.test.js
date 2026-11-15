import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBucketDrag } from '../src/bucket-drag.js'
function setup() {
  let enabled = true, view
  const answers = {}
  const drag = createBucketDrag({ enabled: () => enabled, hitTest: x => x >= 100 && x < 200 ? 'A' : x >= 200 && x < 300 ? 'B' : x >= 300 && x < 400 ? 'C' : null, onDrop: (sku, cls) => { answers[sku] = cls }, onChange: value => { view = value } })
  return { drag, answers, lock: () => { enabled = false }, view: () => view }
}
test('拖入 ABC 桶写入分类，再拖动只更改原商品分类', () => {
  const { drag, answers, view } = setup()
  for (const [index, cls] of ['A', 'B', 'C'].entries()) {
    drag.start('P01', 1, 10, 10); drag.move(1, 150 + index * 100, 20)
    assert.equal(view().bucket, cls)
    drag.finish(1, 150 + index * 100, 20)
    assert.deepEqual(answers, { P01: cls }); assert.equal(view(), null)
  }
})
test('轻点、落在桶外、取消拖动不会改动答案', () => {
  const { drag, answers } = setup()
  drag.start('P01', 1, 150, 10); drag.finish(1, 152, 10)
  drag.start('P01', 1, 10, 10); drag.finish(1, 500, 10)
  drag.start('P01', 1, 10, 10); drag.move(1, 150, 10); drag.cancel(); drag.finish(1, 150, 10)
  assert.deepEqual(answers, {})
})
test('忽略其他指针，拖动中变为只读则禁止分类', () => {
  const { drag, answers, lock, view } = setup()
  drag.start('P01', 1, 10, 10)
  assert.equal(drag.start('P02', 2, 10, 10), false)
  drag.move(2, 150, 10); drag.finish(2, 150, 10)
  assert.equal(view().active, false)
  drag.move(1, 150, 10); lock(); drag.finish(1, 150, 10)
  assert.deepEqual(answers, {}); assert.equal(view(), null)
  assert.equal(drag.start('P02', 2, 10, 10), false)
})
