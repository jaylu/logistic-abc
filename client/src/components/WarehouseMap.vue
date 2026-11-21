<script setup>
import { computed, ref } from 'vue'
import { allLocations, availableLocations, unavailableReason, decodeLocation, locationLabel, getPalletCapacity } from '../../../server/src/warehouse.js'
import LegacyWarehouseMap from './LegacyWarehouseMap.vue'
const props = defineProps({ scenario: Object, placement: Object, answers: Object, selected: String, readonly: Boolean })
const emit = defineEmits(['place', 'drop', 'select'])
const bay = ref(1), row = ref(1), inspected = ref('')
const locations = computed(() => props.scenario.schemaVersion === 3 ? allLocations(props.scenario) : [])
const visible = (r, level) => locations.value.filter(c => { const v = decodeLocation(c); return v.level === level && v.row === r })
const availableCount = computed(() => props.scenario.schemaVersion === 3 ? availableLocations(props.scenario).length : 0)
const blocked = code => unavailableReason(code, props.scenario)
const elevation = computed(() => locations.value.filter(c => { const v = decodeLocation(c); return v.row === row.value && v.bay === bay.value }).sort((a,b) => decodeLocation(b).level - decodeLocation(a).level || a.localeCompare(b)))
const skuAt = c => Object.keys(props.placement).find(k => props.placement[k] === c)
const productAt = c => props.scenario.products.find(p => p.sku === skuAt(c))
const info = computed(() => { const p = productAt(inspected.value); return p ? { p, ...getPalletCapacity(p, decodeLocation(inspected.value).level, props.scenario) } : null })
function inspect(code) { const v = decodeLocation(code); row.value = v.row; bay.value = v.bay; inspected.value = code; if (!props.readonly) { if (!props.selected && skuAt(code) && !blocked(code)) emit('select', skuAt(code)); else emit('place', code) } }
function startDrag(event, code) {
  const sku = skuAt(code)
  if (props.readonly || !sku || blocked(code)) { event.preventDefault(); return }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', sku)
  emit('select', sku)
}
function dropped(event, code) { if (!props.readonly) { inspected.value = code; emit('drop', code, event.dataTransfer.getData('text/plain')) } }
</script>
<template>
<LegacyWarehouseMap v-if="scenario.schemaVersion !== 3" v-bind="$props" @place="emit('place', $event)" />
<div v-else class="rack-map">
  <div class="actions"><strong>三层展开图 · 全仓48位 · 可用{{ availableCount }}位 · 不可用{{ 48 - availableCount }}位</strong></div>
  <p class="muted">靠近中央走道为第1层，向外依次为第2、3层。这是货架层位展开示意，实际货架为上下三层。01列靠近入口，04列最远。</p>
  <div class="rack-overview-scroll"><div class="rack-overview">
    <div class="rack-column-labels"><span>排 / 层</span><strong v-for="b in 4" :key="b">{{ String(b).padStart(2,'0') }}列</strong></div>
    <template v-for="r in 2" :key="r">
      <div v-for="level in (r === 1 ? [3,2,1] : [1,2,3])" :key="`${r}-${level}`" class="rack-level-row" :data-rack-level="`${r}-${level}`">
        <div class="rack-level-label"><strong>{{ r }}排</strong><span>第{{ level }}层</span></div>
        <div class="rack-grid"><button v-for="code in visible(r, level)" :key="code" class="rack-cell" :class="['badge-' + answers?.[skuAt(code)], { selected: selected && selected === skuAt(code), 'rack-unavailable': !!blocked(code) }]" :aria-disabled="!!blocked(code)" :title="blocked(code) ? `不可用：${blocked(code)}` : locationLabel(code)" :aria-label="`${locationLabel(code)}，${blocked(code) ? '不可用：' + blocked(code) : productAt(code)?.name || '空位'}`" :draggable="!readonly && !!skuAt(code) && !blocked(code)" @dragstart="startDrag($event, code)" @click="inspect(code)" @dragover.prevent @drop.prevent="dropped($event, code)"><small>{{ code }}</small><strong>{{ blocked(code) ? '⊘ 不可用' : skuAt(code) || '＋ 空位' }}<span v-if="answers?.[skuAt(code)]"> · {{ answers[skuAt(code)] }}类</span></strong><span>{{ blocked(code) || productAt(code)?.name }}</span></button></div>
      </div>
      <div v-if="r === 1" class="central-aisle"><strong>入口 E01 →</strong><span v-for="b in 4" :key="b">{{ ((b - .5) * scenario.warehouse.layout.bayPitchMm / 1000).toFixed(2) }}m</span></div>
    </template>
  </div></div>
  <p>中央通道 {{ scenario.warehouse.layout.mainAisleWidthMm }}mm（教学假设）；颜色表示ABC类别，拖到空位直接移动，拖到占用位交换商品；交换前校验双方容量。灰色斜纹货位不可用。</p>
  <details class="rack-details" :open="!!inspected"><summary>{{ row }}排 {{ bay }}列 · 三层立面</summary><div class="elevation"><button v-for="code in elevation" :key="code" :draggable="!readonly && !!skuAt(code) && !blocked(code)" @dragstart="startDrag($event, code)" @click="inspect(code)" @dragover.prevent @drop.prevent="dropped($event, code)"><strong>{{ decodeLocation(code).level }}层 / {{ code }}</strong><span>{{ blocked(code) ? '⊘ 不可用：' + blocked(code) : productAt(code)?.name || '空位' }}</span><small>净高 {{ scenario.warehouse.slot.levelClearHeightsMm[decodeLocation(code).level-1] }}mm · 货物允许 {{ scenario.warehouse.slot.levelClearHeightsMm[decodeLocation(code).level-1] - scenario.warehouse.pallet.heightMm - scenario.warehouse.slot.handlingClearanceMm }}mm</small><small v-if="productAt(code)">实际 {{ getPalletCapacity(productAt(code), decodeLocation(code).level, scenario).actualLayers }}层箱 · {{ getPalletCapacity(productAt(code), decodeLocation(code).level, scenario).cargoHeight }}mm</small></button></div>
  <p>每位净宽 {{ scenario.warehouse.slot.clearWidthMm }} × 净深 {{ scenario.warehouse.slot.clearDepthMm }}mm；托盘高 {{ scenario.warehouse.pallet.heightMm }}mm；顶部净空 {{ scenario.warehouse.slot.handlingClearanceMm }}mm。</p>
  <p v-if="info" class="rule">{{ info.p.sku }} {{ info.p.name }} · 外箱 {{ info.p.carton.lengthMm }}×{{ info.p.carton.widthMm }}×{{ info.p.carton.heightMm }}mm · {{ info.p.stockCartons }}箱 × {{ info.p.carton.unitsPerCarton }}件/箱；每层{{ info.cartonsPerLayer }}箱，实际{{ info.actualLayers }}层；本位容量{{ info.capacityCartons }}箱。载货{{ info.cargoWeight }}kg，含托盘{{ info.totalWeight }}kg。{{ info.valid ? '✓ 托盘载荷及容量校验通过' : '✕ 超限' }}</p>
  <p class="muted small">教学示意，不可用于货架施工和承载设计。货架额定承重未建模。</p></details>
</div>
</template>
