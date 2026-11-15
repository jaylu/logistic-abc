const CLASSES = ['A', 'B', 'C']

// Pointer-independent drag state so cancelled/outside drops never change an answer.
export function createBucketDrag({ enabled, hitTest, onDrop, onChange }) {
  let drag = null
  const publish = () => onChange(drag ? { ...drag } : null)
  return {
    start(sku, pointerId, x, y) {
      if (!enabled() || drag) return false
      drag = { sku, pointerId, startX: x, startY: y, x, y, active: false, bucket: null }
      publish()
      return true
    },
    move(pointerId, x, y) {
      if (!drag || drag.pointerId !== pointerId) return
      if (!enabled()) { this.cancel(); return }
      drag.x = x; drag.y = y
      drag.active ||= Math.hypot(x - drag.startX, y - drag.startY) >= 6
      const bucket = drag.active ? hitTest(x, y) : null
      drag.bucket = CLASSES.includes(bucket) ? bucket : null
      publish()
    },
    finish(pointerId, x, y) {
      if (!drag || drag.pointerId !== pointerId) return null
      this.move(pointerId, x, y)
      const finished = drag
      this.cancel()
      if (finished?.active && finished.bucket && enabled()) onDrop(finished.sku, finished.bucket)
      return finished
    },
    cancel() { drag = null; publish() },
  }
}
