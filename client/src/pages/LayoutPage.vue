<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { state, scenario, metrics, locked, layoutLocked, notify } from '../state.js'
import { validatePlacement } from '../../../server/src/warehouse.js'
import { createReview } from '../../../server/src/review.js'
import WarehouseMap from '../components/WarehouseMap.vue'
import MetricsCards from '../components/MetricsCards.vue'
const selected = ref(''), error = ref(''), router = useRouter()
function place(slotId, dragged) {
  if (layoutLocked.value) return
  const sku = dragged || selected.value
  if (!sku || !scenario.value.products.some(p => p.sku === sku)) return
  if (state.draft.placement[sku] === slotId) return
  const other = Object.keys(state.draft.placement).find(k => state.draft.placement[k] === slotId)
  if (other) { error.value = `${slotId} 已放置 ${other}，请选择空位；可先将原商品移到空位。`; return }
  const placement = { ...state.draft.placement, [sku]: slotId }, problems = validatePlacement(placement, scenario.value)
  if (problems.length) { error.value = problems.join('；'); return }
  state.draft.placement = placement; error.value = ''; selected.value = ''; notify(`已将 ${sku} 放入 ${slotId}`)
}
function confirmPlan() {
  if (locked.value) return
  const problems = validatePlacement(state.draft.placement, scenario.value)
  if (problems.length) { error.value = problems.join('；'); return }
  if (!state.draft.review) state.draft.review = createReview(state.draft.placement, scenario.value, { sessionId: state.draft.sessionId, studentId: state.draft.studentId }, crypto.randomUUID(), new Date().toISOString())
  router.push('/student/review')
}
</script>
<template><section @keydown.esc="selected = ''"><p class="eyebrow">第2步 / 共4步</p><h1>储位分配</h1><p class="rule">先核对外箱、库存和容量，再选择商品 → 点击空货位，或拖入空位。确认后方案锁定，进入单据审核。</p><p v-if="state.draft.review" class="banner">方案已锁定。如需更改，请在审核页选择“撤销审核并重新规划”。</p><MetricsCards :metrics="metrics" /><div class="layout-grid"><aside class="card product-list"><h2>商品 · 周转量</h2><button v-for="p in scenario.products" :key="p.sku" :disabled="layoutLocked" :draggable="!layoutLocked" @dragstart="$event.dataTransfer.setData('text/plain', p.sku)" :class="{selected: selected === p.sku}" :aria-pressed="selected === p.sku" @click="selected = selected === p.sku ? '' : p.sku"><span>{{ p.sku }} {{ p.name }} <b :class="'badge badge-' + state.draft.abcAnswers[p.sku]">{{ state.draft.abcAnswers[p.sku] }}</b></span><strong>{{ p.turnover }}</strong><small>{{ p.stockCartons }}箱 · {{ p.carton.unitsPerCarton }}件/箱 · {{ p.carton.grossWeightKg }}kg/箱<br>{{ p.carton.lengthMm }}×{{ p.carton.widthMm }}×{{ p.carton.heightMm }}mm</small></button></aside><div class="card map-panel"><p role="status">{{ selected ? `已选 ${selected}，请选择空货位。` : '选择商品，开始分配储位。' }}</p><p v-if="error" class="banner error" role="alert">{{ error }}</p><WarehouseMap :scenario="scenario" :placement="state.draft.placement" :answers="state.draft.abcAnswers" :selected="selected" :readonly="layoutLocked" @place="place" @drop="place" /><p class="rule">模拟作业成本 = Σ 周转量 ×（2 × 列中心距离 + 层高处理惩罚）。层高惩罚：{{ scenario.warehouse.levelPenalties || [0,3,6] }} 等效米。周转量是需求权重，不是逐件往返次数；本指标不是实际行走距离或叉车工时。</p></div></div><footer class="page-footer"><RouterLink class="button" to="/student/abc">← ABC分类</RouterLink><div class="actions"><button :disabled="layoutLocked" @click="state.draft.placement = { ...scenario.baselinePlacement }; error = ''; selected = ''">恢复初始布局</button><button class="primary" :disabled="locked" @click="confirmPlan">{{ state.draft.review ? '继续审核 →' : '确认储位方案并生成分配单 →' }}</button></div></footer></section></template>
