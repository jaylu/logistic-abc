<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state, checkRound, changeStudent } from './state.js'
import { requests } from './api.js'
import ConfirmDialog from './components/ConfirmDialog.vue'
const route = useRoute(), router = useRouter(), changing = ref(false)
async function switchStudent() { await changeStudent(); changing.value = false; router.push('/student') }
const steps = [['start', '任务介绍', '/student'], ['abc', '① ABC 分类', '/student/abc'], ['layout', '② 储位分配', '/student/layout'], ['review', '③ 单据审核', '/student/review'], ['submit', '④ 提交及结果', '/student/submit']]
function focus() { if (route.meta.step) checkRound() }
onMounted(() => { window.addEventListener('focus', focus); window.addEventListener('online', focus) })
onUnmounted(() => { window.removeEventListener('focus', focus); window.removeEventListener('online', focus) })
</script>
<template>
  <header class="topbar">
    <span v-if="route.meta.step" class="brand"><strong>ABC</strong> 库存分类与仓库储位规划</span>
    <RouterLink v-else class="brand" to="/student"><strong>ABC</strong> 库存分类与仓库储位规划</RouterLink>
    <span class="muted" v-if="route.meta.step && state.round">第 #{{ state.round.id.slice(0,6) }} 轮</span>
    <div class="header-end" v-if="route.meta.step">
      <span v-if="state.draft">{{ state.draft.studentId }} {{ state.draft.studentName }}</span>
      <button v-if="state.draft" @click="changing = true">换人</button><span role="status">{{ state.draft?.submissionResult ? '✓ 已提交' : state.saved }}</span>
    </div>
    <RouterLink v-else to="/student">学生入口</RouterLink>
  </header>
  <nav class="steps" v-if="route.meta.step" aria-label="实训步骤"><RouterLink v-for="[key,label,path] in steps" :key="key" :to="path" :class="{ current: route.meta.step === key }" :aria-current="route.meta.step === key ? 'step' : undefined">{{ label }}</RouterLink></nav>
  <div v-if="route.meta.step && (state.expired || state.error || state.draft?.submissionResult)" class="banner" role="status"><template v-if="state.expired">⚠ 老师已开始新一轮，本次草稿不能提交。请复制反思后刷新页面，进入新一轮。</template><template v-else-if="state.error">⚠ {{ state.error }} <button @click="checkRound">重试</button></template><template v-else>✓ 你已提交，答案为只读。如需重做，请联系老师。</template></div>
  <ConfirmDialog v-if="changing" message="清除本机当前学生的草稿并换人？服务器已提交成绩不受影响。" @cancel="changing = false" @confirm="switchStudent" />
  <main><RouterView /></main>
  <div v-if="requests.loading" class="loading" role="status">正在加载…</div>
  <div v-if="state.toast" class="toast" role="status">✓ {{ state.toast }}</div>
</template>
