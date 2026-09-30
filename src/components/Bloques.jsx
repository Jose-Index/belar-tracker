// Panel de bloques (Cartera v3, 30/09/2026): pesos reales frente a objetivo.
// Donut = pesos reales; anillo interior fino = objetivo. Tabla con desvío en puntos,
// $ que faltan o sobran para volver al objetivo y semáforo (>5 pp rojo, >3 ámbar).
import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { pesosBloques, DESVIO_ROJO, DESVIO_AMBAR } from '../lib/bloques'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%'
const fmtPP = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1)
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export default function Bloques({ positions, liquidez, objetivos, wallet, onBloque }) {
  const w = useMemo(() => pesosBloques(positions, liquidez, objetivos, wallet), [positions, liquidez, objetivos, wallet])
  const datosReal = w.todas.map(f => ({ name: f.corto, value: Math.max(0, f.real || 0), color: f.color, f }))
  const datosObj = w.todas.map(f => ({ name: f.corto, value: f.objetivo, color: f.color, f }))
  const fuera = w.todas.filter(f => f.semaforo === 'rojo')

  return (
    <div className="card bloques num">
      <div className="bloques-head">
        <h2>Bloques <span className="hist-n">pesos reales frente a objetivo · base ${fmt$(w.base)} (posiciones + liquidez{w.walletUsd ? ' + ₿ wallet' : ''})</span></h2>
        {fuera.length
          ? <span className="bloques-aviso rojo" title={`Regla §7.3: un bloque a más de ${DESVIO_ROJO} puntos de su objetivo no recibe entradas nuevas hasta volver al rango.`}>
              ● fuera de rango: {fuera.map(f => f.corto).join(' · ')}
            </span>
          : <span className="bloques-aviso ok">● todos los bloques dentro de ±{DESVIO_ROJO} pp</span>}
      </div>

      <div className="bloques-cuerpo">
        <div className="bloques-donut">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={datosObj} dataKey="value" nameKey="name" cx="50%" cy="50%"
                   innerRadius={54} outerRadius={64} stroke="none" isAnimationActive={false} startAngle={90} endAngle={-270}>
                {datosObj.map((d, i) => <Cell key={i} fill={d.color} opacity={0.35} />)}
              </Pie>
              <Pie data={datosReal} dataKey="value" nameKey="name" cx="50%" cy="50%"
                   innerRadius={68} outerRadius={104} stroke="var(--superficie)" strokeWidth={2} isAnimationActive={false} startAngle={90} endAngle={-270}>
                {datosReal.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<TipBloque />} isAnimationActive={false} />
            </PieChart>
          </ResponsiveContainer>
          <div className="bloques-donut-nota">exterior = real · interior = objetivo</div>
        </div>

        <table className="tabla-bloques">
          <thead>
            <tr>
              <th className="tl">BLOQUE</th>
              <th title="Posiciones abiertas en el bloque">N</th>
              <th title="Valor actual del bloque (USD)">VALOR</th>
              <th title="G/P abierto del bloque">G/P</th>
              <th title="Peso real sobre posiciones + liquidez + wallet BTC">REAL</th>
              <th title="Peso objetivo (Cartera v3)">OBJ.</th>
              <th title={`Desvío en puntos porcentuales. Rojo >${DESVIO_ROJO} pp (sin entradas nuevas hasta volver al rango), ámbar >${DESVIO_AMBAR} pp.`}>DESVÍO</th>
              <th title="Dólares que faltan (+) o sobran (−) para estar en el objetivo">$ AL OBJ.</th>
            </tr>
          </thead>
          <tbody>
            {w.todas.map(f => (
              <tr key={f.id} className={'sem-' + f.semaforo + (onBloque && f.id !== 'CAJA' ? ' clic' : '')}
                  title={f.ayuda} onClick={() => onBloque && f.id !== 'CAJA' && onBloque(f.id)}>
                <td className="tl"><i className="bq-dot" style={{ background: f.color }} />{f.label}{f.wallet ? <span className="bq-wallet" title="Incluye la wallet BTC personal, valorada a precio de mercado (sin coste conocido: no entra en el G/P)"> · incl. ₿ wallet ${fmt$(f.wallet)}</span> : null}</td>
                <td>{f.id === 'CAJA' ? '' : f.n}</td>
                <td>${fmt$(f.valor)}</td>
                <td className={pctClass(f.gp)} title={f.wallet ? 'G/P de las posiciones de bróker; la wallet no tiene coste registrado' : ''}>{f.id === 'CAJA' ? '' : fmtPct(f.gpPct)}</td>
                <td className="real">{f.real == null ? '—' : f.real.toFixed(1) + '%'}</td>
                <td className="obj">{f.objetivo}%</td>
                <td className={'desvio ' + f.semaforo}>{fmtPP(f.desvio)}</td>
                <td className="usd">{f.usd == null ? '—' : (f.usd > 0 ? '+' : '−') + '$' + fmt$(Math.abs(f.usd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TipBloque({ active, payload }) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload.f
  return (
    <div className="tip-evo num">
      <div><span style={{ color: f.color }}>●</span> {f.label}</div>
      <b>{f.real == null ? '—' : f.real.toFixed(1) + '%'} real · {f.objetivo}% objetivo</b>
      <div>${fmt$(f.valor)}{f.id !== 'CAJA' ? ` · ${f.n} posiciones` : ''}</div>
    </div>
  )
}
