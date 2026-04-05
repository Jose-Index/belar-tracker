'use client'
import type { Snap, Aportacion } from '@/lib/supabase'
import { fmtU, fmtE, fmtP, clr } from '@/lib/utils'

interface Props {
  snap: Snap
  btcVal: number
  total: number
  totalEur: number
  aportaciones: Aportacion[]
  eurUsd: number
}

export default function Annual({ snap, btcVal, total, totalEur, aportaciones, eurUsd }: Props) {
  const totAportEur = aportaciones.reduce((s, a) => s + (a.importe_eur || 0), 0)

  const ap2026 = aportaciones.filter(a => a.fecha?.slice(-2) === '26')
  const ap2026eur = ap2026.reduce((s, a) => s + (a.importe_eur || 0), 0)
  const ap2026usd = ap2026.reduce((s, a) => s + (a.importe_usd || 0), 0)

  const ini2026 = 22454.63
  const base2026 = ini2026 + ap2026usd
  const ret2026 = base2026 > 0 ? (total - base2026) / base2026 * 100 : 0

  const totAportUsd = totAportEur * eurUsd
  const retGlobal = totAportUsd > 0 ? (total - totAportUsd) / totAportUsd * 100 : 0

  const YEARS = [
    {
      yr: '2024', up: false, ret: -4.70,
      inv: '13.260€', val: null,
      rows: [['eToro','-1,88%'],['XTB','-9,12%'],['IBKR','–'],['BTC','+19,45%']]
    },
    {
      yr: '2025', up: true, ret: 18.86,
      inv: '2.950€', val: null,
      rows: [['eToro','+18,92%'],['XTB','+71,96%'],['IBKR','+1,72%'],['BTC','+8,13%']]
    },
    {
      yr: '2026 YTD', up: ret2026 >= 0, ret: ret2026,
      inv: `${Math.round(ap2026eur).toLocaleString('en-US')}€`,
      val: `${fmtU(total)} · ${fmtE(totalEur)}`,
      rows: [['eToro',fmtU(snap.etoro)],['XTB',fmtU(snap.xtb)],['IBKR',fmtU(snap.ibkr)],['BTC',fmtU(btcVal)]]
    },
    {
      yr: 'GLOBAL', up: retGlobal >= 0, ret: retGlobal, global: true,
      inv: `${Math.round(totAportEur).toLocaleString('en-US')}€`,
      val: `${fmtU(total)} · ${fmtE(totalEur)}`,
      rows: [['eToro',fmtU(snap.etoro)],['XTB',fmtU(snap.xtb)],['IBKR',fmtU(snap.ibkr)],['BTC',fmtU(btcVal)]]
    },
  ]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, marginBottom:'1rem' }}>
      {YEARS.map(y => {
        const rc = y.up ? '#2ecc8a' : '#e05555'
        const isGlobal = 'global' in y && y.global
        return (
          <div key={y.yr} style={{
            background:'#13161a',
            border: isGlobal ? `2px solid ${rc}` : '1px solid #2f3540',
            borderRadius:8, padding:'.7rem 1rem'
          }}>
            <div style={{ fontSize: isGlobal?15:13, fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8, fontWeight:700 }}>
              {y.yr}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontFamily:'monospace', marginBottom:3 }}>
              <span style={{ color:'#727a87' }}>Invertido</span>
              <span style={{ color:'#adb5c0' }}>{y.inv}</span>
            </div>
            {y.val && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontFamily:'monospace', marginBottom:3 }}>
                <span style={{ color:'#727a87' }}>Valor</span>
                <span style={{ color: isGlobal ? '#4ECDC4' : '#adb5c0' }}>{y.val}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontFamily:'monospace', marginBottom:3 }}>
              <span style={{ color:'#adb5c0' }}>Rentabilidad</span>
              <span style={{ color:rc, fontWeight:600 }}>{fmtP(y.ret)}</span>
            </div>
            <div style={{ height:1, background:'#2f3540', margin:'4px 0' }} />
            {y.rows.map(([lbl, val]) => {
              const isP = val.startsWith('+')
              const isN = val.startsWith('-')
              const vc = isP ? '#2ecc8a' : isN ? '#e05555' : '#adb5c0'
              return (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontFamily:'monospace', marginBottom:3 }}>
                  <span style={{ color:'#727a87' }}>{lbl}</span>
                  <span style={{ color:vc }}>{val}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
