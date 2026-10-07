// BTP · Fechas en hora local de José (Europe/Madrid). `new Date().toISOString()` da la fecha UTC:
// entre las 00:00 y las 02:00 de Madrid devolvía el día anterior (auditoría 07/10/2026).
export function fechaLocalISO(d = new Date(), timeZone = 'Europe/Madrid') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
