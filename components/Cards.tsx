'use client'
import { useState } from 'react'
import type { Snap } from '@/lib/supabase'
import { fmtU, fmtE, fmtP, clr } from '@/lib/utils'

interface Props {
  snap: Snap
  btcVal: number
  total: number
  totalEur: number
  onUpdate: (field: string, value: number) => void
}

const CARDS = [
  { id: 'etoro',  field: 'etoro',   label: 'eToro', color: '#2EA543', type: 'usd', ytd: -12.01 },
  { id: 'xtb',    field: 'xtb',     label: 'XTB',   color: '#E4002B', type: 'usd', ytd: +0.61 },
  { id: 'ibkr',   field: 'ibkr',    label: 'IBKR',  color: '#FF6600', type: 'usd', ytd: -20.41 },
  { id: 'btc',    field: 'btc_qty', label: 'BTC',   color: '#F7931A', type: 'btc', ytd: null },
  { id: 'total',  field: '',        label: 'Total',  color: '#4ECDC4', type: null,  ytd: -7.08 },
]

export default function Cards({ snap, btcVal, total, totalEur, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const getValue = (c: typeof CARDS[0]) => {
    if (c.id === 'etoro') return snap.etoro
    if (c.id === 'xtb')   return snap.xtb
    if (c.id === 'ibkr')  return snap.ibkr
    if (c.id === 'btc')   return snap.btc_qty
    return null
  }

  const getDisplay = (c: typeof CARDS[0]) => {
    if (c.id === 'etoro') return fmtU(snap.etoro)
    if (c.id === 'xtb')   return fmtU(snap.xtb)
    if (c.id === 'ibkr')  return fmtU(snap.ibkr)
    if (c.id === 'btc')   return `${fmtU(btcVal)}`
    return `${fmtU(total)} · ${fmtE(totalEur)}`
  }

  const getSub = (c: typeof CARDS[0]) => {
    if (c.id === 'btc') return `${snap.btc_qty.toFixed(8)} ₿`
    if (c.ytd !== null) return `2026: ${fmtP(c.ytd)}`
    return ''
  }

  function startEdit(c: typeof CARDS[0]) {
    if (!c.field) return
    setEditing(c.id)
    setEditVal(String(getValue(c) ?? ''))
  }

  function confirmEdit(c: typeof CARDS[0]) {
    const v = parseFloat(editVal)
    if (!isNaN(v) && v >= 0) onUpdate(c.field, v)
    setEditing(null)
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: 10, marginBottom: '1rem'
    }}>
      {CARDS.map(c => {
        const sub = getSub(c)
        const subUp = c.ytd !== null ? c.ytd >= 0 : true
        return (
          <div key={c.id} style={{
            background: '#13161a', border: '1px solid #2f3540',
            borderTop: `2px solid ${c.color}`, borderRadius: 8,
            padding: '.7rem 1rem'
          }}>
            <div style={{ fontSize: 9, color: '#727a87', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
              {c.label}
            </div>
            {editing === c.id ? (
              <input
                autoFocus
                type="number"
                step={c.type === 'btc' ? '0.00000001' : '1'}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => confirmEdit(c)}
                onKeyDown={e => e.key === 'Enter' && confirmEdit(c)}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${c.color}`, outline: 'none',
                  fontSize: 16, fontWeight: 500, fontFamily: 'inherit',
                  color: c.color
                }}
              />
            ) : (
              <div
                onClick={() => startEdit(c)}
                style={{
                  fontSize: 16, fontWeight: 500, color: c.color,
                  cursor: c.field ? 'pointer' : 'default'
                }}
                title={c.field ? 'Click para editar' : undefined}
              >
                {getDisplay(c)}
              </div>
            )}
            {sub && (
              <div style={{ fontSize: 10, fontFamily: 'monospace', marginTop: 3, color: clr(subUp ? 1 : -1) }}>
                {sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
