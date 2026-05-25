// =============================================================================
// CALENDARIO DE FESTIVOS BURSÁTILES 2026-2027
// Fuente: calendarios oficiales de las propias bolsas (EODHD, NYSE, LSE,
// BME, KRX, JPX, HKEX, Euronext, Deutsche Börse).
// Verificados: noviembre 2025 - mayo 2026.
//
// Formato: cada mercado tiene array de objetos { date, name, early }
// - date: YYYY-MM-DD
// - name: nombre del festivo (corto, legible)
// - early: true si es cierre anticipado, false/undefined si es cierre completo
//
// Mercados cubiertos (relevantes para portfolio de José):
//   US     — NYSE / NASDAQ           (acciones americanas)
//   LSE    — London Stock Exchange   (CSKR.UK, SMSN.UK)
//   BME    — Bolsa de Madrid         (SAN1.ES, ACS.MC, IBEX 35)
//   XETRA  — Deutsche Börse Frankfurt (VBTC.DE)
//   PARIS  — Euronext Paris          (CAC 40, descorrelación)
//   JPX    — Tokyo Stock Exchange    (7012.T Kawasaki)
//   KRX    — Korea Exchange          (Samsung directo)
//   HKEX   — Hong Kong Exchange      (referencia Asia)
//   TSX    — Toronto Stock Exchange  (referencia Norte América)
// =============================================================================

export const MARKETS = {
  US:    { label: 'US (NYSE/NASDAQ)', color: '#1F7A3F', flag: '🇺🇸' },
  LSE:   { label: 'LSE Londres',      color: '#0c4a6e', flag: '🇬🇧' },
  BME:   { label: 'BME Madrid',       color: '#dc2626', flag: '🇪🇸' },
  XETRA: { label: 'XETRA Frankfurt',  color: '#1f2937', flag: '🇩🇪' },
  PARIS: { label: 'Euronext Paris',   color: '#3730a3', flag: '🇫🇷' },
  JPX:   { label: 'JPX Tokyo',        color: '#be123c', flag: '🇯🇵' },
  KRX:   { label: 'KRX Corea',        color: '#0369a1', flag: '🇰🇷' },
  HKEX:  { label: 'HKEX Hong Kong',   color: '#b45309', flag: '🇭🇰' },
  TSX:   { label: 'TSX Toronto',      color: '#7c2d12', flag: '🇨🇦' },
}

export const MARKET_HOLIDAYS = {
  US: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
    { date: '2026-02-16', name: "Presidents' Day" },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-05-25', name: 'Memorial Day' },
    { date: '2026-06-19', name: 'Juneteenth' },
    { date: '2026-07-03', name: 'Independence Day (obs.)' },
    { date: '2026-09-07', name: 'Labor Day' },
    { date: '2026-11-26', name: 'Thanksgiving' },
    { date: '2026-11-27', name: 'Día después de Thanksgiving', early: true },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    // 2027
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-01-18', name: 'Martin Luther King Jr. Day' },
    { date: '2027-02-15', name: "Presidents' Day" },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-05-31', name: 'Memorial Day' },
    { date: '2027-06-18', name: 'Juneteenth (obs.)' },
    { date: '2027-07-05', name: 'Independence Day (obs.)' },
    { date: '2027-09-06', name: 'Labor Day' },
    { date: '2027-11-25', name: 'Thanksgiving' },
    { date: '2027-11-26', name: 'Día después de Thanksgiving', early: true },
    { date: '2027-12-24', name: 'Navidad (obs.)' },
  ],

  LSE: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-04-06', name: 'Lunes de Pascua' },
    { date: '2026-05-04', name: 'Early May Bank Holiday' },
    { date: '2026-05-25', name: 'Spring Bank Holiday' },
    { date: '2026-08-31', name: 'Summer Bank Holiday' },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-28', name: 'Boxing Day (obs.)' },
    { date: '2026-12-31', name: 'Nochevieja', early: true },
    // 2027
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-03-29', name: 'Lunes de Pascua' },
    { date: '2027-05-03', name: 'Early May Bank Holiday' },
    { date: '2027-05-31', name: 'Spring Bank Holiday' },
    { date: '2027-08-30', name: 'Summer Bank Holiday' },
    { date: '2027-12-24', name: 'Nochebuena', early: true },
    { date: '2027-12-27', name: 'Navidad (obs.)' },
    { date: '2027-12-28', name: 'Boxing Day (obs.)' },
    { date: '2027-12-31', name: 'Nochevieja', early: true },
  ],

  BME: [
    // 2026 — solo 5 festivos completos (sesiones reducidas 24 y 31 dic)
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-04-06', name: 'Lunes de Pascua' },
    { date: '2026-05-01', name: 'Día del Trabajo' },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-31', name: 'Nochevieja', early: true },
    // 2027 (estimación basada en patrón habitual, confirmar cuando BME publique)
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-03-29', name: 'Lunes de Pascua' },
    { date: '2027-12-24', name: 'Nochebuena', early: true },
    { date: '2027-12-31', name: 'Nochevieja', early: true },
  ],

  XETRA: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-04-06', name: 'Lunes de Pascua' },
    { date: '2026-05-01', name: 'Día del Trabajo' },
    { date: '2026-12-24', name: 'Nochebuena' },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-26', name: 'San Esteban' },
    { date: '2026-12-31', name: 'Nochevieja' },
    // 2027
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-03-29', name: 'Lunes de Pascua' },
    { date: '2027-12-24', name: 'Nochebuena' },
    { date: '2027-12-31', name: 'Nochevieja' },
  ],

  PARIS: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-04-06', name: 'Lunes de Pascua' },
    { date: '2026-05-01', name: 'Día del Trabajo' },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-31', name: 'Nochevieja', early: true },
    // 2027
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-03-29', name: 'Lunes de Pascua' },
    { date: '2027-12-24', name: 'Nochebuena', early: true },
    { date: '2027-12-31', name: 'Nochevieja', early: true },
  ],

  JPX: [
    // 2026 — el mercado con MÁS festivos del mundo (19 días)
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-01-02', name: 'Festivo bancario' },
    { date: '2026-01-12', name: 'Coming of Age Day' },
    { date: '2026-02-11', name: 'National Foundation Day' },
    { date: '2026-02-23', name: "Emperor's Birthday" },
    { date: '2026-03-20', name: 'Vernal Equinox Day' },
    { date: '2026-04-29', name: 'Showa Day' },
    { date: '2026-05-04', name: 'Greenery Day' },
    { date: '2026-05-05', name: "Children's Day" },
    { date: '2026-05-06', name: 'Substitute Holiday' },
    { date: '2026-07-20', name: 'Marine Day' },
    { date: '2026-08-11', name: 'Mountain Day' },
    { date: '2026-09-21', name: 'Respect for the Aged' },
    { date: '2026-09-22', name: "Citizen's Holiday" },
    { date: '2026-09-23', name: 'Autumnal Equinox' },
    { date: '2026-10-12', name: 'Sports Day' },
    { date: '2026-11-03', name: 'Culture Day' },
    { date: '2026-11-23', name: 'Labor Thanksgiving' },
    { date: '2026-12-31', name: 'Cierre fin de año' },
    // 2027 (subset principal)
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-01-04', name: 'Festivo bancario' },
    { date: '2027-01-11', name: 'Coming of Age Day' },
    { date: '2027-02-11', name: 'National Foundation Day' },
    { date: '2027-02-23', name: "Emperor's Birthday" },
    { date: '2027-03-22', name: 'Vernal Equinox (obs.)' },
    { date: '2027-04-29', name: 'Showa Day' },
    { date: '2027-05-03', name: 'Constitution Day' },
    { date: '2027-05-04', name: 'Greenery Day' },
    { date: '2027-05-05', name: "Children's Day" },
    { date: '2027-12-31', name: 'Cierre fin de año' },
  ],

  KRX: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-02-16', name: 'Lunar New Year (víspera)' },
    { date: '2026-02-17', name: 'Lunar New Year' },
    { date: '2026-02-18', name: 'Lunar New Year (día después)' },
    { date: '2026-03-02', name: 'Independence Movement (obs.)' },
    { date: '2026-05-01', name: 'Labor Day' },
    { date: '2026-05-05', name: "Children's Day" },
    { date: '2026-05-25', name: "Buddha's Birthday (obs.)" },
    { date: '2026-08-17', name: 'Liberation Day (obs.)' },
    { date: '2026-09-24', name: 'Chuseok (víspera)' },
    { date: '2026-09-25', name: 'Chuseok' },
    { date: '2026-10-05', name: 'National Foundation (obs.)' },
    { date: '2026-10-09', name: 'Hangul Day' },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-31', name: 'Cierre fin de año' },
    // 2027 (subset)
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-02-08', name: 'Lunar New Year (víspera)' },
    { date: '2027-02-09', name: 'Lunar New Year' },
    { date: '2027-03-01', name: 'Independence Movement' },
    { date: '2027-05-05', name: "Children's Day" },
    { date: '2027-12-31', name: 'Cierre fin de año' },
  ],

  HKEX: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-02-16', name: 'Lunar New Year (víspera)', early: true },
    { date: '2026-02-17', name: 'Lunar New Year' },
    { date: '2026-02-18', name: 'Lunar New Year (2º día)' },
    { date: '2026-02-19', name: 'Lunar New Year (3er día)' },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-04-04', name: 'Día después Viernes Santo' },
    { date: '2026-04-06', name: 'Ching Ming / Lunes Pascua' },
    { date: '2026-04-07', name: 'Día después Lunes Pascua' },
    { date: '2026-05-01', name: 'Labor Day' },
    { date: '2026-05-25', name: "Buddha's Birthday" },
    { date: '2026-06-19', name: 'Tuen Ng (Dragon Boat)' },
    { date: '2026-07-01', name: 'HKSAR Establishment Day' },
    { date: '2026-09-25', name: 'Víspera Mid-Autumn', early: true },
    { date: '2026-09-26', name: 'Día después Mid-Autumn' },
    { date: '2026-10-01', name: 'National Day' },
    { date: '2026-10-19', name: 'Chung Yeung' },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-26', name: 'San Esteban (obs. lun)' },
    { date: '2026-12-31', name: 'Nochevieja', early: true },
    // 2027 (subset)
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-02-08', name: 'Lunar New Year' },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-05-01', name: 'Labor Day' },
    { date: '2027-07-01', name: 'HKSAR Establishment Day' },
    { date: '2027-10-01', name: 'National Day' },
    { date: '2027-12-24', name: 'Nochebuena', early: true },
    { date: '2027-12-31', name: 'Nochevieja', early: true },
  ],

  TSX: [
    // 2026
    { date: '2026-01-01', name: "Año Nuevo" },
    { date: '2026-02-16', name: 'Family Day' },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-05-18', name: 'Victoria Day' },
    { date: '2026-07-01', name: 'Canada Day' },
    { date: '2026-08-03', name: 'Civic Holiday' },
    { date: '2026-09-07', name: 'Labour Day' },
    { date: '2026-10-12', name: 'Thanksgiving (CA)' },
    { date: '2026-12-24', name: 'Nochebuena', early: true },
    { date: '2026-12-25', name: 'Navidad' },
    { date: '2026-12-28', name: 'Boxing Day (obs.)' },
    // 2027
    { date: '2027-01-01', name: "Año Nuevo" },
    { date: '2027-02-15', name: 'Family Day' },
    { date: '2027-03-26', name: 'Viernes Santo' },
    { date: '2027-05-24', name: 'Victoria Day' },
    { date: '2027-07-01', name: 'Canada Day' },
  ],
}

// Helper: devuelve festivos en un rango de fechas dado
export function getHolidaysInRange(startDateStr, endDateStr, enabledMarkets) {
  const enabled = enabledMarkets instanceof Set
    ? enabledMarkets
    : new Set(enabledMarkets || Object.keys(MARKETS))
  const result = []
  for (const [market, list] of Object.entries(MARKET_HOLIDAYS)) {
    if (!enabled.has(market)) continue
    for (const h of list) {
      if (h.date >= startDateStr && h.date <= endDateStr) {
        result.push({ ...h, market })
      }
    }
  }
  return result
}

// Helper: devuelve los festivos de un día concreto agrupados por mercado
export function getHolidaysOnDate(dateStr, enabledMarkets) {
  const enabled = enabledMarkets instanceof Set
    ? enabledMarkets
    : new Set(enabledMarkets || Object.keys(MARKETS))
  const result = []
  for (const [market, list] of Object.entries(MARKET_HOLIDAYS)) {
    if (!enabled.has(market)) continue
    for (const h of list) {
      if (h.date === dateStr) result.push({ ...h, market })
    }
  }
  return result
}
