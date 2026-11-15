// BTP v4 · Portada (15/11/2026): solo posiciones, con el diseño A ("Suizo") que eligió José.
// Agrupa por tesis, bróker o sin agrupar; ordena por rendimiento, fecha o valor; al pulsar una posición o un
// grupo abre su ficha con la gráfica en % y, como mucho, UN comparador. Al pie, los próximos 14 días.
// Es de solo lectura: el cierre de semana, las altas, las capturas y la edición de niveles siguen en /gestion.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCache } from '../lib/cache'
import { fetchPosiciones, fetchSnapsBloques, fetchCierresBloques } from '../lib/posiciones-db'
import { getSimbolos, yahooDe, fetchQuotes, fetchHistory } from '../lib/quotes'
import { eventosProximos } from '../lib/ia'
import { BLOQUES, BLOQUE_DE_ID, bloqueDe, esPuente, pesosBloques, serieTWRBloques } from '../lib/bloques'
import './portada.css'

const BROKERS = { etoro: 'eToro', xtb: 'XTB', ibkr: 'IBKR' }
const COMPARADORES = [['', 'Ninguno'], ['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['GC=F', 'Oro'], ['^IBEX', 'Ibex 35'], ['^STOXX50E', 'Euro Stoxx 50'], ['BTC-USD', 'Bitcoin']]
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIA = 86400000

const num = (v, d = 0) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const sig = v => (v > 0 ? '+' : v < 0 ? '−' : '')
const usd = v => (v == null ? '—' : num(v) + ' $')
const gpd = v => (v == null ? '—' : sig(v) + num(Math.abs(v)) + ' $')
const pct = v => (v == null || !Number.isFinite(v) ? '—' : sig(v) + num(Math.abs(v), 1) + ' %')
const tono = v => (v > 0 ? 'pt-sube' : v < 0 ? 'pt-baja' : '')
const fecha = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—')
const suma = (xs, k) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0)

const Chips = ({ items, valor, onPick, etiqueta }) => (
  <div className="pt-chips" role="group" aria-label={etiqueta}>
    {items.map(([id, label]) => <button key={id} type="button" className={'pt-chip' + (id === valor ? ' on' : '')} aria-pressed={id === valor} onClick={() => onPick(id)}>{label}</button>)}
  </div>
)

async function loaderPortada() {
  const [pos, simbolos, eventos, snaps, cierres, st] = await Promise.all([
    fetchPosiciones(), getSimbolos(), eventosProximos(), fetchSnapsBloques().catch(() => []), fetchCierresBloques().catch(() => []),
    supabase.from('app_state').select('key,value').in('key', ['belar_diario', 'bloques_objetivo']),
  ])
  const estado = Object.fromEntries((st.data || []).map(r => [r.key, r.value]))
  return { ...pos, simbolos, eventos, snaps, cierres, diario: estado.belar_diario || null, objetivos: estado.bloques_objetivo || null }
}

// Nivel más cercano (stop u objetivo). Si la pasada diaria de Belar midió la posición (app_state.belar_diario.niveles:
// distancia al SL y al TP en % y en ATR, al último cierre), manda ese dato. Si no, se estima en % con la última captura.
function nivelDe(p, n) {
  if (n && (n.sl || n.tp)) {
    const ds = [n.sl ? { nom: 'Stop', atr: n.sl[1] } : null, n.tp ? { nom: 'Objetivo', atr: n.tp[1] } : null].filter(Boolean).sort((a, b) => a.atr - b.atr)
    const m = ds[0]
    return m.atr <= 0 ? { txt: m.nom + ' tocado', aviso: true } : { txt: m.nom + ' a ' + num(m.atr, 1) + ' ATR', aviso: m.atr <= 1 }
  }
  const e = Number(p.entry_price), sl = Number(p.sl_price), tp = Number(p.tp_price), inv = Number(p.invested), val = Number(p.current_value ?? p.invested)
  if (!(e > 0) || !(inv > 0) || Number(p.apalancamiento || 1) !== 1) return { txt: sl > 0 || tp > 0 ? 'Nivel puesto' : 'Sin nivel', aviso: false }
  const px = e * val / inv
  const ds = [sl > 0 ? { nom: 'Stop', d: (px - sl) / px * 100 } : null, tp > 0 ? { nom: 'Objetivo', d: (tp - px) / px * 100 } : null].filter(Boolean).sort((a, b) => a.d - b.d)
  if (!ds.length) return { txt: 'Sin nivel', aviso: false }
  return ds[0].d <= 0 ? { txt: ds[0].nom + ' tocado', aviso: true } : { txt: ds[0].nom + ' a ' + num(ds[0].d, 1) + ' %', aviso: ds[0].d <= 3 }
}

export default function Portada() {
  const { data, error } = useCache('portada', loaderPortada, { ttl: 60e3, persist: true })
  const { data: qBtc } = useCache('quotes:BTC-USD', () => fetchQuotes(['BTC-USD']), { ttl: 5 * 60e3, persist: true })
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('btp-portada') || '{}') } catch { return {} } })()
  const [agrupar, setAgrupar] = useState(guardado.agrupar || 'tesis')
  const [orden, setOrden] = useState(guardado.orden || 'rend')
  const [sel, setSel] = useState('')
  const [comp, setComp] = useState(guardado.comp || '')
  const [per, setPer] = useState('')
  useEffect(() => { try { localStorage.setItem('btp-portada', JSON.stringify({ agrupar, orden, comp })) } catch { /* sin almacenamiento */ } }, [agrupar, orden, comp])
  const abrir = id => { setSel(s => (s === id ? '' : id)); setPer('') }

  const v = useMemo(() => {
    if (!data) return null
    const P = (data.positions || []).map(p => {
      const inv = Number(p.invested) || 0, val = Number(p.current_value ?? p.invested) || 0
      const n = (data.diario?.niveles || []).find(x => x.t === p.ticker && x.br === p.broker)
      return { ...p, inv, val, gp: val - inv, gpp: inv ? (val - inv) / inv * 100 : null, te: bloqueDe(p), puente: esPuente(p), niv: nivelDe(p, n), atr: n?.atr ?? null,
        nombre: n?.n || (data.simbolos || []).find(x => x.ticker === p.ticker)?.display_name || '' }
    })
    const cmp = orden === 'rend' ? (a, b) => (b.gpp ?? -1e9) - (a.gpp ?? -1e9) : orden === 'fecha' ? (a, b) => ((a.entry_date || '') < (b.entry_date || '') ? 1 : -1) : (a, b) => b.val - a.val
    const claves = agrupar === 'tesis' ? BLOQUES.map(b => b.id) : agrupar === 'broker' ? Object.keys(BROKERS) : ['']
    const pesos = pesosBloques(data.positions, data.liquidez, data.objetivos, null)
    const grupos = claves.map(k => {
      const ps = P.filter(p => (agrupar === 'tesis' ? p.te === k : agrupar === 'broker' ? p.broker === k : true)).sort(cmp)
      const inv = suma(ps, 'inv'), val = suma(ps, 'val')
      return { k, nombre: agrupar === 'tesis' ? BLOQUE_DE_ID[k].label : BROKERS[k] || '', ps, inv, val, gp: val - inv, gpp: inv ? (val - inv) / inv * 100 : null,
        peso: agrupar === 'tesis' ? pesos.filas.find(f => f.id === k) : null }
    }).filter(g => g.ps.length)
    const caja = Object.values(data.liquidez || {}).reduce((a, x) => a + (Number(x) || 0), 0)
    const w = data.btcWallet || { qty: 0 }, precio = qBtc?.['BTC-USD']?.price || null
    const wallet = w.qty > 0 ? { qty: w.qty, usd: precio ? w.qty * precio : null, inv: w.invertido || null } : null
    const inv = suma(P, 'inv'), val = suma(P, 'val')
    const hoy = new Date(new Date().toISOString().slice(0, 10))
    const cal = (data.eventos || []).map(e => ({ ...e, dias: Math.round((new Date(e.event_date) - hoy) / DIA) })).filter(e => e.dias >= 0 && e.dias <= 14)
    return { P, grupos, caja, wallet, total: val + caja + (wallet?.usd || 0), abierto: inv ? (val - inv) / inv * 100 : null, cal, cierre: data.lastClose?.date || null }
  }, [data, agrupar, orden, qBtc])

  const seriesTesis = useMemo(() => (data ? serieTWRBloques(data.snaps, data.positions || [], data.cierres || []) : {}), [data])

  if (!v) return <div className="pt"><p className="pt-estado">{error ? 'No se han podido cargar las posiciones: ' + String(error?.message || error) : 'Cargando posiciones…'}</p></div>

  const fichaProps = { comp, setComp, per, setPer, simbolos: data.simbolos }

  return (
    <div className="pt num">
      <section className="pt-resumen" aria-label="Resumen">
        <div><div className="pt-rot">Total{v.cierre ? ' · cierre del ' + fecha(v.cierre) : ''}</div><div className="pt-total">{usd(v.total)}</div></div>
        <div><div className="pt-rot">G/P abierto</div><div className={'pt-cifra ' + tono(v.abierto)}>{pct(v.abierto)}</div></div>
        <div><div className="pt-rot">Caja</div><div className="pt-cifra">{usd(v.caja)}</div></div>
        <Link to="/gestion" className="pt-gestion" title="Cierre de semana, altas, capturas y edición de niveles">Gestión</Link>
      </section>

      <section aria-label="Posiciones">
        <div className="pt-controles">
          <div className="pt-control"><span className="pt-mini">Agrupar</span><Chips etiqueta="Agrupar" items={[['tesis', 'Tesis'], ['broker', 'Bróker'], ['nada', 'Sin agrupar']]} valor={agrupar} onPick={x => { setAgrupar(x); setSel('') }} /></div>
          <div className="pt-control"><span className="pt-mini">Ordenar</span><Chips etiqueta="Ordenar" items={[['rend', 'Rendimiento'], ['fecha', 'Fecha'], ['valor', 'Valor']]} valor={orden} onPick={setOrden} /></div>
          <span className="pt-n">{v.P.length} posiciones</span>
        </div>

        <div className="pt-tabla">
          <div className="pt-fila pt-cab" aria-hidden="true">
            <span>Posición</span><span>Bróker</span><span>Entrada</span><span>Nivel más cercano</span><span className="r">Valor</span><span className="r">G/P</span><span className="r">G/P %</span>
          </div>
          {v.grupos.map(g => (
            <div key={g.k || 'todas'} className="pt-grupo">
              {g.k && (
                <button type="button" className="pt-fila pt-gcab" aria-expanded={sel === 'g:' + g.k} onClick={() => abrir('g:' + g.k)}>
                  <span className="pt-gnombre">{g.nombre}</span>
                  <span className="pt-gn">{g.ps.length} {g.ps.length === 1 ? 'posición' : 'posiciones'}</span>
                  <span className="r pt-gval">{usd(g.val)}</span>
                  <span className={'r pt-gval ' + tono(g.gp)}>{gpd(g.gp)}</span>
                  <span className={'r pt-gpp ' + tono(g.gp)}>{pct(g.gpp)}</span>
                </button>
              )}
              {g.k && sel === 'g:' + g.k && <Ficha grupo={g} agrupar={agrupar} serieGrupo={agrupar === 'tesis' ? seriesTesis[g.k] : null} {...fichaProps} />}
              {g.ps.map(p => (
                <div key={p.id}>
                  <button type="button" className="pt-fila pt-pos" aria-expanded={sel === 'p:' + p.id} onClick={() => abrir('p:' + p.id)}>
                    <span className="pt-quien"><b>{p.ticker}</b>{p.nombre && <span className="pt-nombre">{p.nombre}</span>}{p.puente && <i className="pt-puente" title="Tesis Puente: abierta antes de adoptar la regla (30/09/2026)">Puente</i>}</span>
                    <span className="pt-sec pt-br">{BROKERS[p.broker] || p.broker}</span>
                    <span className="pt-sec pt-fe">{fecha(p.entry_date)}</span>
                    <span className={'pt-niv' + (p.niv.aviso ? ' aviso' : '')}>{p.niv.txt}</span>
                    <span className="r pt-val">{usd(p.val)}</span>
                    <span className={'r pt-gp ' + tono(p.gp)}>{gpd(p.gp)}</span>
                    <span className={'r pt-gpp ' + tono(p.gp)}>{pct(p.gpp)}</span>
                  </button>
                  {sel === 'p:' + p.id && <Ficha pos={p} {...fichaProps} />}
                </div>
              ))}
            </div>
          ))}
          {!v.P.length && <p className="pt-estado">Sin posiciones abiertas.</p>}
          {v.wallet && (
            <div className="pt-wallet">
              <span className="pt-gnombre">BTC wallet · fuera de la base</span>
              <span className="pt-sec">{num(v.wallet.qty, 8)} ₿{v.wallet.usd != null ? ' · ' + usd(v.wallet.usd) : ' · sin precio'}{v.wallet.usd != null && v.wallet.inv ? ' · ' + gpd(v.wallet.usd - v.wallet.inv) + ' · ' + pct((v.wallet.usd - v.wallet.inv) / v.wallet.inv * 100) : ''}</span>
            </div>
          )}
        </div>
        <p className="pt-pie">Valores de tu última captura. La distancia al nivel más cercano es la del último cierre, en ATR (lo que el valor se mueve en un día normal), medida por la pasada diaria de Belar.</p>
      </section>

      <section className="pt-cal" aria-label="Próximos 14 días">
        <h2 className="pt-gnombre">Próximos 14 días</h2>
        <div className="pt-cal-lista">
          {v.cal.map(e => (
            <div key={e.id} className="pt-cal-fila">
              <span className="pt-cal-dia">{e.event_date.slice(8, 10)} {MESES[Number(e.event_date.slice(5, 7)) - 1]}</span>
              <span className="pt-cal-tk">{e.ticker || '—'}</span>
              <span className="pt-cal-txt">{e.titulo}{e.confirmacion === 'estimado' && <i className="pt-puente">estimada</i>}</span>
              <span className="pt-sec">{e.dias === 0 ? 'hoy' : e.dias === 1 ? 'mañana' : 'en ' + e.dias + ' días'}</span>
            </div>
          ))}
          {!v.cal.length && <p className="pt-estado">Nada en el calendario para los próximos 14 días.</p>}
        </div>
      </section>
    </div>
  )
}

// ─── Ficha de una posición o de un grupo: gráfica en % y, como mucho, un comparador ───
function Ficha({ pos, grupo, agrupar, serieGrupo, comp, setComp, per, setPer, simbolos }) {
  const y = pos ? yahooDe(pos.ticker, simbolos || []) : null
  const { data: hPos } = useCache('ph:' + y, () => fetchHistory(y, '1yd'), { ttl: 15 * 60e3, activo: !!y })
  const { data: hComp } = useCache('ph:' + comp, () => fetchHistory(comp, '1yd'), { ttl: 15 * 60e3, activo: !!comp })
  const periodos = pos ? [['ent', 'Entrada'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1a', '1A']] : [['1m', '1M'], ['3m', '3M'], ['todo', 'Todo']]
  const p = per || (pos ? 'ent' : 'todo')

  const g = useMemo(() => {
    // Serie propia: [{ t (ms), v }] con v = nivel (precio, o 1 + rentabilidad acumulada del grupo)
    const base = pos ? (hPos?.points || []).filter(x => x.v != null).map(x => ({ t: x.t, v: x.v }))
      : (serieGrupo || []).map(x => ({ t: new Date(x.fecha).getTime(), v: 1 + x.pct / 100 }))
    if (base.length < 2) return null
    const fin = base[base.length - 1].t
    const corte = p === 'ent' && pos?.entry_date ? new Date(pos.entry_date).getTime() : p === '1m' ? fin - 31 * DIA : p === '3m' ? fin - 92 * DIA : p === '6m' ? fin - 183 * DIA : 0
    let i0 = base.findIndex(x => x.t >= corte); if (i0 < 0 || i0 > base.length - 2) i0 = base.length - 2
    const mia = base.slice(i0).map(x => ({ t: x.t, v: (x.v / base[i0].v - 1) * 100 }))
    let otra = []
    const c = comp ? (hComp?.points || []).filter(x => x.v != null) : []
    if (c.length) {
      let j = 0
      const en = t => { while (j + 1 < c.length && c[j + 1].t <= t + DIA / 2) j++; return c[j].v }
      const c0 = en(mia[0].t)
      otra = mia.map(x => ({ t: x.t, v: (en(x.t) / c0 - 1) * 100 }))
    }
    const todo = mia.map(x => x.v).concat(otra.map(x => x.v), [0]), mn = Math.min(...todo), mx = Math.max(...todo), alto = (mx - mn) || 1
    const yy = v => (168 - (v - mn) / alto * 156).toFixed(1), xx = k => (k / (mia.length - 1) * 640).toFixed(1)
    const puntos = s => s.map((x, k) => xx(k) + ',' + yy(x.v)).join(' ')
    const iso = t => new Date(t).toISOString().slice(0, 10)
    return { linea: puntos(mia), lineaComp: puntos(otra), y0: yy(0), fin: mia[mia.length - 1].v, finComp: otra.length ? otra[otra.length - 1].v : null, desde: fecha(iso(mia[0].t)), hasta: fecha(iso(fin)) }
  }, [pos, hPos, hComp, serieGrupo, comp, p])

  const x = pos || grupo
  const det = pos
    ? [['Valor', usd(pos.val)], ['Invertido', usd(pos.inv)], ['G/P', gpd(pos.gp) + ' · ' + pct(pos.gpp)], ['Entrada', fecha(pos.entry_date) + ' · ' + (BROKERS[pos.broker] || pos.broker)],
        ['Precio de entrada', pos.entry_price ? num(pos.entry_price, 2) : '—'], ['Stop', pos.sl_price ? num(pos.sl_price, 2) : 'Sin stop'], ...(pos.atr != null ? [['ATR de 14 sesiones', num(pos.atr, 1) + ' %']] : []), ['Objetivo', pos.tp_price ? num(pos.tp_price, 2) : 'Sin objetivo'],
        ['Tesis', BLOQUE_DE_ID[pos.te]?.label || '—'], ['Origen', pos.fuente === 'GURU' ? 'GURÚ' : pos.fuente || '—']]
    : [['Valor', usd(x.val)], ['Invertido', usd(x.inv)], ['G/P', gpd(x.gp) + ' · ' + pct(x.gpp)], ['Posiciones', String(x.ps.length)],
        ...(x.peso ? [['Peso', num(x.peso.real, 1) + ' % · objetivo ' + num(x.peso.objetivo) + ' %']] : [])]
  const sinSerie = pos ? !y : agrupar !== 'tesis'
  const nombreComp = (COMPARADORES.find(q => q[0] === comp) || ['', ''])[1]

  return (
    <div className="pt-ficha">
      <div className="pt-ficha-graf">
        <div className="pt-ficha-cab">
          <div className="pt-leyenda">
            <span><i className="pt-cuadro mia" />{pos ? pos.ticker : grupo.nombre} {g && <b className={tono(g.fin)}>{pct(g.fin)}</b>}</span>
            {g && g.finComp != null && <span><i className="pt-cuadro otra" />{nombreComp} <b className={tono(g.finComp)}>{pct(g.finComp)}</b></span>}
          </div>
          <div className="pt-chips" role="group" aria-label="Periodo">
            {periodos.map(([id, label]) => <button key={id} type="button" className={'pt-chip pq' + (id === p ? ' on' : '')} aria-pressed={id === p} onClick={() => setPer(id)}>{label}</button>)}
          </div>
        </div>
        {g ? (
          <>
            <svg viewBox="0 0 640 180" preserveAspectRatio="none" role="img" aria-label="Evolución en porcentaje durante el periodo" className="pt-svg">
              <line x1="0" x2="640" y1={g.y0} y2={g.y0} className="cero" />
              <polyline points={g.lineaComp} className="otra" />
              <polyline points={g.linea} className="mia" />
            </svg>
            <div className="pt-ejes"><span>{g.desde}</span><span>{g.hasta}</span></div>
          </>
        ) : (
          <p className="pt-sec pt-sin">{sinSerie
            ? (pos ? 'Sin precio de mercado: un copy trader se sigue con los cierres de semana.' : 'La evolución por bróker llegará con la página Rendimiento.')
            : 'Cargando la gráfica…'}</p>
        )}
        <div className="pt-control">
          <span className="pt-mini">Comparar con</span>
          <div className="pt-chips envuelve" role="group" aria-label="Comparar con">
            {COMPARADORES.map(([id, label]) => <button key={id} type="button" className={'pt-chip pq' + (id === comp ? ' on' : '')} aria-pressed={id === comp} onClick={() => setComp(id)}>{label}</button>)}
          </div>
        </div>
        <p className="pt-pie">{pos ? 'Precio de mercado en % desde el inicio del periodo (cierre diario).' : 'Rentabilidad del grupo por cierres de semana, sin contar las entradas ni las salidas de dinero.'}</p>
      </div>
      <dl className="pt-det">
        {det.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
        {pos && <Link to="/gestion" className="pt-enlace">Editar en Gestión</Link>}
      </dl>
    </div>
  )
}
