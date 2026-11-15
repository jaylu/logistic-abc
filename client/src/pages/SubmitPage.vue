<script setup>
import { computed, ref } from 'vue'
import { state, scenario, metrics, classified, locked, checkRound, persist, notify } from '../state.js'
import { post } from '../api.js'
import { countChars, round1 } from '../calc.js'
import { number, percent } from '../format.js'
import MetricsCards from '../components/MetricsCards.vue'
import ScoreCard from '../components/ScoreCard.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const confirming = ref(false), submitting = ref(false), error = ref('')
const chars = computed(() => countChars(state.draft.reflection))
const example = computed(() => {
  const a = scenario.value.products.filter(p => classified.value.classes[p.sku] === 'A').sort((x,y) => x.pickFrequency - y.pickFrequency)[0]
  const other = scenario.value.products.filter(p => classified.value.classes[p.sku] !== 'A').sort((x,y) => y.pickFrequency - x.pickFrequency)[0]
  return a && other ? `例如：${a.name}是 A 类，每月拣 ${a.pickFrequency} 次；${other.name}是 ${classified.value.classes[other.sku]} 类，每月拣 ${other.pickFrequency} 次。` : ''
})
const interpretation = computed(() => {
  const rate = round1(metrics.value.improvement * 100)
  return rate > 0 ? `比初始布局缩短了 ${rate.toFixed(1)}%` : rate < 0 ? `比初始布局变长了 ${Math.abs(rate).toFixed(1)}%` : '与初始布局相同'
})
function reflectionInput(event) { state.draft.reflection = Array.from(event.target.value).slice(0, 1000).join(''); event.target.value = state.draft.reflection }
async function submit() {
  if (submitting.value || locked.value) return
  submitting.value = true; error.value = ''
  try {
    if (!await checkRound()) return
    const d = state.draft
    d.submissionResult = await post('/submissions', { roundId: d.sessionId, studentId: d.studentId, studentName: d.studentName, abcAnswers: d.abcAnswers, placement: d.placement, reflection: d.reflection })
    persist()
  } catch (e) {
    if (e.code === 'SESSION_EXPIRED') state.expired = true
    error.value = e.code === 'NETWORK' ? '提交未成功，你的答案仍保存在本机。请检查网络后重试。' : e.code === 'ALREADY_SUBMITTED' ? '你在本轮已经提交过。如需重做，请老师在后台删除你的提交后点击“换人”重新开始。' : e.message
  } finally { submitting.value = false; confirming.value = false }
}
async function copy() { try { await navigator.clipboard.writeText(state.draft.reflection); notify('已复制你的反思。') } catch { error.value = '无法自动复制，请选中反思文字后手动复制。' } }
</script>
<template><section><ScoreCard v-if="state.draft.submissionResult" :result="state.draft.submissionResult" /><template v-else><p class="eyebrow">STEP 04 / 让数据解释你的决策</p><h1>分析与提交</h1></template><MetricsCards :metrics="metrics" /><div class="submit-grid"><section class="card"><h2>{{ interpretation }}</h2><div class="comparison" v-for="[label,value] in [['初始布局',metrics.baselineDistance],['当前布局',metrics.currentDistance]]" :key="label"><span>{{ label }} · {{ number(value) }} 米</span><div class="bar-track"><div :style="{ width: `${value / Math.max(metrics.baselineDistance, metrics.currentDistance,1) * 100}%` }"></div></div></div><p class="rule">销售额高的商品不一定拣货频繁。{{ example }}</p></section><section class="card"><label for="reflection"><strong>你为什么这样摆放商品？如果订单结构变化，你会怎样调整？</strong></label><textarea id="reflection" :value="state.draft.reflection" :readonly="locked || submitting" @input="reflectionInput" rows="6" placeholder="结合拣货频次、距离和订单变化，说说你的想法…"></textarea><div class="actions"><span class="muted">30 字以上可得本项满分</span><span>{{ chars }} / 1000 字</span></div><button v-if="state.expired" @click="copy">复制我的反思</button></section></div><p class="muted small">{{ percent(scenario.fullScoreImprovement) }} 满分线只是本实训的评分设置，不是行业标准；反思分只看字数，老师会另外阅读。</p><p v-if="error" class="banner error" role="alert">✕ {{ error }}</p><footer class="page-footer"><RouterLink class="button" to="/student/layout">← 上一步</RouterLink><span class="small">{{ state.draft.studentId }} {{ state.draft.studentName }} · ABC 已选 {{ Object.keys(state.draft.abcAnswers).length }} / {{ scenario.products.length }} · 改善 {{ percent(metrics.improvement, true) }} · 反思 {{ chars }} 字</span><button v-if="!state.draft.submissionResult" class="primary" :disabled="locked || submitting || !!state.error" @click="confirming = true">{{ submitting ? '提交中…' : error ? '重试提交' : '提交实训' }}</button></footer><ConfirmDialog v-if="confirming" message="提交后不能修改，确认提交？" :busy="submitting" @cancel="confirming = false" @confirm="submit" /></section></template>
