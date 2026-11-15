<script setup>
import { computed, onMounted, ref } from 'vue'
import { api, post } from '../api.js'
import { time, percent, number } from '../format.js'
import { notify } from '../state.js'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DetailDialog from '../components/DetailDialog.vue'
import WarehouseMap from '../components/WarehouseMap.vue'
import MetricsCards from '../components/MetricsCards.vue'
const loggedIn = ref(false), password = ref(''), error = ref(''), busy = ref(false), tab = ref('results'), round = ref(null), submissions = ref([]), search = ref(''), sortKey = ref('studentId'), ascending = ref(true), detail = ref(null), confirmation = ref(null), scenario = ref(null), reference = ref(null), validated = ref(false)
const columns = [['studentId','学号'],['studentName','姓名'],['submittedAt','提交时间'],['abc','分类'],['layout','布局'],['reflection','反思'],['total','总分'],['improvement','改善率']]
const filtered = computed(() => submissions.value.filter(s => s.studentId.includes(search.value.trim())).sort((a,b) => {
  const x = a.scores?.[sortKey.value] ?? a[sortKey.value], y = b.scores?.[sortKey.value] ?? b[sortKey.value]
  return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-CN')) * (ascending.value ? 1 : -1)
}))
async function action(fn) { if (busy.value) return; busy.value = true; error.value = ''; try { await fn() } catch (e) { error.value = e.message; if (e.status === 401) loggedIn.value = false } finally { busy.value = false } }
async function refresh() { const me = await api('/teacher/me'); round.value = me.round; submissions.value = await api('/teacher/submissions') }
function applyScenario(data) { scenario.value = data.scenario; reference.value = data.reference; validated.value = true }
async function load() { await refresh(); applyScenario(await api('/teacher/scenario')) }
async function login() { await action(async () => { try { await post('/teacher/login', { password: password.value }) } finally { password.value = '' } loggedIn.value = true; await load(); notify('本页含学生成绩，投屏前请注意。') }) }
onMounted(async () => { try { await api('/teacher/me'); loggedIn.value = true; await action(load); notify('本页含学生成绩，投屏前请注意。') } catch (e) { if (e.status !== 401) error.value = e.message } })
function sort(key) { if (sortKey.value === key) ascending.value = !ascending.value; else { sortKey.value = key; ascending.value = true } }
function askRound(save = false) { confirmation.value = { type: save ? 'saveRound' : 'round', message: '将开始新一轮实训。学生未提交的旧草稿将无法再提交；本页只显示新一轮的成绩；旧一轮的数据仍保存在数据库中。' } }
async function confirm() { await action(async () => {
  const c = confirmation.value
  if (c.type === 'delete') { await api(`/teacher/submissions/${c.id}`, { method: 'DELETE' }); if (detail.value?.id === c.id) detail.value = null }
  else { if (c.type === 'saveRound') await save(); await post('/teacher/rounds') }
  confirmation.value = null; await refresh()
}) }
async function validate() { validated.value = false; reference.value = null; const result = await post('/teacher/scenario/validate', scenario.value); reference.value = result.reference; validated.value = true }
async function save() { await validate(); applyScenario(await api('/teacher/scenario', { method: 'PUT', body: scenario.value })); notify('实验数据已保存，下次开始新一轮时生效。') }
function edited() { validated.value = false; reference.value = null }
async function upload(event) { const file = event.target.files[0]; if (!file) return; await action(async () => {
  let data
  try { data = JSON.parse(await file.text()) } catch { throw new Error('JSON 文件格式错误，请检查文件后重新上传。') }
  const result = await post('/teacher/scenario/validate', data)
  scenario.value = data; reference.value = result.reference; validated.value = true
  notify('上传数据校验通过，请查看参考指标后点击保存。')
}); event.target.value = '' }
function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(scenario.value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'scenario.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
</script>
<template>
  <form v-if="!loggedIn" class="card login" @submit.prevent="login"><p class="eyebrow">教师工作台</p><h1>教师登录</h1><label>教师密码<input type="password" v-model="password" autocomplete="current-password" required></label><p v-if="error" class="error" role="alert">✕ {{ error }}</p><button class="primary" :disabled="busy">登录</button></form>
  <section v-else><div class="section-heading"><div><p class="eyebrow">教师工作台</p><h1>课堂实训管理</h1></div><button :disabled="busy" @click="action(async () => { await post('/teacher/logout'); loggedIn = false; detail = null; submissions = [] })">退出登录</button></div><div class="tabs"><button :class="{ active: tab === 'results' }" @click="tab = 'results'">本轮成绩</button><button :class="{ active: tab === 'scenario' }" @click="tab = 'scenario'">实验数据</button></div><p v-if="error" class="banner error preserve" role="alert">✕ {{ error }}</p>
  <template v-if="tab === 'results'"><div class="card round-bar"><div><h2>{{ round ? '当前轮次 #' + round.id.slice(0,6) : '还没有开始实训' }}</h2><p class="muted">{{ round ? `开始于 ${time(round.startedAt)}（北京时间） · 已提交 ${submissions.length} 人` : '开始第一轮后，学生即可进入实训。' }}</p></div><div class="actions"><button :disabled="busy" @click="action(refresh)">刷新</button><a class="button" v-if="round" href="/api/teacher/export.csv">导出 CSV</a><button class="danger" :disabled="busy" @click="askRound()">{{ round ? '开始新一轮' : '开始第一轮' }}</button></div></div><label class="search">搜索学号<input v-model="search" placeholder="输入学号筛选"></label><div class="card table-scroll"><table><thead><tr><th v-for="[key,label] in columns" :key="key" :aria-sort="sortKey === key ? ascending ? 'ascending' : 'descending' : 'none'"><button class="sort" @click="sort(key)">{{ label }} {{ sortKey === key ? ascending ? '↑' : '↓' : '' }}</button></th><th>操作</th></tr></thead><tbody><tr v-for="s in filtered" :key="s.id"><td>{{ s.studentId }}</td><td>{{ s.studentName }}</td><td>{{ time(s.submittedAt) }}</td><td v-for="key in ['abc','layout','reflection','total']" :key="key" class="numeric">{{ s.scores[key] }}</td><td class="numeric">{{ percent(s.improvement, true) }}</td><td><div class="actions"><button :disabled="busy" @click="action(async () => { detail = await api(`/teacher/submissions/${s.id}`) })">详情</button><button :disabled="busy" @click="confirmation = { type: 'delete', id: s.id, message: `删除 ${s.studentId} ${s.studentName} 的提交？删除后该学生可以重新提交。` }">删除</button></div></td></tr><tr v-if="!filtered.length"><td colspan="9" class="empty">{{ submissions.length ? '没有匹配的学号。' : '暂无提交，学生提交后点击刷新。' }}</td></tr></tbody></table></div></template>
  <section v-else-if="scenario" class="card scenario-editor"><div class="section-heading"><div><h2>{{ scenario.name }}</h2><p class="muted">修改将在下次“开始新一轮”时生效。增删商品或修改地图请上传 JSON。</p></div><div class="actions"><button :disabled="busy" @click="download">下载 JSON</button><label class="button upload">上传 JSON<input type="file" accept=".json,application/json" :disabled="busy" @change="upload"></label><button :disabled="busy" @click="action(async () => { applyScenario(await api('/teacher/scenario', { method: 'DELETE' })); notify('已恢复默认数据，下次开始新一轮时生效。') })">恢复默认数据</button></div></div><fieldset :disabled="busy" @input="edited"><div class="table-scroll"><table><thead><tr><th>SKU</th><th>名称</th><th>周转量</th></tr></thead><tbody><tr v-for="p in scenario.products" :key="p.sku"><td>{{ p.sku }}</td><td><input v-model="p.name" :aria-label="p.sku + ' 名称'"></td><td><input v-model.number="p.turnover" type="number" min="1" step="1" :aria-label="p.sku + ' 周转量'"></td></tr></tbody></table></div><div class="settings-grid"><div v-for="[factor, label] in [['turnover', '周转量累积占比'], ['itemCount', '品项数累积占比']]" :key="factor">
<h3>{{ label }}</h3>
<label>A：0% ～ <input :value="+(scenario.thresholds[factor].a * 100).toPrecision(12)" type="number" min="0" max="100" step="any" :aria-label="label + ' A 上限（%）'" @input="scenario.thresholds[factor].a = Number($event.target.value) / 100">%</label>
<label>B：{{ percent(scenario.thresholds[factor].a) }} ～ <input :value="+(scenario.thresholds[factor].b * 100).toPrecision(12)" type="number" min="0" max="100" step="any" :aria-label="label + ' B 上限（%）'" @input="scenario.thresholds[factor].b = Number($event.target.value) / 100">%</label>
<p>C：{{ percent(scenario.thresholds[factor].b) }} ～ 100%（自动补全）</p>
</div><label>检查次数上限<input v-model.number="scenario.abcCheckLimit" type="number" min="0" max="10" step="1"></label><label>满分改善率（比例）<input v-model.number="scenario.fullScoreImprovement" type="number" min="0.0001" max="1" step="0.01"></label></div></fieldset><div v-if="reference" class="rule">初始拣货距离 {{ number(reference.baselineDistance) }} 米 · 按周转量摆放最大改善 {{ percent(reference.bestImprovement) }} · 按 ABC 分类摆放改善 {{ percent(reference.abcImprovement) }}</div><p v-else class="muted">数据已修改，请先校验。最大改善率低于满分改善率时不能保存。</p><details><summary>仓库地图预览</summary><WarehouseMap :scenario="scenario" :placement="scenario.baselinePlacement" :answers="{}" readonly /></details><footer class="page-footer"><span>当前轮次数据不受修改影响。</span><div class="actions"><button :disabled="busy" @click="action(validate)">校验并查看参考指标</button><button class="primary" :disabled="busy || !validated" @click="action(save)">保存</button><button :disabled="busy || !validated" @click="askRound(true)">保存并开始新一轮</button></div></footer></section>
  </section>
  <DetailDialog v-if="detail" @close="detail = null"><h2 id="detail-title">{{ detail.studentId }} {{ detail.studentName }}</h2><p>{{ time(detail.submittedAt) }}（北京时间）</p><h2>总分 {{ detail.result.scores.total }} / 100</h2><p v-for="(feedback,key) in detail.result.feedback" :key="key">{{ feedback }}</p><MetricsCards :metrics="detail.result.metrics" /><h3>ABC 分类</h3><table><thead><tr><th>商品</th><th>学生分类</th><th>正确分类</th></tr></thead><tbody><tr v-for="p in detail.scenario.products" :key="p.sku"><td>{{ p.sku }} {{ p.name }}</td><td>{{ detail.answer.abcAnswers[p.sku] }}</td><td>{{ detail.correctClasses[p.sku] }}</td></tr></tbody></table><h3>储位摆放</h3><WarehouseMap :scenario="detail.scenario" :placement="detail.answer.placement" :answers="detail.answer.abcAnswers" readonly /><h3>反思</h3><p class="preserve">{{ detail.answer.reflection || '（未填写）' }}</p></DetailDialog>
  <ConfirmDialog v-if="confirmation" :message="confirmation.message" :busy="busy" @cancel="confirmation = null" @confirm="confirm" />
</template>
