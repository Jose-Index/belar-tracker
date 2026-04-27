'use client'
import { useState } from 'react'

// =============================================================================
// FUENTES BELAR
// Organizadas por periodicidad de lectura y especificidad temática.
// Cada fuente apunta directamente a la sección útil, no a la home genérica.
// Favicons servidos por Google: /s2/favicons?domain=DOMAIN&sz=64
// =============================================================================

const SOURCES = {
  daily: {
    title: 'Diaria',
    subtitle: '15-20 min/mañana',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    items: [
      { name: 'Bloomberg Markets', domain: 'bloomberg.com', url: 'https://www.bloomberg.com/markets', tag: 'gratis', desc: 'Estándar institucional. Cobertura macro y mercados en tiempo real.' },
      { name: 'Reuters Markets', domain: 'reuters.com', url: 'https://www.reuters.com/markets/', tag: 'gratis', desc: 'Agencia primaria. La más rápida en breaking news financieras.' },
      { name: 'Stockanalysis', domain: 'stockanalysis.com', url: 'https://stockanalysis.com/', tag: 'gratis', desc: 'Datos limpios, fundamentales, consensus targets. Tu fuente habitual.' },
      { name: 'TipRanks', domain: 'tipranks.com', url: 'https://www.tipranks.com/', tag: 'freemium', desc: 'Upgrades/downgrades de analistas + insider trading rápido.' },
      { name: 'Investing Calendar', domain: 'investing.com', url: 'https://www.investing.com/economic-calendar/', tag: 'gratis', desc: 'Calendario económico + earnings + dividendos.' },
    ],
  },
  weekly: {
    title: 'Semanal',
    subtitle: '1-2 horas',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    items: [
      { name: 'Financial Times', domain: 'ft.com', url: 'https://www.ft.com/markets', tag: 'pago', desc: 'Profundidad europea + global. Lex Column de referencia.' },
      { name: 'Wall Street Journal', domain: 'wsj.com', url: 'https://www.wsj.com/news/markets', tag: 'pago', desc: 'Cobertura US imprescindible. Heard on the Street es lectura obligada.' },
      { name: 'The Economist — Finance', domain: 'economist.com', url: 'https://www.economist.com/finance-and-economics', tag: 'pago', desc: 'Marco macro con perspectiva. No tips, sí contexto que las decisiones requieren.' },
      { name: 'Stratechery (Ben Thompson)', domain: 'stratechery.com', url: 'https://stratechery.com/', tag: 'pago', desc: 'Análisis estratégico tech. Lo mejor en su categoría.' },
      { name: 'Seeking Alpha', domain: 'seekingalpha.com', url: 'https://seekingalpha.com/', tag: 'freemium', desc: 'Tesis fundamentales largas. Filtra por autores con track record verificable.' },
    ],
  },
  monthly: {
    title: 'Mensual',
    subtitle: '4-5 ensayos densos',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    items: [
      { name: 'The Diff (Byrne Hobart)', domain: 'thediff.co', url: 'https://www.thediff.co/', tag: 'pago', desc: 'Macro y empresas con criterio contrarian. Calidad altísima.' },
      { name: 'Net Interest (Marc Rubinstein)', domain: 'netinterest.co', url: 'https://www.netinterest.co/', tag: 'pago', desc: 'Banca y servicios financieros. Profundidad sectorial real.' },
      { name: 'Doomberg', domain: 'doomberg.io', url: 'https://newsletter.doomberg.io/', tag: 'pago', desc: 'Energía y materias primas. Mirada técnica y geopolítica.' },
    ],
  },
  bitcoin: {
    title: 'Bitcoin',
    subtitle: 'VBTC.DE + wallet',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9V8z"/><path d="M9 13h5a2.5 2.5 0 0 1 0 5H9v-5z"/></svg>,
    items: [
      { name: 'Bitcoin Magazine', domain: 'bitcoinmagazine.com', url: 'https://bitcoinmagazine.com/', tag: 'gratis', desc: 'Cobertura BTC desde dentro de la comunidad.' },
      { name: 'Glassnode Insights', domain: 'insights.glassnode.com', url: 'https://insights.glassnode.com/', tag: 'freemium', desc: 'Datos on-chain. Métricas que el mercado no ve.' },
      { name: 'Un Podcast sobre Bitcoin (Alberto Mera)', domain: 'open.spotify.com', url: 'https://open.spotify.com/show/7g0vrYqYz0gyvLIGdJpkka', tag: 'gratis', desc: 'Rigor técnico con criterio crítico. Referencia en español.' },
    ],
  },
  aiSemis: {
    title: 'AI / Semis',
    subtitle: 'NVDA · MU · ORCL · CW',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/></svg>,
    items: [
      { name: 'Stratechery', domain: 'stratechery.com', url: 'https://stratechery.com/category/articles/', tag: 'pago', desc: 'Análisis estratégico tech. Reuso del semanal, también aplica aquí.' },
      { name: 'Semianalysis (Dylan Patel)', domain: 'semianalysis.com', url: 'https://www.semianalysis.com/', tag: 'freemium', desc: 'Análisis técnico de semis y AI hardware. Datos que nadie más publica.' },
      { name: 'The Information', domain: 'theinformation.com', url: 'https://www.theinformation.com/', tag: 'pago', desc: 'Reportajes profundos sobre tech. Scoops antes que nadie.' },
    ],
  },
  defense: {
    title: 'Defense / Aerospace',
    subtitle: 'HEICO · CW · RKLB',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    items: [
      { name: 'Breaking Defense', domain: 'breakingdefense.com', url: 'https://breakingdefense.com/', tag: 'gratis', desc: 'Cobertura especializada de defensa US.' },
      { name: 'Aviation Week', domain: 'aviationweek.com', url: 'https://aviationweek.com/', tag: 'freemium', desc: 'Aerospace específicamente. Programas, contratos, OEMs.' },
    ],
  },
  gold: {
    title: 'Oro y materiales',
    subtitle: 'IAU · NÚCLEO',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    items: [
      { name: 'Kitco News', domain: 'kitco.com', url: 'https://www.kitco.com/news/', tag: 'gratis', desc: 'Cobertura primaria de metales preciosos.' },
      { name: 'World Gold Council', domain: 'gold.org', url: 'https://www.gold.org/goldhub', tag: 'gratis', desc: 'Datos institucionales. Demanda, reservas, ETFs.' },
    ],
  },
  asia: {
    title: 'Asia',
    subtitle: '9984.T · CSKR.UK · SMSN.UK',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    items: [
      { name: 'Nikkei Asia', domain: 'asia.nikkei.com', url: 'https://asia.nikkei.com/', tag: 'pago', desc: 'Japón y Asia: SoftBank, Toyota, Sony, semis coreanos.' },
      { name: 'Korea Herald — Business', domain: 'koreaherald.com', url: 'https://www.koreaherald.com/business/', tag: 'gratis', desc: 'Samsung y SK Hynix antes que nadie. Earnings asiáticos.' },
      { name: 'Reuters Asia', domain: 'reuters.com', url: 'https://www.reuters.com/world/asia-pacific/', tag: 'gratis', desc: 'Cobertura macro asiática + breaking news.' },
    ],
  },
  spain: {
    title: 'Prensa española',
    subtitle: 'IBEX y empresas locales',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    items: [
      { name: 'Expansión', domain: 'expansion.com', url: 'https://www.expansion.com/mercados.html', tag: 'freemium', desc: 'Selectivo: IBEX, ACS, PUIG, DIA. Resultados trimestrales.' },
      { name: 'Cinco Días', domain: 'cincodias.elpais.com', url: 'https://cincodias.elpais.com/', tag: 'freemium', desc: 'Selectivo: macro España, regulación CNMV, empresas IBEX.' },
      { name: 'El Confidencial — Cotizalia', domain: 'elconfidencial.com', url: 'https://www.elconfidencial.com/mercados/', tag: 'gratis', desc: 'Scoops M&A y movimientos corporativos en España.' },
    ],
  },
}

// Plan ordenado de bloques: diaria primero (la que más se usa), luego semanal, mensual, y específicas.
const SECTION_ORDER = ['daily', 'weekly', 'monthly', 'bitcoin', 'aiSemis', 'defense', 'gold', 'asia', 'spain']

// Por defecto, solo la diaria abierta (asumiendo apertura matutina del tracker).
const DEFAULT_OPEN = ['daily']

const TAG_STYLES = {
  gratis: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pago: 'bg-amber-50 text-amber-700 border-amber-200',
  freemium: 'bg-sky-50 text-sky-700 border-sky-200',
}

function Favicon({ domain }) {
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      className="rounded-sm flex-shrink-0"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
    />
  )
}

function SourceCard({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition-all"
    >
      <Favicon domain={item.domain} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-[13px] text-slate-800 group-hover:text-slate-900 truncate">{item.name}</span>
          <span className={`text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${TAG_STYLES[item.tag] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {item.tag}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">{item.desc}</p>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-slate-600 mt-1 flex-shrink-0">
        <path d="M7 17L17 7"/><polyline points="7 7 17 7 17 17"/>
      </svg>
    </a>
  )
}

function Section({ id, data, open, onToggle }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-500">{data.icon}</span>
          <div className="text-left">
            <div className="text-[13px] font-semibold text-slate-800 tracking-wide uppercase">{data.title}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{data.subtitle} · {data.items.length} fuentes</div>
          </div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-50/30">
          {data.items.map((item, i) => (
            <SourceCard key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function SourcesPanel() {
  const [openIds, setOpenIds] = useState(new Set(DEFAULT_OPEN))

  const toggle = (id) => {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpenIds(new Set(SECTION_ORDER))
  const collapseAll = () => setOpenIds(new Set())

  const totalSources = SECTION_ORDER.reduce((sum, id) => sum + SOURCES[id].items.length, 0)

  return (
    <div className="space-y-4">
      {/* Header con título y controles */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="section-title !mb-1">Fuentes</div>
            <p className="text-[11px] text-slate-500">
              {totalSources} fuentes organizadas por periodicidad y tesis activa de cartera.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-[10px] uppercase tracking-wider font-mono text-slate-500 hover:text-slate-800 px-2.5 py-1 border border-slate-200 rounded hover:border-slate-400 transition-colors">
              Expandir todo
            </button>
            <button onClick={collapseAll} className="text-[10px] uppercase tracking-wider font-mono text-slate-500 hover:text-slate-800 px-2.5 py-1 border border-slate-200 rounded hover:border-slate-400 transition-colors">
              Colapsar
            </button>
          </div>
        </div>
      </div>

      {/* Tip auto-traducción Safari */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-50/40 rounded-xl border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <div className="text-amber-700 flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>
            </svg>
          </div>
          <div className="flex-1 text-[11px] text-slate-700 leading-relaxed">
            <div className="font-semibold text-slate-800 mb-1 text-[12px]">Setup auto-traducción Safari (una sola vez por dominio)</div>
            <p className="text-slate-600">
              1. Abre la fuente en Safari · 2. Toca <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">aA</span> en la barra de direcciones · 3. <span className="font-semibold">Traducir al español</span> → primera vez: <span className="font-semibold">Activar traducción</span> · 4. Vuelve a tocar <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">aA</span> → <span className="font-semibold">Traducir siempre desde inglés</span>. A partir de ahí: cero fricción en ese dominio.
            </p>
          </div>
        </div>
      </div>

      {/* Bloques colapsables */}
      <div className="space-y-2.5">
        {SECTION_ORDER.map(id => (
          <Section
            key={id}
            id={id}
            data={SOURCES[id]}
            open={openIds.has(id)}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  )
}

export default SourcesPanel
