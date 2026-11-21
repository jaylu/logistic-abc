<script setup>
import { fillDemoStep } from '../demo.js'
import { computed, ref } from 'vue'
import { state, scenario, metrics, locked, checkRound, persist, notify, reviewReady } from '../state.js'
import { post } from '../api.js'
import { analyzeReflection, countChars, round1 } from '../calc.js'
import { number, percent } from '../format.js'
import MetricsCards from '../components/MetricsCards.vue'
import ScoreCard from '../components/ScoreCard.vue'
import AllocationDocumentTable from '../components/AllocationDocumentTable.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const confirming = ref(false), submitting = ref(false), error = ref('')
const chars = computed(() => countChars(state.draft.reflection))
const reflectionPreview = computed(() => analyzeReflection(state.draft.reflection))
const interpretation = computed(() => {
  const rate = round1(metrics.value.improvement * 100)
  return rate > 0 ? `比初始布局降低了 ${rate.toFixed(1)}%` : rate < 0 ? `比初始布局增加了 ${Math.abs(rate).toFixed(1)}%` : '与初始布局相同'
})
function reflectionInput(event) { state.draft.reflection = Array.from(event.target.value).slice(0, 1000).join(''); event.target.value = state.draft.reflection }
async function submit() {
  if (submitting.value || locked.value || !reviewReady.value) return
  submitting.value = true; error.value = ''
  try {
    if (!await checkRound()) return
    const d = state.draft
    d.submissionResult = await post('/submissions', { roundId: d.sessionId, schemaVersion: d.schemaVersion, review: d.review, studentId: d.studentId, studentName: d.studentName, abcAnswers: d.abcAnswers, placement: d.placement, reflection: d.reflection })
    persist()
  } catch (e) {
    if (e.code === 'SESSION_EXPIRED') state.expired = true
    error.value = e.code === 'NETWORK' ? '提交未成功，你的答案仍保存在本机。请检查网络后重试。' : e.code === 'ALREADY_SUBMITTED' ? '你在本轮已经提交过。如需重做，请联系老师。' : e.message
  } finally { submitting.value = false; confirming.value = false }
}
async function copy() { try { await navigator.clipboard.writeText(state.draft.reflection); notify('已复制你的反思。') } catch { error.value = '无法自动复制，请选中反思文字后手动复制。' } }
</script>
<template><section><ScoreCard v-if="state.draft.submissionResult" :result="state.draft.submissionResult" /><template v-else><p class="eyebrow">STEP 04 / 让数据解释你的决策</p><h1>分析与提交</h1><button v-if="state.round?.demo" :disabled="locked || submitting" @click="fillDemoStep('submit')">演示：一键填写本步骤</button></template><MetricsCards :metrics="metrics" /><div class="submit-grid"><section class="card"><h2>{{ interpretation }}</h2><div class="comparison" v-for="[label,value] in [['初始布局',metrics.baselineDistance],['当前布局',metrics.currentDistance]]" :key="label"><span>{{ label }} · {{ number(value) }} 加权等效米</span><div class="bar-track"><div :style="{ width: `${value / Math.max(metrics.baselineDistance, metrics.currentDistance,1) * 100}%` }"></div></div></div><p class="rule">分类综合考虑周转量和品项数累积占比。布局时优先把周转量大的商品放在离出库口近的储位。</p></section><section class="card"><label for="reflection"><strong>你为什么这样摆放商品？如果订单结构变化，你会怎样调整？</strong></label><textarea id="reflection" :value="state.draft.reflection" :readonly="locked || submitting" @input="reflectionInput" rows="6" placeholder="说明摆放依据、距离或成本，以及订单变化后的重新计算和储位调整…"></textarea><div class="actions"><span class="muted">当前原始分 {{ reflectionPreview.score }}/10 · 6分达标</span><span>{{ chars }} / 1000 字</span></div><ul class="muted small"><li>篇幅2分：20字得1分，40字得2分。</li><li>摆放依据3分：需求/ABC、距离/成本、两者关系各1分。</li><li>变化调整3分：识别变化、重新计算或分类、重新分配储位各1分。</li><li>容量与安全约束1分，完整因果表达1分。关键词仅作证据，需说明关系和行动。</li></ul><button v-if="state.expired" @click="copy">复制我的反思</button></section></div><p class="muted small">{{ percent(scenario.fullScoreImprovement) }} 满分线只是本实训的评分设置，不是行业标准；反思按公开量表自动初评，教师仍可结合内容质量进行教学评价。</p><p v-if="error" class="banner error" role="alert">✕ {{ error }}</p><footer class="page-footer"><RouterLink class="button" to="/student/review">← 单据审核</RouterLink><span class="small">{{ state.draft.studentId }} {{ state.draft.studentName }} · ABC 已选 {{ Object.keys(state.draft.abcAnswers).length }} / {{ scenario.products.length }} · 改善 {{ percent(metrics.improvement, true) }} · 单据审核已完成（标注{{ state.draft.review?.marks.length }}格） · 反思 {{ chars }} 字 / 原始{{ reflectionPreview.score }}分</span><button v-if="!state.draft.submissionResult" class="primary" :disabled="locked || submitting || !!state.error || !reviewReady" @click="confirming = true">{{ submitting ? '提交中…' : error ? '重试提交' : '提交实训' }}</button></footer><AllocationDocumentTable v-if="state.draft.submissionResult?.review" :document="state.draft.submissionResult.review.document" :marks="state.draft.submissionResult.review.marks" :fields="scenario.documentReview.allowedErrorFields" readonly reveal /><ConfirmDialog v-if="confirming" message="提交后不能修改，确认提交？" :busy="submitting" @cancel="confirming = false" @confirm="submit" /></section></template>
