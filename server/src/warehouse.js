// Shared browser/server teaching model; shipped inside the standalone server.
export function encodeLocation({ zone, row, bay, level, slot }) {
  if (!/^\d{2}$/.test(String(zone)) || ![row, bay, level, slot].every(Number.isInteger) || row < 1 || row > 9 || bay < 1 || bay > 99 || level < 1 || level > 9 || slot < 1 || slot > 99) throw new Error('货位编码参数无效')
  return `${zone}${row}${String(bay).padStart(2, '0')}${level}${String(slot).padStart(2, '0')}`
}
export function decodeLocation(code) {
  if (typeof code !== 'string' || !/^\d{8}$/.test(code)) return null
  return { zone: code.slice(0, 2), row: +code[2], bay: +code.slice(3, 5), level: +code[5], slot: +code.slice(6) }
}
export function isValidLocation(code, scenario) {
  const v = decodeLocation(code), w = scenario.warehouse, l = w.layout
  return !!v && v.zone === w.zoneCode && v.row >= 1 && v.row <= l.rows && v.bay >= 1 && v.bay <= l.baysPerRow && v.level >= 1 && v.level <= l.levelsPerBay && v.slot >= 1 && v.slot <= l.slotsPerLevel
}
export function allLocations(scenario) {
  const w = scenario.warehouse, l = w.layout, result = []
  for (let row = 1; row <= l.rows; row++) for (let bay = 1; bay <= l.baysPerRow; bay++) for (let level = 1; level <= l.levelsPerBay; level++) for (let slot = 1; slot <= l.slotsPerLevel; slot++) result.push(encodeLocation({ zone: w.zoneCode, row, bay, level, slot }))
  return result
}
export function unavailableReason(code, scenario) { return scenario.warehouse.disabledLocations?.[code] ?? '' }
export function isAvailableLocation(code, scenario) { return isValidLocation(code, scenario) && !unavailableReason(code, scenario) }
export function availableLocations(scenario) { return allLocations(scenario).filter(code => isAvailableLocation(code, scenario)) }
export function locationLabel(code) {
  const v = decodeLocation(code)
  return v ? `${v.zone}区-${v.row}排-${String(v.bay).padStart(2, '0')}列-${v.level}层-${String(v.slot).padStart(2, '0')}位` : '无效货位'
}
export function getPalletCapacity(product, level, scenario) {
  const { pallet: p, slot: s } = scenario.warehouse, c = product.carton
  const cartonsPerLayer = Math.max(Math.floor(p.lengthMm / c.lengthMm) * Math.floor(p.widthMm / c.widthMm), Math.floor(p.lengthMm / c.widthMm) * Math.floor(p.widthMm / c.lengthMm))
  const allowedCargoHeight = s.levelClearHeightsMm[level - 1] - p.heightMm - s.handlingClearanceMm
  const maxLayersByHeight = Math.max(0, Math.floor(allowedCargoHeight / c.heightMm))
  const capacityCartons = Math.max(0, Math.min(cartonsPerLayer * maxLayersByHeight, Math.floor(p.maxPayloadKg / c.grossWeightKg)))
  const palletFits = p.lengthMm <= s.clearWidthMm && p.widthMm <= s.clearDepthMm
  const cargoWeight = product.stockCartons * c.grossWeightKg
  const actualLayers = cartonsPerLayer ? Math.ceil(product.stockCartons / cartonsPerLayer) : 0
  return { cartonsPerLayer, allowedCargoHeight, maxLayersByHeight, capacityCartons, palletFits, cargoWeight, totalWeight: cargoWeight + p.tareWeightKg, actualLayers, cargoHeight: actualLayers * c.heightMm, valid: palletFits && Number.isSafeInteger(product.stockCartons) && product.stockCartons > 0 && product.stockCartons <= capacityCartons }
}
export function validatePlacement(placement, scenario) {
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) return ['缺少储位方案']
  const errors = [], used = new Set()
  for (const sku of Object.keys(placement)) if (!scenario.products.some(p => p.sku === sku)) errors.push(`未知商品 ${sku}`)
  for (const p of scenario.products) {
    const code = placement[p.sku]
    if (!isValidLocation(code, scenario)) { errors.push(`${p.sku} 的货位不存在或未分配`); continue }
    if (!isAvailableLocation(code, scenario)) { errors.push(`${p.sku} 的货位 ${code} 不可用：${unavailableReason(code, scenario)}`); continue }
    if (used.has(code)) errors.push(`货位 ${code} 重复占用`)
    used.add(code)
    const level = decodeLocation(code).level, capacity = getPalletCapacity(p, level, scenario)
    if (!capacity.valid) errors.push(`${p.sku} ${p.name}：第${level}层最多${capacity.capacityCartons}箱，当前${p.stockCartons}箱${!capacity.palletFits ? '，托盘无法入位' : p.stockCartons === 0 ? '，无货待上架，不能放置' : '，请更换货位或调整库存'}`)
  }
  return errors
}
export function locationCost(code, scenario) {
  const v = decodeLocation(code)
  if (!isValidLocation(code, scenario)) return NaN
  return 2 * (v.bay - 0.5) * scenario.warehouse.layout.bayPitchMm / 1000 + (scenario.warehouse.levelPenalties ?? [0, 3, 6])[v.level - 1]
}
export function getPlacementCost(placement, scenario) { return scenario.products.reduce((sum, p) => sum + p.turnover * locationCost(placement[p.sku], scenario), 0) }
export function getImprovementRate(baseline, current) { return baseline > 0 ? (baseline - current) / baseline : 0 }
export function getStorageMetrics(placement, scenario) {
  const locations = allLocations(scenario), occupied = new Set(Object.values(placement).filter(c => isValidLocation(c, scenario)))
  const available = availableLocations(scenario)
  return { availableSlots: available.length, disabledSlots: locations.length - available.length, availableUtilization: available.length ? occupied.size / available.length : 0, levelAvailableSlots: [1,2,3].map(level => available.filter(c => decodeLocation(c).level === level).length), levelAvailableUtilization: [1,2,3].map(level => { const count = available.filter(c => decodeLocation(c).level === level).length; return count ? [...occupied].filter(c => decodeLocation(c).level === level).length / count : 0 }), stockCartons: scenario.products.reduce((n, p) => n + p.stockCartons, 0), occupiedSlots: occupied.size, totalSlots: locations.length, utilization: occupied.size / locations.length, levelUtilization: [1, 2, 3].map(level => [...occupied].filter(c => decodeLocation(c).level === level).length / locations.filter(c => decodeLocation(c).level === level).length) }
}
// Minimum-cost assignment with capacity constraints (rectangular Hungarian algorithm).
export function bestPlacement(scenario) {
  const ps = scenario.products, slots = availableLocations(scenario), n = ps.length, m = slots.length
  if (n > m) throw new Error(`可用货位仅${m}个，少于商品数量${n}`)
  const a = ps.map(p => slots.map(c => getPalletCapacity(p, decodeLocation(c).level, scenario).valid ? p.turnover * locationCost(c, scenario) : 1e30))
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), match = Array(m + 1).fill(0), way = Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    match[0] = i
    let j0 = 0
    const min = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = match[j0]; let delta = Infinity, j1 = 0
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < min[j]) { min[j] = cur; way[j] = j0 }
        if (min[j] < delta) { delta = min[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[match[j]] += delta; v[j] -= delta } else min[j] -= delta
      j0 = j1
    } while (match[j0])
    do { const j1 = way[j0]; match[j0] = match[j1]; j0 = j1 } while (j0)
  }
  return Object.fromEntries(slots.flatMap((c, j) => match[j + 1] ? [[ps[match[j + 1] - 1].sku, c]] : []))
}
