'use client'
import { fmtU, fmtP, clr } from '@/lib/utils'

interface Position {
  ticker: string; broker: string; entry: string; inv: number; val: number
  cl: string; notes: string; spark: number[]
}

const BROKER_COLORS: Record<string,string> = { eToro:'#2EA543', XTB:'#E4002B', IBKR:'#FF6600' }
const CL_MAP: Record<string,{label:string,bg:string,color:string}> = {
  nucleo:   { label:'NÚCLEO',     bg:'rgba(46,204,138,.15)',  color:'#2ecc8a' },
  momentum: { label:'MO MEN TUM', bg:'rgba(74,143,212,.15)',  color:'#4a8fd4' },
  tactica:  { label:'TÁCTICA',    bg:'rgba(232,160,48,.15)',  color:'#e8a030' },
  vigilar:  { label:'VIGILAR!',   bg:'rgba(224,85,85,.15)',   color:'#e05555' },
}

function Sparkline({ data, gp }: { data: number[], gp: number }) {
  if (data.length < 2) return null
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
  const W = 90, H = 22, n = data.length
  const x = (j: number) => (j / (n-1) * W).toFixed(1)
  const y = (v: number) => (H - 2 - (v - mn) / rng * (H - 5)).toFixed(1)
  const pts = data.map((v, j) => `${x(j)},${y(v)}`).join(' ')
  const lc = gp >= 0 ? '#2ecc8a' : '#e05555'
  const fc = gp >= 0 ? 'rgba(46,204,138,.08)' : 'rgba(224,85,85,.08)'
  const ab = (H - 2).toFixed(1)
  const apts = `${x(0)},${ab} ${pts} ${x(n-1)},${ab}`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polygon points={apts} fill={fc} />
      <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function Posiciones({ positions }: { positions: Position[] }) {
  const TH = { padding:'6px 8px', fontSize:10, color:'#727a87', textTransform:'uppercase' as const, letterSpacing:'.07em', borderBottom:'1px solid #2f3540', fontWeight:400, whiteSpace:'nowrap' as const, textAlign:'left' as const }
  const TD: React.CSSProperties = { padding:'6px 8px', borderBottom:'1px solid #1e2228', fontSize:11, verticalAlign:'middle' }

  return (
    <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, overflowX:'auto', marginBottom:'1rem' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {['Activo','Plat.','Entrada','Invertido','Valor','G/P $','G/P %','Clase','Notas','Graf.'].map(h =>
              <th key={h} style={TH}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const gp = p.val - p.inv
            const gpPct = p.inv > 0 ? (p.val - p.inv) / p.inv * 100 : 0
            const cl = CL_MAP[p.cl] ?? CL_MAP.tactica
            const bc = BROKER_COLORS[p.broker] ?? '#adb5c0'
            const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)'
            return (
              <tr key={p.ticker}>
                <td style={{ ...TD, fontWeight:600, background:rowBg }}>{p.ticker}</td>
                <td style={{ ...TD, color:bc, background:rowBg }}>{p.broker}</td>
                <td style={{ ...TD, background:rowBg }}>{p.entry}</td>
                <td style={{ ...TD, background:rowBg }}>{fmtU(p.inv)}</td>
                <td style={{ ...TD, fontWeight:500, background:rowBg }}>{fmtU(p.val)}</td>
                <td style={{ ...TD, color:clr(gp), background:rowBg }}>{gp >= 0 ? '+' : ''}${Math.abs(gp).toFixed(2)}</td>
                <td style={{ ...TD, color:clr(gpPct), background:rowBg }}>{fmtP(gpPct)}</td>
                <td style={{ ...TD, background:rowBg }}>
                  <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, fontWeight:500, background:cl.bg, color:cl.color, border:`1px solid ${cl.color}44`, whiteSpace:'nowrap' }}>
                    {cl.label}
                  </span>
                </td>
                <td style={{ ...TD, fontSize:10, color:'#adb5c0', maxWidth:160, background:rowBg }}>{p.notes}</td>
                <td style={{ padding:'4px 8px', borderBottom:'1px solid #1e2228', verticalAlign:'middle', background:rowBg }}>
                  <Sparkline data={p.spark} gp={gp} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
