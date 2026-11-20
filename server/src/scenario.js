import { validateScenarioV3 } from './scenario-v3.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyAbc, parseMap, referenceMetrics } from './calc.js'

const DEFAULT_FILE = fileURLToPath(new URL('../data/default-scenario.json', import.meta.url))
const ID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/

const isInt = (x) => Number.isSafeInteger(x)
const isText = (x, max) => typeof x === 'string' && x.trim().length > 0 && Array.from(x).length <= max

// 返回中文问题列表；为空表示通过
export function validateScenario(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['实验数据必须是一个 JSON 对象']
  if (s.schemaVersion === 3) return validateScenarioV3(s)
  const errors = []
  if (s.schemaVersion !== 1) errors.push('schemaVersion 必须为 1')
  if (!isText(s.name, 40)) errors.push('name（场景名称）必填，最多 40 字')
  if (s.description !== undefined && (typeof s.description !== 'string' || s.description.length > 300)) {
    errors.push('description（场景说明）最多 300 字')
  }

  for (const [factor, label] of [['turnover', '周转量'], ['itemCount', '品项数']]) {
    const t = s.thresholds?.[factor]
    if (!t || typeof t.a !== 'number' || typeof t.b !== 'number' || !(t.a > 0 && t.a < t.b && t.b < 1)) {
      errors.push(`${label}累计占比阈值必须满足 0 < a < b < 1，C 自动补全至 100%`)
    }
  }
  if (!isInt(s.abcCheckLimit) || s.abcCheckLimit < 0 || s.abcCheckLimit > 10) errors.push('abcCheckLimit 必须是 0～10 的整数')
  if (typeof s.fullScoreImprovement !== 'number' || !(s.fullScoreImprovement > 0 && s.fullScoreImprovement <= 1)) {
    errors.push('fullScoreImprovement 必须大于 0 且不超过 1')
  }
  if (typeof s.cellSizeMeters !== 'number' || !(s.cellSizeMeters > 0 && s.cellSizeMeters <= 100)) {
    errors.push('cellSizeMeters 必须是 0～100 之间的正数')
  }

  let slotIds = null
  const m = s.map
  if (!Array.isArray(m) || m.length === 0 || m.length > 30 || !m.every((row) => typeof row === 'string')) {
    errors.push('map 必须是 1～30 行的字符串数组')
  } else if (!m.every((row) => row.length === m[0].length && row.length > 0 && row.length <= 30)) {
    errors.push('map 每行长度必须相同，且为 1～30 个字符')
  } else if (!m.every((row) => /^[ES.#]+$/.test(row))) {
    errors.push('map 只能包含 E、S、.、# 四种字符')
  } else if (m.join('').split('E').length - 1 !== 1) {
    errors.push('map 必须恰好有一个出库口 E')
  } else {
    const parsed = parseMap(m, 1)
    errors.push(...parsed.errors)
    if (parsed.errors.length === 0) slotIds = new Set(parsed.slots.map((x) => x.slotId))
  }

  const products = s.products
  let skus = null
  if (!Array.isArray(products) || products.length < 2 || products.length > 30) {
    errors.push('products 必须包含 2～30 个商品')
  } else {
    skus = new Set()
    products.forEach((p, i) => {
      const label = `第 ${i + 1} 个商品`
      if (!p || typeof p !== 'object') return errors.push(`${label}格式错误`)
      if (typeof p.sku !== 'string' || !ID_PATTERN.test(p.sku)) errors.push(`${label}的 SKU 只能包含字母、数字、-、_，最多 16 位`)
      else if (skus.has(p.sku)) errors.push(`SKU ${p.sku} 重复`)
      else skus.add(p.sku)
      const name = p.sku ?? label
      if (!isText(p.name, 20)) errors.push(`${name} 的名称必填，最多 20 字`)
      if (!isInt(p.turnover) || p.turnover <= 0) errors.push(`${name} 的周转量必须是安全范围内的正整数`)
    })
    if (slotIds && slotIds.size < products.length) errors.push(`储位数（${slotIds.size}）少于商品数（${products.length}）`)
  }

  const bp = s.baselinePlacement
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) {
    errors.push('baselinePlacement（初始布局）必填')
  } else if (skus && slotIds) {
    errors.push(...placementErrors(bp, [...skus], slotIds).map((e) => `初始布局：${e}`))
  }

  if (errors.length === 0) {
    const total = products.reduce((sum, p) => sum + p.turnover, 0)
    if (!Number.isSafeInteger(total) || total <= 0) errors.push('总周转量必须大于 0，且不能超过安全计算范围')
    const distances = parseMap(s.map, s.cellSizeMeters).slots.map(slot => slot.distance)
    const maximumDistance = products.reduce((sum, p) => sum + p.turnover * 2 * Math.max(...distances), 0)
    if (!Number.isFinite(maximumDistance) || maximumDistance > Number.MAX_SAFE_INTEGER) errors.push('拣货距离超过安全计算范围，请减小周转量或地图尺寸')
  }
  if (errors.length === 0) {
    const ref = referenceMetrics(s)
    if (ref.bestImprovement < s.fullScoreImprovement) {
      errors.push(
        `按周转量摆放最多只能改善 ${(ref.bestImprovement * 100).toFixed(1)}%，低于满分改善率 ${(s.fullScoreImprovement * 100).toFixed(1)}%，学生无法拿到布局满分`,
      )
    }
  }
  return errors
}

// 检查摆放：每个商品一个合法储位、不重复、无多余商品
export function placementErrors(placement, skus, slotIds) {
  const errors = []
  const used = new Map()
  const missing = skus.filter((sku) => !placement[sku])
  if (missing.length) errors.push(`有 ${missing.length} 个商品未放入储位（${missing.join('、')}）`)
  const extra = Object.keys(placement).filter((k) => !skus.includes(k))
  if (extra.length) errors.push(`包含未知商品：${extra.join('、')}`)
  for (const sku of skus) {
    const slot = placement[sku]
    if (!slot) continue
    if (typeof slot !== 'string' || !slotIds.has(slot)) errors.push(`${sku} 的储位 ${slot} 不存在`)
    else if (used.has(slot)) errors.push(`储位 ${slot} 同时放了 ${used.get(slot)} 和 ${sku}`)
    else used.set(slot, sku)
  }
  return errors
}

// 只保留已知字段，去除多余内容
export function normalizeScenario(s) {
  if (s.schemaVersion === 3) return { schemaVersion: 3, name: s.name.trim(), description: s.description.trim(), ...(s.scenarioRevision === undefined ? {} : { scenarioRevision: s.scenarioRevision }), thresholds: structuredClone(s.thresholds), abcCheckLimit: s.abcCheckLimit, fullScoreImprovement: s.fullScoreImprovement, warehouse: structuredClone(s.warehouse), products: s.products.map(p => ({ sku: p.sku, name: p.name.trim(), turnover: p.turnover, stockCartons: p.stockCartons, carton: Object.fromEntries(['lengthMm','widthMm','heightMm','unitsPerCarton','grossWeightKg'].map(k => [k,p.carton[k]])) })), baselinePlacement: { ...s.baselinePlacement }, documentReview: { ...structuredClone(s.documentReview), maxMarks: s.documentReview.maxMarks ?? s.documentReview.errorCount }, scoring: { ...s.scoring } }
  return {
    schemaVersion: 1,
    name: s.name.trim(),
    description: (s.description ?? '').trim(),
    thresholds: Object.fromEntries(['turnover', 'itemCount'].map(key => [key, { a: s.thresholds[key].a, b: s.thresholds[key].b }])),
    abcCheckLimit: s.abcCheckLimit,
    fullScoreImprovement: s.fullScoreImprovement,
    cellSizeMeters: s.cellSizeMeters,
    map: [...s.map],
    products: s.products.map((p) => ({
      sku: p.sku,
      name: p.name.trim(),
      turnover: p.turnover,
    })),
    baselinePlacement: Object.fromEntries(s.products.map((p) => [p.sku, s.baselinePlacement[p.sku]])),
  }
}

export function describeScenario(s) {
  return { reference: referenceMetrics(s), classes: classifyAbc(s.products, s.thresholds).classes }
}

export function createScenarioStore(dataDir, log = console) {
  const overrideFile = path.join(dataDir, 'scenario.json')

  const defaultScenario = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'))
  const defaultErrors = validateScenario(defaultScenario)
  if (defaultErrors.length) throw new Error(`默认实验数据无效：${defaultErrors.join('；')}`)

  function current() {
    if (fs.existsSync(overrideFile)) {
      try {
        const custom = JSON.parse(fs.readFileSync(overrideFile, 'utf8'))
        const errors = validateScenario(custom)
        if (errors.length === 0 && custom.schemaVersion === 3) return { scenario: normalizeScenario(custom), isDefault: false }
        log.error(`自定义实验数据无效，改用默认数据：${errors.join('；')}`)
      } catch (err) {
        log.error(`读取自定义实验数据失败，改用默认数据：${err.message}`)
      }
    }
    return { scenario: normalizeScenario(defaultScenario), isDefault: true }
  }

  function save(scenario) {
    const tmp = `${overrideFile}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(normalizeScenario(scenario), null, 2))
    fs.renameSync(tmp, overrideFile)
  }

  function reset() {
    fs.rmSync(overrideFile, { force: true })
  }

  return { current, save, reset }
}
