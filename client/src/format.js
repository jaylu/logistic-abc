export const number = (n) => Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
export const money = (n) => Number(n).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })
export const percent = (n, signed = false) => `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(1)}%`
export function time(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}
