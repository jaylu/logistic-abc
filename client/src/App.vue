<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state, checkRound, changeStudent } from './state.js'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { requests } from './api.js'
const route = useRoute(), router = useRouter(), changing = ref(false)
const steps = [['start', '① 开始', '/student'], ['abc', '② ABC 分类', '/student/abc'], ['layout', '③ 储位摆放', '/student/layout'], ['submit', '④ 分析与提交', '/student/submit']]
function focus() { if (route.meta.step) checkRound() }
onMounted(() => { window.addEventListener('focus', focus); window.addEventListener('online', focus) })
onUnmounted(() => { window.removeEventListener('focus', focus); window.removeEventListener('online', focus) })
async function switchStudent() { await changeStudent(); changing.value = false; router.push('/student') }
</script>
<template>
  <header class="topbar"><RouterLink class="brand" to="/student">物流 <strong>ABC</strong> 实训</RouterLink><span class="muted" v-if="route.meta.step && state.round">第 #{{ state.round.id.slice(0,6) }} 轮</span><div class="header-end" v-if="route.meta.step"><template v-if="state.draft"><span>{{ state.draft.studentId }} {{ state.draft.studentName }}</span><button @click="changing = true">换人</button></template><span role="status">{{ state.draft?.submissionResult ? '✓ 已提交' : state.saved }}</span><RouterLink to="/teacher">教师入口</RouterLink></div><RouterLink v-else to="/student">学生入口</RouterLink></header>
  <nav class="steps" v-if="route.meta.step" aria-label="实训步骤"><RouterLink v-for="[key,label,path] in steps" :key="key" :to="path" :class="{ current: route.meta.step === key }" :aria-current="route.meta.step === key ? 'step' : undefined">{{ label }}</RouterLink></nav>
  <div v-if="route.meta.step && (state.expired || state.error || state.draft?.submissionResult)" class="banner" role="status"><template v-if="state.expired">⚠ 老师已开始新一轮，本次草稿不能提交。请复制反思后点击“换人”重新开始。</template><template v-else-if="state.error">⚠ {{ state.error }} <button @click="checkRound">重试</button></template><template v-else>✓ 你已提交，答案为只读。如需重做，请老师删除提交后点击“换人”。</template></div>
  <main><RouterView /></main>
  <div v-if="requests.loading" class="loading" role="status">正在加载…</div>
  <div v-if="state.toast" class="toast" role="status">✓ {{ state.toast }}</div>
  <ConfirmDialog v-if="changing" message="换人将清空这台电脑上的当前草稿，确认换人？" @cancel="changing = false" @confirm="switchStudent" />
</template>
