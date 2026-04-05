export const fmtU = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US')

export const fmtE = (n: number) =>
  Math.round(n).toLocaleString('en-US') + '€'

export const fmtP = (n: number) =>
  (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

export const clr = (n: number) =>
  n >= 0 ? '#2ecc8a' : '#e05555'

export const EUR_USD = 1.09 // fallback

export function parseFecha(d: string): Date {
  const [dd, mm, yy] = d.split('/')
  return new Date(+('20' + yy), +mm - 1, +dd)
}

export function diasHasta(d: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const target = parseFecha(d)
  return Math.round((target.getTime() - hoy.getTime()) / 86400000)
}

export function notaFecha(): string {
  const n = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${String(n.getFullYear()).slice(-2)} ${pad(n.getHours())}:${pad(n.getMinutes())}`
}

export function todayStr(): string {
  const n = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${String(n.getFullYear()).slice(-2)}`
}
