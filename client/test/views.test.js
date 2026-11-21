import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createReview } from '../../server/src/review.js'
import { classifyAbc } from '../../server/src/calc.js'
import { newDraft } from '../src/draft.js'

test('v3页面渲染：开始、ABC、48位地图、审核单与提交摘要', async () => {
  const vite=await createServer({configFile:new URL('../vite.config.js',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'})
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){},removeItem(){}}})
  try {
    const {state}=await vite.ssrLoadModule('/client/src/state.js')
    const scenario=JSON.parse(fs.readFileSync(new URL('../../server/data/default-scenario.json',import.meta.url)))
    state.round={id:'render-round',scenario};state.draft=newDraft(state.round,'S01','张三')
    const result=classifyAbc(scenario.products,scenario.thresholds)
    state.draft.abcAnswers=result.classes
    state.draft.abcCalculations=Object.fromEntries(result.rows.map(r=>[r.sku,{turnover:r.cumAfter*100,itemCount:r.itemCumAfter*100}]))
    state.draft.abcGuideDone=true
    state.draft.review=createReview(state.draft.placement,scenario,{sessionId:state.round.id,studentId:'S01'},'attempt','2026-11-20T00:00:00Z');state.draft.review.completed=true
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]})
    await router.push('/student/review');await router.isReady()
    for(const [file,expected] of [['StudentStart','从库存分类'],['AbcPage','ABC 分类'],['LayoutPage','01101101'],['DocumentReview','储位分配单'],['SubmitPage','单据审核已完成']]) {
      const {default:Page}=await vite.ssrLoadModule(`/client/src/pages/${file}.vue`)
      const app=createSSRApp(Page);app.use(router)
      const html=await renderToString(app)
      assert.ok(html.includes(expected),`${file} missing ${expected}`)
      assert.ok(!html.includes('演示：一键填写'), `${file}: normal round hides demo control`)
      state.round.demo = true
      const demoApp = createSSRApp(Page); demoApp.use(router)
      const demoHtml = await renderToString(demoApp)
      assert.ok(demoHtml.includes('演示：一键填写'), `${file}: demo round shows fill control`)
      state.round.demo = false
      if(file==='LayoutPage') {
        assert.equal((html.match(/class="[^"]*\brack-cell\b[^"]*"/g) || []).length,48)
        assert.deepEqual([...html.matchAll(/data-rack-level="([^"]+)"/g)].map(m=>m[1]),['1-3','1-2','1-1','2-1','2-2','2-3'])
      }
      if(file==='DocumentReview') { assert.ok(html.includes('查看储位图（弹窗）')); assert.ok(!html.includes('href="/student/layout"')); assert.ok(html.includes('作业单号'));  assert.ok(html.includes('第12行')); assert.ok(html.includes('5 处录入错误')) }
    }
  } finally {await vite.close();if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage}
})

test('教学统计渲染：无轮次、空轮次、图表和反思安全输出', async () => {
  const vite = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: Page } = await vite.ssrLoadModule('/client/src/components/TeachingStatistics.vue')
    const { roundStatistics } = await import('../../server/src/statistics.js')
    const scenario = JSON.parse(fs.readFileSync(new URL('../../server/data/default-scenario.json', import.meta.url)))
    const render = stats => renderToString(createSSRApp(Page, { stats }))
    assert.match(await render(null), /还没有开始实训/)
    assert.match(await render(roundStatistics({ id: 'r', scenario }, [])), /本轮暂无提交/)
    const stats = roundStatistics({ id: 'r', scenario }, [{ id: 's', studentId: '01', studentName: '学生', answer: { abcAnswers: classifyAbc(scenario.products, scenario.thresholds).classes, reflection: '<script>alert(1)</script>' }, result: { scores: { total: 50 }, metrics: { improvement: -0.1, baselineCost: 100, currentCost: 110 } } }])
    const html = await render(stats)
    for (const text of ['任务完成与达成情况', '各商品分类错误率', '储位优化改善率分布', '单据审核', '无参与数据', '-10.0%', '&lt;script&gt;', 'statistics.csv']) assert.ok(html.includes(text), text)
    assert.ok(!html.includes('<script>alert'))
    // Compile the parent page too, including its new tab and event bindings.
    await vite.ssrLoadModule('/client/src/pages/TeacherPage.vue')
  } finally { await vite.close() }
})
