<script setup>
import { computed, ref } from 'vue'
import { state, scenario, classified, complete, locked, notify } from '../state.js'
import { percent } from '../format.js'
import { percentageValue, calculationsComplete, parseCalculationPaste } from '../abc-input.js'
import ParetoChart from '../components/ParetoChart.vue'
import AbcBuckets from '../components/AbcBuckets.vue'
const checked = ref(null), pasteText = ref(''), error = ref(''), copyText = ref('')
state.draft.abcCalculations ??= {}
for (const p of scenario.value.products) state.draft.abcCalculations[p.sku] ??= { turnover: '', itemCount: '' }
const started = computed(() => state.draft.abcGuideDone)
const ready = computed(() => started.value && calculationsComplete(scenario.value.products, state.draft.abcCalculations))
const rows = computed(() => {
  const result = [...scenario.value.products]
  if (state.draft.abcSort) result.sort((a, b) => (state.draft.abcSort === 'desc' ? b.turnover - a.turnover : a.turnover - b.turnover) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
  return result
})
const chartRows = computed(() => rows.value.map(p => ({ ...p, cumAfter: percentageValue(state.draft.abcCalculations[p.sku].turnover) / 100, itemCumAfter: percentageValue(state.draft.abcCalculations[p.sku].itemCount) / 100 })))
function sort() { state.draft.abcSort = state.draft.abcSort === 'desc' ? 'asc' : 'desc' }
function choose(sku, cls) { if (locked.value || !ready.value) return; state.draft.abcAnswers[sku] = cls; checked.value = null }
function check() {
  if (locked.value || !ready.value || state.draft.abcChecksUsed >= scenario.value.abcCheckLimit) return
  state.draft.abcChecksUsed++
  checked.value = Object.fromEntries(rows.value.map(p => [p.sku, state.draft.abcAnswers[p.sku] === classified.value.classes[p.sku]]))
}
async function copy() {
  copyText.value = [['商品名称', '周转量'], ...rows.value.map(p => [p.name, p.turnover])].map(row => row.join('\t')).join('\n')
  try { await navigator.clipboard.writeText(copyText.value); copyText.value = ''; notify('已复制当前顺序的商品表，可粘贴到 Excel。') }
  catch { notify('请选中下方文本手动复制到 Excel。') }
}
function paste() {
  if (locked.value) return
  error.value = ''
  try { const values = parseCalculationPaste(pasteText.value, rows.value); state.draft.abcCalculations = values; checked.value = null; pasteText.value = ''; notify('已填入计算结果，可以开始分类。') }
  catch (e) { error.value = e.message }
}
</script>
<template>
  <section>
    <div class="section-heading"><div><p class="eyebrow">STEP 02 / 按周转量认识商品</p><h1>ABC 分类</h1></div><span class="muted">已分类 {{ Object.keys(state.draft.abcAnswers).length }} / {{ scenario.products.length }}</span></div>
    <div class="rule">
      <p>按周转量从高到低排列，同量按 SKU 升序。两个累积占比均<strong>包含当前商品</strong>；每个商品计 1 个品项。两个因子分别判断后取较低等级（A ＞ B ＞ C），边界归前一类。</p>
      <p v-for="[factor, label] in [['turnover', '周转量累积占比'], ['itemCount', '品项数累积占比']]" :key="factor">{{ label }}：A 为 0～{{ percent(scenario.thresholds[factor].a) }}；B 为大于 {{ percent(scenario.thresholds[factor].a) }} 至 {{ percent(scenario.thresholds[factor].b) }}；C 为大于 {{ percent(scenario.thresholds[factor].b) }} 至 100%。</p>
    </div>
    <div class="actions guide"><span>1. 以周转量进行排序</span><span>2. 计算周转量累积占比</span><span>3. 计算品项数累积占比</span><button v-if="!started" class="primary" :disabled="locked" @click="state.draft.abcGuideDone = true">开始计算</button></div>
    <div class="actions"><button @click="copy">复制商品表到 Excel</button><span class="small muted">只有周转量表头可排序。计算结果随商品保存，排序不会错位。</span></div>
    <textarea v-if="copyText" :value="copyText" readonly aria-label="供手动复制的商品表" @focus="$event.target.select()"></textarea>
    <AbcBuckets :rows="rows" :answers="state.draft.abcAnswers" :checked="checked" :disabled="locked || !ready" @classify="choose" v-slot="{ startDrag, select, selected }">
      <p class="small muted">{{ !ready ? '点击开始计算，自行填完两列百分比后即可分类；支持逐项录入或从 Excel 粘贴。' : '按住商品名称拖入右侧 A / B / C 桶；也可点击商品，再点击分类桶。' }}</p>
      <div class="card table-scroll abc-table"><table>
        <thead><tr><th>商品名称</th><th class="numeric" :aria-sort="state.draft.abcSort === 'desc' ? 'descending' : state.draft.abcSort === 'asc' ? 'ascending' : 'none'"><button class="sort" @click="sort">周转量 {{ state.draft.abcSort === 'desc' ? '↓' : state.draft.abcSort === 'asc' ? '↑' : '↕' }}</button></th><template v-if="started"><th class="numeric">周转量累积占比</th><th class="numeric">品项数累积占比</th></template></tr></thead>
        <tbody><tr v-for="p in rows" :key="p.sku" :class="{ incorrect: checked && !checked[p.sku] }">
          <td><button class="abc-product-handle" :class="{ selected: selected === p.sku }" :disabled="locked || !ready" :aria-pressed="selected === p.sku" :aria-label="`${p.sku} ${p.name}，${state.draft.abcAnswers[p.sku] || '未分类'}，选择或拖动到分类桶`" @pointerdown="startDrag($event, p.sku)" @dragstart.prevent @click="select(p.sku)"><span v-if="checked && !checked[p.sku]" class="error" aria-label="分类错误">✕</span><span aria-hidden="true" class="drag-grip">⠿</span><strong>{{ p.name }}</strong><span v-if="state.draft.abcAnswers[p.sku]" :class="'badge badge-' + state.draft.abcAnswers[p.sku]">{{ state.draft.abcAnswers[p.sku] }}</span></button></td>
          <td class="numeric">{{ p.turnover }}</td>
          <template v-if="started"><td v-for="[key, label] in [['turnover', '周转量累积占比'], ['itemCount', '品项数累积占比']]" :key="key" class="numeric"><input v-model="state.draft.abcCalculations[p.sku][key]" class="abc-percent-input" inputmode="decimal" placeholder="例如 35.5%" :aria-label="p.name + ' ' + label" :aria-invalid="state.draft.abcCalculations[p.sku][key] !== '' && percentageValue(state.draft.abcCalculations[p.sku][key]) === null" :readonly="locked" @input="checked = null"></td></template>
        </tr></tbody>
      </table></div>
    </AbcBuckets>
    <details v-if="started && !locked" class="card"><summary>从 Excel 粘贴计算结果</summary><p>在 Excel 中按周转量降序计算，并让当前表格保持相同顺序。仅复制“周转量累积占比”和“品项数累积占比”两列，共 {{ rows.length }} 行（可带这两列表头）。输入 80 或 80% 都表示 80%。</p><textarea v-model="pasteText" rows="3" aria-label="Excel 两列计算结果" placeholder="将两列结果粘贴到这里"></textarea><button @click="paste">填入表格</button><p v-if="error" class="error" role="alert">{{ error }}</p></details>
    <p role="status" v-if="checked">正确 {{ Object.values(checked).filter(Boolean).length }} / {{ rows.length }}</p>
    <ParetoChart v-if="ready" :rows="chartRows" :answers="state.draft.abcAnswers" :thresholds="scenario.thresholds" />
    <footer class="page-footer"><RouterLink class="button" to="/student">← 上一步</RouterLink><div class="actions"><span>剩余检查次数：{{ Math.max(0, scenario.abcCheckLimit - state.draft.abcChecksUsed) }}</span><button :class="{ primary: ready }" :disabled="locked || !ready || state.draft.abcChecksUsed >= scenario.abcCheckLimit" @click="check">检查分类</button><RouterLink v-if="complete && ready" class="button" to="/student/layout">下一步 →</RouterLink><button v-else disabled>请先完成计算和分类 →</button></div></footer>
  </section>
</template>
