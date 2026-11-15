<script setup>
import { ref } from 'vue'
import { state, scenario, metrics, locked, notify } from '../state.js'
import WarehouseMap from '../components/WarehouseMap.vue'
import MetricsCards from '../components/MetricsCards.vue'
const selected = ref('')
function place(slotId) {
  if (locked.value || !selected.value) return
  const sku = selected.value, previous = state.draft.placement[sku]
  const other = Object.keys(state.draft.placement).find(k => state.draft.placement[k] === slotId)
  if (other === sku) { selected.value = ''; return }
  if (other) state.draft.placement[other] = previous
  state.draft.placement[sku] = slotId
  notify(other ? `已交换 ${sku} 与 ${other}` : `已将 ${sku} 放入 ${slotId}`)
  selected.value = ''
}
</script>
<template><section @keydown.esc="selected = ''"><div class="section-heading"><div><p class="eyebrow">STEP 03 / 用周转量安排储位</p><h1>储位摆放</h1></div><span class="muted">先点商品，再点储位；已有商品会交换。</span></div><MetricsCards :metrics="metrics" /><div class="layout-grid"><aside class="card product-list"><h2>商品 · 周转量</h2><button v-for="p in scenario.products" :key="p.sku" :disabled="locked" :class="{ selected: selected === p.sku }" :aria-pressed="selected === p.sku" @click="selected = selected === p.sku ? '' : p.sku"><span>{{ p.sku }} {{ p.name }} <span :class="'badge badge-' + state.draft.abcAnswers[p.sku]">{{ state.draft.abcAnswers[p.sku] }}</span></span><strong>{{ p.turnover }}</strong></button></aside><div class="card map-panel"><p role="status">{{ selected ? `已选 ${selected}，请选择目标储位。按 Esc 取消。` : '选择左侧商品，开始调整布局。' }}</p><WarehouseMap :scenario="scenario" :placement="state.draft.placement" :answers="state.draft.abcAnswers" :selected="selected" :readonly="locked" @place="place" /><p class="rule">周转量越大的商品，越应该放在离出库口近的储位。</p><p class="muted small">拣货距离 = Σ（2 × 储位距离 × 周转量），表示按周转量逐件往返拣货的总距离。</p></div></div><footer class="page-footer"><RouterLink class="button" to="/student/abc">← 上一步</RouterLink><div class="actions"><button :disabled="locked" @click="state.draft.placement = { ...scenario.baselinePlacement }; selected = ''">恢复初始布局</button><RouterLink class="button primary" to="/student/submit">分析与提交 →</RouterLink></div></footer></section></template>
