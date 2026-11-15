<script setup>
import { computed } from 'vue'
import { parseMap } from '../calc.js'
const props = defineProps({ scenario: Object, placement: Object, answers: Object, selected: String, readonly: Boolean })
const emit = defineEmits(['place'])
const parsed = computed(() => parseMap(props.scenario.map, props.scenario.cellSizeMeters))
const cells = computed(() => props.scenario.map.flatMap((row, r) => [...row].map((type, c) => {
  const slot = parsed.value.slots.find(s => s.row === r && s.col === c)
  const sku = slot && Object.keys(props.placement).find(k => props.placement[k] === slot.slotId)
  return { key: `${r}-${c}`, type, slot, sku, product: props.scenario.products.find(p => p.sku === sku) }
})))
</script>
<template><div class="warehouse" :style="{ gridTemplateColumns: `repeat(${parsed.width}, minmax(0, 1fr))` }" aria-label="仓库地图"><template v-for="cell in cells" :key="cell.key"><button v-if="cell.slot" class="slot" :class="{ selected: selected && cell.sku === selected }" :disabled="readonly" @click="emit('place', cell.slot.slotId)" :aria-label="`${cell.slot.slotId}，距出库口 ${cell.slot.distance} 米，${cell.product?.name || '空储位'}`"><span class="slot-id">{{ cell.slot.slotId }}</span><small>{{ cell.slot.distance }} 米</small><strong>{{ cell.sku || '空储位' }}</strong><span>{{ cell.product?.name }}</span><span v-if="answers?.[cell.sku]" :class="'badge badge-' + answers[cell.sku]">{{ answers[cell.sku] }} 类</span></button><div v-else :class="['map-cell', { aisle: cell.type === '.', exit: cell.type === 'E' }]">{{ cell.type === 'E' ? '出库口 →' : cell.type === '.' ? '通道' : '' }}</div></template></div></template>
