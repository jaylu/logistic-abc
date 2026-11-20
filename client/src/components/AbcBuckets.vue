<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { createBucketDrag } from '../bucket-drag.js'
const props = defineProps({ rows: Array, answers: Object, checked: Object, disabled: Boolean })
const emit = defineEmits(['classify'])
const root = ref(null), selected = ref(''), drag = ref(null), announcement = ref('')
const selectedProduct = computed(() => props.rows.find(p => p.sku === selected.value))
const draggedProduct = computed(() => props.rows.find(p => p.sku === drag.value?.sku))
let captureElement = null, captureId = null, suppressClickUntil = 0
function assign(sku, cls) {
  if (props.disabled || !props.rows.some(p => p.sku === sku)) return
  emit('classify', sku, cls)
  selected.value = ''
  announcement.value = `已将 ${sku} 归入 ${cls} 类。`
}
const controller = createBucketDrag({
  enabled: () => !props.disabled,
  hitTest: (x, y) => {
    const target = document.elementFromPoint(x, y)?.closest('[data-abc-bucket]')
    return target && root.value?.contains(target) ? target.dataset.abcBucket : null
  },
  onDrop: assign,
  onChange: value => { drag.value = value },
})
function release() {
  if (captureElement?.hasPointerCapture(captureId)) captureElement.releasePointerCapture(captureId)
  captureElement = null; captureId = null
}
function startDrag(event, sku) {
  if (event.button !== 0 || !event.isPrimary || !controller.start(sku, event.pointerId, event.clientX, event.clientY)) return
  captureElement = event.currentTarget; captureId = event.pointerId
  captureElement.setPointerCapture(captureId)
}
function move(event) { controller.move(event.pointerId, event.clientX, event.clientY) }
function finish(event) {
  if (drag.value?.pointerId !== event.pointerId) return
  const wasDragging = drag.value.active || Math.hypot(event.clientX - drag.value.startX, event.clientY - drag.value.startY) >= 6
  if (wasDragging) suppressClickUntil = Date.now() + 250
  release()
  const result = controller.finish(event.pointerId, event.clientX, event.clientY)
  if (result?.active && !result.bucket) announcement.value = '未放入分类桶，分类保持不变。'
}
function cancel(event) {
  if (event?.pointerId !== undefined && event.pointerId !== drag.value?.pointerId) return
  controller.cancel(); release(); selected.value = ''
}
function select(sku) { if (!props.disabled) selected.value = selected.value === sku ? '' : sku }
function clickCapture(event) { if (event.detail > 0 && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation() } }
function keyboard(event) {
  if (event.key === 'Escape') { cancel(); return }
  if (selected.value && ['a', 'b', 'c'].includes(event.key.toLowerCase()) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); assign(selected.value, event.key.toUpperCase())
  }
}
watch(() => props.disabled, value => { if (value) cancel() })
onUnmounted(cancel)
</script>
<template>
  <div ref="root" class="abc-workspace" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @click.capture="clickCapture" @keydown="keyboard">
    <div class="abc-source"><slot :start-drag="startDrag" :select="select" :selected="selected" /></div>
    <aside class="abc-buckets" aria-label="ABC 分类桶">
      <p class="small muted bucket-help">拖动商品到分类桶。也可先点选商品，再点击分类桶；键盘用 Tab、Enter 操作，Esc 取消。</p>
      <p class="bucket-status small" role="status">{{ selectedProduct ? `已选 ${selectedProduct.sku} ${selectedProduct.name}，请选择分类桶。` : announcement || '商品可在分类桶之间重新拖动。' }}</p>
      <section v-for="cls in ['A', 'B', 'C']" :key="cls" :data-abc-bucket="cls" :class="['abc-bucket', 'bucket-' + cls, { 'bucket-over': drag?.active && drag.bucket === cls }]" :aria-label="cls + ' 类分类桶'">
        <button class="bucket-target" :disabled="disabled" :aria-label="`放入 ${cls} 类分类桶`" @click="assign(selected, cls)">
          <strong>{{ cls }} 类</strong><span>{{ rows.filter(p => answers[p.sku] === cls).length }} 个商品</span><span class="bucket-hint">{{ drag?.bucket === cls ? '松开放入' : selected ? '点击放入' : '拖到这里' }}</span>
        </button>
        <div class="bucket-products">
          <button v-for="p in rows.filter(p => answers[p.sku] === cls)" :key="p.sku" class="bucket-product" :class="{ selected: selected === p.sku, incorrect: checked && checked[p.sku] === false }" :disabled="disabled" :aria-pressed="selected === p.sku" :aria-label="`${p.sku} ${p.name}，当前 ${cls} 类，拖动可重新分类`" @pointerdown="startDrag($event, p.sku)" @dragstart.prevent @click="select(p.sku)">
            <span v-if="checked && checked[p.sku] === false" class="error" aria-label="分类错误">✕</span><span>{{ p.sku }} {{ p.name }}</span>
          </button>
        </div>
      </section>
    </aside>
    <Teleport to="body"><div v-if="drag?.active" class="abc-drag-ghost" :style="{ left: `${drag.x + 14}px`, top: `${drag.y + 14}px` }" aria-hidden="true">{{ drag.sku }} {{ draggedProduct?.name }}</div></Teleport>
  </div>
</template>
