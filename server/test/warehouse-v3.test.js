import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { encodeLocation, decodeLocation, allLocations, isValidLocation, getPalletCapacity, validatePlacement, getPlacementCost, getStorageMetrics, bestPlacement } from '../src/warehouse.js'
import { validateScenario, normalizeScenario } from '../src/scenario.js'
import { createReview, reviewDocument, validateReview, scoreReview, placementFingerprint, REVIEW_FIELDS } from '../src/review.js'
import { classifyAbc, scoreSubmission } from '../src/calc.js'
const scenario = JSON.parse(fs.readFileSync(new URL('../data/default-scenario.json', import.meta.url)))
const context = { sessionId: 'round-1', studentId: 'S01', studentName: '张三' }
function exercise(s = scenario, placement = s.baselinePlacement) {
  const review = createReview(placement, s, context, 'attempt-1', '2026-11-20T00:00:00Z'); review.completed = true
  return { review, document: reviewDocument(placement, s, context, review) }
}
test('v3: 48个唯一编码、前导零、范围与每层16位', () => {
  const codes = allLocations(scenario)
  assert.equal(codes.length, 48); assert.equal(new Set(codes).size, 48)
  for (const code of codes) { assert.match(code, /^\d{8}$/); assert.equal(encodeLocation(decodeLocation(code)), code); assert.ok(isValidLocation(code, scenario)) }
  assert.deepEqual(decodeLocation('01204302'), {zone:'01',row:2,bay:4,level:3,slot:2})
  assert.deepEqual(decodeLocation('01101101'), {zone:'01',row:1,bay:1,level:1,slot:1})
  for (const code of [1101101, 'R1-S1', '01205301', '01101000']) assert.equal(isValidLocation(code, scenario), false)
  for (let level=1;level<=3;level++) assert.equal(codes.filter(c=>decodeLocation(c).level===level).length,16)
})
test('v3: 层高、几何、托盘载荷、零库存与重复占位', () => {
  assert.deepEqual([1,2,3].map(l=>getPalletCapacity(scenario.products[0],l,scenario).allowedCargoHeight), [710,740,660])
  for (const p of scenario.products) for (const level of [1,2,3]) assert.ok(getPalletCapacity(p,level,scenario).valid, p.sku)
  const p12 = scenario.products.find(p=>p.sku==='P12')
  assert.equal(getPalletCapacity({...p12,stockCartons:5},3,scenario).valid,false)
  assert.equal(getPalletCapacity({...p12,stockCartons:0},1,scenario).valid,false)
  assert.equal(getPalletCapacity({...p12,carton:{...p12.carton,grossWeightKg:300}},1,scenario).valid,false)
  const small = structuredClone(scenario); small.warehouse.slot.clearWidthMm = 1100
  assert.equal(getPalletCapacity(p12,1,small).valid,false)
  assert.deepEqual(validatePlacement(scenario.baselinePlacement,scenario),[])
  assert.match(validatePlacement({...scenario.baselinePlacement,P01:scenario.baselinePlacement.P02},scenario).join(),/重复/)
})
test('v3: 成本、容量约束优化、储位利用率及ABC保持一致', () => {
  assert.equal(getPlacementCost(scenario.baselinePlacement,scenario),41846.5)
  const best = bestPlacement(scenario)
  assert.deepEqual(validatePlacement(best,scenario),[])
  assert.ok(getPlacementCost(best,scenario)<41846.5*.7)
  const moved={...scenario.baselinePlacement,P09:'01101102'}
  assert.ok(getPlacementCost(moved,scenario)<41846.5)
  assert.equal(getStorageMetrics(moved,scenario).utilization,.25)
  const old = JSON.parse(fs.readFileSync(new URL('./fixtures/scenario-v1.json',import.meta.url)))
  assert.deepEqual(classifyAbc(scenario.products,scenario.thresholds).classes,classifyAbc(old.products,old.thresholds).classes)
})
test('v3: 审核严格基于学生方案、五个不同单元格、固定日期与刷新复现', () => {
  const placement={...scenario.baselinePlacement,P09:'01101102'}, {review,document}=exercise(scenario,placement)
  const again=reviewDocument(JSON.parse(JSON.stringify(placement)),scenario,context,JSON.parse(JSON.stringify(review)))
  assert.deepEqual(document,again); assert.equal(document.rows.length,12)
  assert.equal(document.errorCells.length,5); assert.equal(new Set(document.errorCells.map(c=>c.rowId)).size,5)
  const truth=Object.fromEntries(document.errorCells.map(c=>[`${c.rowId}:${c.fieldKey}`,c]))
  let changes=0
  for(const row of document.rows) for(const field of REVIEW_FIELDS) {
    const cell=truth[`${row.rowId}:${field}`]
    if(cell) { assert.notEqual(cell.correctValue,cell.displayedValue); changes++ }
    if(field==='locationCode') assert.equal(cell?.correctValue??row[field],placement[row.rowId])
  }
  assert.equal(changes,5)
  assert.equal(placementFingerprint(placement),placementFingerprint(Object.fromEntries(Object.entries(placement).reverse())))
  assert.deepEqual(validateReview(review,placement,scenario,context),[])
  assert.ok(validateReview(review,scenario.baselinePlacement,scenario,context).length)
  assert.ok(validateReview(review,placement,scenario,{...context,studentId:'other'}).length)
})
test('v3: 20/0/8/8/0审核评分、3错误配置、服务端五项满分', () => {
  const {document}=exercise(), errors=document.errorCells, right=errors.map(({rowId,fieldKey})=>({rowId,fieldKey}))
  const wrong=document.rows.flatMap(r=>REVIEW_FIELDS.map(fieldKey=>({rowId:r.rowId,fieldKey}))).filter(m=>!right.some(c=>c.rowId===m.rowId&&c.fieldKey===m.fieldKey)).slice(0,5)
  for(const [marks,expected] of [[right,20],[wrong,0],[[...right.slice(0,3),...wrong.slice(0,2)],8],[right.slice(0,2),8],[[],0]]) assert.equal(scoreReview(marks,errors,scenario.documentReview).score,expected)
  const s=structuredClone(scenario); s.documentReview.errorCount=3;s.documentReview.maxMarks=3
  const three=exercise(s); assert.equal(three.document.errorCells.length,3)
  assert.equal(scoreReview(three.document.errorCells,three.document.errorCells,s.documentReview).score,20)
  const placement=bestPlacement(s), ex=exercise(s,placement);ex.review.marks=ex.document.errorCells.map(({rowId,fieldKey})=>({rowId,fieldKey}))
  const reflection='因为周转量高的A类商品拣货频繁，所以优先放在靠近出库口的位置，以缩短拣货距离。如果订单结构变化，我会重新计算并更新ABC分类，再按新结果重新分配储位，同时复核容量、堆高和载荷。'
  const result=scoreSubmission(s,{placement,abcAnswers:classifyAbc(s.products,s.thresholds).classes,review:ex.review,reflection},context)
  assert.equal(result.scores.total,100)
  assert.deepEqual(Object.values(result.scoreMax),[35,15,25,20,5])
})
test('v3: 非法审核标注、缺失审核、重复标记、版本配置均被拒绝', () => {
  const {review}=exercise()
  for(const marks of [[{rowId:'P01',fieldKey:'header'}],[{rowId:'unknown',fieldKey:'sku'}],Array(2).fill({rowId:'P01',fieldKey:'sku'}),Array(6).fill({rowId:'P01',fieldKey:'sku'})]) assert.ok(validateReview({...review,marks},scenario.baselinePlacement,scenario,context).length)
  assert.ok(validateReview(null,scenario.baselinePlacement,scenario,context).length)
  assert.deepEqual(validateScenario(scenario),[])
  for(const change of [s=>s.scoring.abc=99,s=>s.warehouse.layout.rows=100,s=>s.products[0].carton.heightMm=NaN,s=>s.products[0].stockCartons=-1,s=>s.documentReview.errorCount=13,s=>s.documentReview.allowedErrorFields=['bad'],s=>s.fullScoreImprovement=.99,s=>s.products.forEach(p=>p.carton={...s.products[0].carton})]) {
    const s=structuredClone(scenario);change(s)
    if (s.products.every(p=>p.carton.heightMm===s.products[0].carton.heightMm)) s.documentReview.allowedErrorFields=['specification']
    assert.ok(validateScenario(s).length)
  }
  assert.equal(normalizeScenario(scenario).schemaVersion,3)
})

test('不可用货位配置：默认16位、校验拒绝占用、最优解仅使用可用货位', async () => {
  const {availableLocations,isAvailableLocation}=await import('../src/warehouse.js')
  assert.equal(availableLocations(scenario).length,16)
  const blocked=Object.keys(scenario.warehouse.disabledLocations)[0]
  assert.equal(isValidLocation(blocked,scenario),true)
  assert.equal(isAvailableLocation(blocked,scenario),false)
  assert.match(validatePlacement({...scenario.baselinePlacement,P01:blocked},scenario).join(),/不可用/)
  const best=bestPlacement(scenario)
  assert.ok(Object.values(best).every(c=>isAvailableLocation(c,scenario)))
  assert.deepEqual(validatePlacement(best,scenario),[])
  const metrics=getStorageMetrics(scenario.baselinePlacement,scenario)
  assert.equal(metrics.availableSlots,16);assert.equal(metrics.disabledSlots,32);assert.equal(metrics.availableUtilization,.75)
  const unrestricted=structuredClone(scenario);delete unrestricted.warehouse.disabledLocations
  assert.equal(availableLocations(unrestricted).length,48)
  assert.ok(getPlacementCost(best,scenario)>=getPlacementCost(bestPlacement(unrestricted),unrestricted))
  assert.deepEqual(normalizeScenario(scenario).warehouse.disabledLocations,scenario.warehouse.disabledLocations)
  for(const disabledLocations of [null,[],{'00000000':'不存在'},{[blocked]:''},{[blocked]:42},{[scenario.baselinePlacement.P01]:'暂停使用'}]) {
    const s=structuredClone(scenario);s.warehouse.disabledLocations=disabledLocations
    assert.ok(validateScenario(s).length)
  }
  const full=structuredClone(scenario);full.warehouse.disabledLocations=Object.fromEntries(allLocations(full).map(c=>[c,'维护']))
  assert.match(validateScenario(full).join(),/可用货位数少于/)
  assert.throws(()=>bestPlacement(full),/少于商品/)
})

test('货架拖动：空位移动、占用位交换、失败时保留双方原位', async () => {
  const {moveProduct}=await import('../src/warehouse.js')
  const original={...scenario.baselinePlacement}, snapshot={...original}
  const moved=moveProduct(original,'P09','01101102',scenario)
  assert.deepEqual(moved.errors,[])
  assert.equal(moved.placement.P09,'01101102')
  assert.ok(!Object.values(moved.placement).includes(original.P09))
  const swap=moveProduct(original,'P09',original.P01,scenario)
  assert.equal(swap.swappedSku,'P01')
  assert.equal(swap.placement.P09,original.P01)
  assert.equal(swap.placement.P01,original.P09)
  assert.deepEqual(original,snapshot)
  const blocked=Object.keys(scenario.warehouse.disabledLocations)[0]
  assert.ok(moveProduct(original,'P09',blocked,scenario).errors.length)
  assert.ok(moveProduct(original,'P09','invalid',scenario).errors.length)
  assert.ok(moveProduct(original,'UNKNOWN',original.P01,scenario).errors.length)
  // P07 has 350mm cartons: eight fit on level 1, only four on level 3.
  // P09 can move to P07's level 1, but P07 cannot move back to P09's level 3.
  const restricted=structuredClone(scenario)
  restricted.products.find(p=>p.sku==='P07').stockCartons=8
  const placement={...original,P07:'01201102'}
  const invalidSwap=moveProduct(placement,'P09',placement.P07,restricted)
  assert.match(invalidSwap.errors.join(),/P07/)
  assert.equal(invalidSwap.placement,undefined)
  assert.equal(placement.P09,original.P09)
  assert.equal(placement.P07,'01201102')
})
