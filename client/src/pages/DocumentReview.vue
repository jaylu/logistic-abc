<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { state, scenario, locked } from '../state.js'
import { reviewDocument, buildAllocationDocument } from '../../../server/src/review.js'
import AllocationDocumentTable from '../components/AllocationDocumentTable.vue'
import DetailDialog from '../components/DetailDialog.vue'
import WarehouseMap from '../components/WarehouseMap.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const router = useRouter(), confirmation = ref(''), error = ref(''), showMap = ref(false)
const review = computed(() => state.draft.review), config = computed(() => scenario.value.documentReview)
const context = computed(() => ({ sessionId: state.draft.sessionId, studentId: state.draft.studentId, studentName: state.draft.studentName, createdAt: review.value.createdAt }))
const document = computed(() => reviewDocument(review.value.placementSnapshot, scenario.value, context.value, review.value))
const reference = computed(() => buildAllocationDocument(review.value.placementSnapshot, scenario.value, context.value))
function toggle(mark) {
  if (locked.value) return
  const i = review.value.marks.findIndex(m => m.rowId === mark.rowId && m.fieldKey === mark.fieldKey)
  if (i >= 0) review.value.marks.splice(i,1)
  else if (review.value.marks.length < config.value.maxMarks) review.value.marks.push(mark)
  else { error.value = `最多标注${config.value.maxMarks}格，请先取消已有标注。`; return }
  review.value.completed = false; error.value = ''
}
function confirm() {
  if (confirmation.value === 'clear') { review.value.marks = []; review.value.completed = false }
  else { state.draft.review = null; router.push('/student/layout') }
  confirmation.value = ''
}
function finish() { if (!locked.value) review.value.completed = true; router.push('/student/submit') }
</script>
<template><section><p class="eyebrow">第3步 / 共4步</p><h1>储位分配单审核纠错</h1><p class="rule">模拟制单员抄录了你的已确认方案。本单据存在 {{ config.errorCount }} 处录入错误。对照方案和商品资料，点击错误单元格进行标注，无需输入改正值。标注数量不代表答对数量，提交后才显示结果。</p><div class="actions"><strong role="status">已标注 {{ review.marks.length }} / {{ config.maxMarks }}</strong><button :disabled="locked || !review.marks.length" @click="confirmation = 'clear'">清除标注</button></div><p v-if="error" class="error" role="alert">{{ error }}</p><details class="card"><summary>查看我的储位方案与商品规格（只读参考）</summary><AllocationDocumentTable :document="reference" readonly /></details><AllocationDocumentTable :document="document" :marks="review.marks" :fields="config.allowedErrorFields" :readonly="locked" @toggle="toggle" /><footer class="page-footer"><button :disabled="locked" @click="confirmation = 'replan'">撤销审核并重新规划</button><button @click="showMap = true">查看储位图（弹窗）</button><button class="primary" @click="finish">完成审核，进入提交 →</button></footer><DetailDialog v-if="showMap" class="review-map-dialog" close-on-backdrop title-id="review-map-title" close-label="返回审核 ✕" @close="showMap = false"><h2 id="review-map-title">我的已确认储位方案</h2><p class="muted">只读核对 · 点击弹窗外空白处、按 Esc 或“返回审核”关闭，单据位置与标注保持不变。</p><WarehouseMap :scenario="scenario" :placement="review.placementSnapshot" :answers="state.draft.abcAnswers" readonly /></DetailDialog><ConfirmDialog v-if="confirmation" :message="confirmation === 'clear' ? '清除全部审核标注？储位方案及ABC答案保持不变。' : '撤销审核后，当前审核单及全部标注将失效。重新确认储位方案将生成新题，继续？'" @cancel="confirmation = ''" @confirm="confirm" /></section></template>
