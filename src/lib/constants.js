export const BROKER_COLORS = {
  etoro: '#2EA543',
  xtb: '#E4002B',
  ibkr: '#FF6600',
  btc: '#F7931A',
}

export const BROKER_NAMES = {
  etoro: 'eToro',
  xtb: 'XTB',
  ibkr: 'IBKR',
  btc: 'BTC',
}

export const POSITION_CLASSES = ['NÚCLEO', 'TÁCTICA', 'MOMENTUM', 'DISRUPTIVA']

export const SL_TYPES = ['TIGHT', 'STANDARD', 'WIDE']

export const CLASS_COLORS = {
  'NÚCLEO': '#2563eb',
  'NUCLEO': '#2563eb',
  'TÁCTICA': '#7c3aed',
  'TACTICA': '#7c3aed',
  'MOMENTUM': '#ea580c',
  'DISRUPTIVA': '#ec4899',
}

export const EVENT_TYPES = {
  EARNINGS: { label: 'Resultados', color: '#f59e0b' },
  FED: { label: 'FED', color: '#dc2626' },
  BCE: { label: 'BCE', color: '#2563eb' },
  EX_DIV: { label: 'Ex-dividendo', color: '#16a34a' },
  MACRO: { label: 'Macro', color: '#7c3aed' },
  CUSTOM: { label: 'Otro', color: '#6b7280' },
}

export const TICKER_SCROLL_SYMBOLS = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^IBEX', label: 'IBEX 35' },
  { symbol: '^STOXX50E', label: 'EUROSTOXX' },
  { symbol: 'GC=F', label: 'ORO' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: 'EURUSD=X', label: 'EUR/USD' },
]

export function formatCurrency(value, decimals = 2) {
  if (value == null || isNaN(value)) return '$0.00'
  const num = Number(value)
  const prefix = num < 0 ? '-' : ''
  return prefix + '$' + Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPct(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0.00%'
  return (Number(value) * 100).toFixed(decimals) + '%'
}

export function formatPctRaw(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0.00%'
  return Number(value).toFixed(decimals) + '%'
}

export function pnlColor(value) {
  if (value == null) return ''
  return Number(value) >= 0 ? 'text-gain' : 'text-loss'
}

export function pnlBg(value) {
  if (value == null) return ''
  return Number(value) >= 0 ? 'bg-green-50' : 'bg-red-50'
}

export function getSaturday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (6 - day + 7) % 7
  d.setDate(d.getDate() - (day === 6 ? 0 : (day + 1)))
  // Always return the most recent Saturday
  const sat = new Date(date)
  const dayOfWeek = sat.getDay()
  if (dayOfWeek === 6) return sat
  sat.setDate(sat.getDate() - ((dayOfWeek + 1) % 7))
  return sat
}

export function toDateStr(date) {
  return date.toISOString().split('T')[0]
}
