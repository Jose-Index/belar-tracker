'use client'
import type { Snap } from '@/lib/supabase'
import { fmtU, fmtE, fmtP, clr, todayStr } from '@/lib/utils'

interface WbPoint { d: string; e: number; x: number; i: number; bu: number }
interface Props {
  wbAll: WbPoint[]
  snap: Snap
  btcVal: number
  eurUsd: number
}

const EUR_MAP: Record<string,number> = {
  '06/04/24':1.085,'28/12/24':1.042,'15/02/25':1.048,'05/04/25':1.095,
  '28/06/25':1.115,'20/09/25':1.108,'03/01/26':1.048,'07/02/26':1.033,
  '28/02/26':1.051,'14/03/26':1.145,'21/03/26':1.146
}

function getEur(d: string, live: number): number {
  const pa = d.split('/'), ms = new Date(+('20'+pa[2]),+pa[1]-1,+pa[0]).getTime()
  const today = new Date(); today.setHours(0,0,0,0)
  if (Math.abs(ms - today.getTime()) < 7 * 86400000) return live
  let best = Object.keys(EUR_MAP)[0], bestD = 1e15
  Object.keys(EUR_MAP).forEach(k => {
    const pk = k.split('/'), km = new Date(+('20'+pk[2]),+pk[1]-1,+pk[0]).getTime()
    const diff = Math.abs(ms - km); if (diff < bestD) { bestD = diff; best = k }
  })
  return EUR_MAP[best] ?? 1.09
}

const TH: React.CSSProperties = { padding:'6px 8px', fontSize:10, color:'#727a87', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid #2f3540', fontWeight:400, textAlign:'left', whiteSpace:'nowrap', background:'#13161a' }
const TD: React.CSSProperties = { padding:'6px 8px', borderBottom:'1px solid #1e2228', fontSize:11, verticalAlign:'middle' }

export default function Weekly({ wbAll, snap, btcVal, eurUsd }: Props) {
  const today = todayStr()
  const liveRow: WbPoint = { d: today, e: snap.etoro, x: snap.xtb, i: snap.ibkr, bu: btcVal }
  const rows = [liveRow, ...[...wbAll].reverse()]

  return (
    <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, overflowX:'auto', marginBottom:'1rem' }}>
      <div style={{ maxHeight:360, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Fecha</th>
              <th style={{ ...TH, color:'#2EA543' }}>eToro</th>
              <th style={{ ...TH, color:'#E4002B' }}>XTB</th>
              <th style={{ ...TH, color:'#FF6600' }}>IBKR</th>
              <th style={{ ...TH, color:'#F7931A' }}>BTC $</th>
              <th style={{ ...TH, color:'#4ECDC4' }}>Total $</th>
              <th style={{ ...TH, color:'#A78BFA' }}>Total €</th>
              <th style={TH}>Var %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isLive = idx === 0
              const tot = (row.e||0)+(row.x||0)+(row.i||0)+(row.bu||0)
              const prev = rows[idx+1]
              const prevTot = prev ? (prev.e||0)+(prev.x||0)+(prev.i||0)+(prev.bu||0) : null
              const varPct = prevTot && prevTot > 0 && tot > 0 ? (tot - prevTot)/prevTot*100 : null
              const eur = getEur(row.d, eurUsd)
              const totEur = tot > 0 ? Math.round(tot / eur) : 0
              const rowBg = isLive ? 'rgba(78,205,196,.06)' : idx%2===0 ? 'transparent' : 'rgba(255,255,255,.008)'
              const bl = isLive ? '2px solid #4ECDC4' : 'none'

              return (
                <tr key={row.d + idx}>
                  <td style={{ ...TD, fontWeight: isLive?600:400, whiteSpace:'nowrap', background:rowBg, borderLeft:bl }}>
                    {row.d}{isLive && <span style={{ fontSize:8, color:'#4ECDC4', marginLeft:5, opacity:.8 }}>EN VIVO</span>}
                  </td>
                  <td style={{ ...TD, color:'#2EA543', background:rowBg }}>{row.e>0?fmtU(row.e):'–'}</td>
                  <td style={{ ...TD, color:'#E4002B', background:rowBg }}>{row.x>0?fmtU(row.x):'–'}</td>
                  <td style={{ ...TD, color:'#FF6600', background:rowBg }}>{row.i>0?fmtU(row.i):'–'}</td>
                  <td style={{ ...TD, color:'#F7931A', background:rowBg }}>{row.bu>0?fmtU(row.bu):'–'}</td>
                  <td style={{ ...TD, fontWeight:500, color:'#4ECDC4', background:rowBg }}>{tot>0?fmtU(tot):'–'}</td>
                  <td style={{ ...TD, color:'#A78BFA', background:rowBg }}>{totEur>0?fmtE(totEur):'–'}</td>
                  <td style={{ ...TD, background:rowBg }}>
                    {varPct != null
                      ? <span style={{ color: clr(varPct) }}>{fmtP(varPct)}</span>
                      : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
