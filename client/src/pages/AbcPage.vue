<script setup>
import { computed, ref } from 'vue'
import { state, scenario, classified, complete, locked } from '../state.js'
import { money, percent } from '../format.js'
import ParetoChart from '../components/ParetoChart.vue'
import AbcBuckets from '../components/AbcBuckets.vue'
const guide = ref(state.draft.abcGuideDone ? 3 : 0), checked = ref(null)
const rows = computed(() => guide.value >= 2 ? classified.value.rows.map(r => ({ ...scenario.value.products.find(p => p.sku === r.sku), ...r })) : scenario.value.products.map(p => ({ ...p, ...classified.value.rows.find(r => r.sku === p.sku) })))
function advance() { guide.value++; if (guide.value === 3) state.draft.abcGuideDone = true }
function choose(sku, cls) { if (locked.value || guide.value < 3) return; state.draft.abcAnswers[sku] = cls; checked.value = null }
function check() { if (locked.value || state.draft.abcChecksUsed >= scenario.value.abcCheckLimit) return; state.draft.abcChecksUsed++; checked.value = Object.fromEntries(rows.value.map(p => [p.sku, state.draft.abcAnswers[p.sku] === p.cls])) }
</script>
<template>
  <section>
    <div class="section-heading"><div><p class="eyebrow">STEP 02 / 按销售额认识商品</p><h1>ABC 分类</h1></div><span class="muted">已分类 {{ Object.keys(state.draft.abcAnswers).length }} / {{ scenario.products.length }}</span></div>
    <p class="rule">按销售额从高到低排列，同额按 SKU 升序。看商品<strong>加入之前</strong>的累计占比：小于 {{ percent(scenario.thresholds.a) }} 为 A；小于 {{ percent(scenario.thresholds.b) }} 为 B；其余为 C。</p>
    <div class="actions guide"><span v-for="(label, i) in ['计算销售额', '按销售额排序', '计算累计占比']" :key="label">{{ i + 1 }} {{ label }} {{ guide > i ? '✓' : '' }}</span><button v-if="guide < 3" class="primary" :disabled="locked" @click="advance">{{ ['计算销售额', '按销售额排序', '计算累计占比'][guide] }}</button></div>
    <AbcBuckets :rows="rows" :answers="state.draft.abcAnswers" :checked="checked" :disabled="locked || guide < 3" @classify="choose" v-slot="{ startDrag, select, selected }">
      <p class="small muted">{{ guide < 3 ? '完成上方三步后，即可拖动商品进行分类。' : '按住商品名称拖入右侧 A / B / C 桶；已分类商品也可重新拖动。' }}</p>
      <div class="card table-scroll abc-table"><table>
        <thead><tr><th>商品</th><th class="numeric">月销量</th><th class="numeric">单价</th><th v-if="guide >= 1" class="numeric">销售额</th><th v-if="guide >= 3" class="numeric">占比</th><th v-if="guide >= 3" class="numeric">加入前累计</th><th v-if="guide >= 3">分类</th></tr></thead>
        <tbody><tr v-for="p in rows" :key="p.sku" :class="{ incorrect: checked && !checked[p.sku] }">
          <td><button class="abc-product-handle" :class="{ selected: selected === p.sku }" :disabled="locked || guide < 3" :aria-pressed="selected === p.sku" :aria-label="`${p.sku} ${p.name}，${state.draft.abcAnswers[p.sku] || '未分类'}，选择或拖动到分类桶`" @pointerdown="startDrag($event, p.sku)" @dragstart.prevent @click="select(p.sku)"><span v-if="checked && !checked[p.sku]" class="error" aria-label="分类错误">✕</span><span aria-hidden="true" class="drag-grip">⠿</span><span><small>{{ p.sku }}</small><strong>{{ p.name }}</strong></span></button></td>
          <td class="numeric">{{ p.monthlySalesQty }}</td><td class="numeric">{{ money(p.unitPrice) }}</td><td v-if="guide >= 1" class="numeric">{{ money(p.salesCents / 100) }}</td><td v-if="guide >= 3" class="numeric">{{ percent(p.share) }}</td><td v-if="guide >= 3" class="numeric">{{ percent(p.cumBefore) }}</td><td v-if="guide >= 3"><span v-if="state.draft.abcAnswers[p.sku]" :class="'badge badge-' + state.draft.abcAnswers[p.sku]">{{ state.draft.abcAnswers[p.sku] }}</span><span v-else class="unclassified-label">未分类</span></td>
        </tr></tbody>
      </table></div>
    </AbcBuckets>
    <p role="status" v-if="checked">正确 {{ Object.values(checked).filter(Boolean).length }} / {{ rows.length }}</p>
    <ParetoChart v-if="guide >= 3" :rows="classified.rows" :answers="state.draft.abcAnswers" :thresholds="scenario.thresholds" />
    <footer class="page-footer"><RouterLink class="button" to="/student">← 上一步</RouterLink><div class="actions"><span>剩余检查次数：{{ Math.max(0, scenario.abcCheckLimit - state.draft.abcChecksUsed) }}</span><button :class="{ primary: guide >= 3 }" :disabled="locked || guide < 3 || state.draft.abcChecksUsed >= scenario.abcCheckLimit" @click="check">检查分类</button><RouterLink v-if="complete" class="button" to="/student/layout">下一步 →</RouterLink><button v-else disabled>请先完成分类 →</button></div></footer>
  </section>
</template>
