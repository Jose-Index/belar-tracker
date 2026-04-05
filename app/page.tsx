'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Snap, Nota, Aportacion, WbRow } from '@/lib/supabase'
import { W_BASE, POSITIONS, CALENDARIO, FRASES } from '@/lib/data'
import { notaFecha, todayStr } from '@/lib/utils'
import Header from '@/components/Header'
import Cards from '@/components/Cards'
import TrackerChart from '@/components/Chart'
import Posiciones from '@/components/Posiciones'
import Intel from '@/components/Intel'
import Notas from '@/components/Notas'
import Calendario from '@/components/Calendario'
import Weekly from '@/components/Weekly'
import Aportaciones from '@/components/Aportaciones'
import Annual from '@/components/Annual'

export default function TrackerPage() {
  const [snap, setSnap] = useState<Snap>({
    id: 1, etoro: 10133.09, xtb: 8125.65, ibkr: 2320.32, btc_qty: 0.01470635,
    updated_at: new Date().toISOString()
  })
  const [notas, setNotas] = useState<Nota[]>([])
  const [aportaciones, setAportaciones] = useState<Aportacion[]>([])
  const [wbExtra, setWbExtra] = useState<WbRow[]>([])
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [eurUsd, setEurUsd] = useState(1.09)
  const [syncStatus, setSyncStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('⬤ sync')
  const frase = FRASES[Math.floor(Math.random() * FRASES.length)]

  useEffect(() => {
    loadAll()
    loadLive()
    const iv = setInterval(loadLive, 60000)
    return () => clearInterval(iv)
  }, [])

  async function loadAll() {
    setSyncStatus('saving'); setSyncMsg('↓ cargando')
    try {
      const [s, n, a, w] = await Promise.all([
        supabase.from('snap').select('*').eq('id', 1).single(),
        supabase.from('notas').select('*').order('created_at', { ascending: false }),
        supabase.from('aportaciones').select('*').order('created_at', { ascending: false }),
        supabase.from('wb_extra').select('*').order('created_at', { ascending: true }),
      ])
      if (s.data) setSnap(s.data)
      if (n.data) setNotas(n.data)
      if (a.data) setAportaciones(a.data)
      if (w.data) setWbExtra(w.data)
      setSyncStatus('saved'); setSyncMsg('✓ cargado')
      setTimeout(() => { setSyncStatus('idle'); setSyncMsg('⬤ sync') }, 2000)
    } catch {
      setSyncStatus('error'); setSyncMsg('✗ error')
    }
  }

  async function loadLive() {
    try {
      const r = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
      const d = await r.json()
      if (d?.data?.amount) setBtcPrice(+d.data.amount)
    } catch {}
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')
      const d = await r.json()
      if (d?.rates?.USD) setEurUsd(d.rates.USD)
    } catch {}
  }

  async function updateSnap(field: string, value: number) {
    const updates = { [field]: value, updated_at: new Date().toISOString() }
    setSnap(prev => ({ ...prev, ...updates }))
    setSyncStatus('saving'); setSyncMsg('↑ guardando')
    const { error } = await supabase.from('snap').update(updates).eq('id', 1)
    if (error) { setSyncStatus('error'); setSyncMsg('✗ error') }
    else { setSyncStatus('saved'); setSyncMsg('✓ guardado'); setTimeout(() => { setSyncStatus('idle'); setSyncMsg('⬤ sync') }, 2000) }
  }

  async function addNota(ticker: string, texto: string) {
    const fecha = notaFecha()
    const { data, error } = await supabase.from('notas').insert({ ticker, texto, fecha }).select().single()
    if (!error && data) setNotas(prev => [data, ...prev])
  }
  async function deleteNota(id: number) {
    await supabase.from('notas').delete().eq('id', id)
    setNotas(prev => prev.filter(n => n.id !== id))
  }

  async function addAportacion(a: Omit<Aportacion,'id'|'created_at'>) {
    const { data, error } = await supabase.from('aportaciones').insert(a).select().single()
    if (!error && data) setAportaciones(prev => [data, ...prev])
  }

  async function closeWeek() {
    const fecha = todayStr()
    const btcVal = btcPrice ? Math.round(snap.btc_qty * btcPrice) : 1020
    const row = { fecha, etoro: snap.etoro, xtb: snap.xtb, ibkr: snap.ibkr, btc_usd: btcVal }
    const { data, error } = await supabase.from('wb_extra').upsert(row, { onConflict: 'fecha' }).select().single()
    if (!error && data) {
      setWbExtra(prev => [...prev.filter(r => r.fecha !== fecha), data].sort((a,b) => a.fecha.localeCompare(b.fecha)))
      alert('✓ Semana cerrada — ' + fecha + ' guardado.')
    }
  }

  const btcVal = btcPrice ? Math.round(snap.btc_qty * btcPrice) : 1020
  const total = snap.etoro + snap.xtb + snap.ibkr + btcVal
  const totalEur = Math.round(total / eurUsd)
  const wbAll = [
    ...W_BASE,
    ...wbExtra.map(r => ({ d: r.fecha, e: r.etoro, x: r.xtb, i: r.ibkr, bu: r.btc_usd }))
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f11' }}>
      <Header syncStatus={syncStatus} syncMsg={syncMsg} onCloseWeek={closeWeek} />
      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '1.2rem' }}>
        <Cards snap={snap} btcVal={btcVal} total={total} totalEur={totalEur} onUpdate={updateSnap} />
        <SH title="Evolución semanal" />
        <TrackerChart wbAll={wbAll} snap={snap} btcVal={btcVal} />
        <SH title="Posiciones abiertas" />
        <Posiciones positions={POSITIONS} />
        <SH title="Belar Intel" meta="28/03/26 · Sesión semanal" />
        <Intel />
        <SH title="Notas de seguimiento" />
        <Notas notas={notas} onAdd={addNota} onDelete={deleteNota} />
        <SH title="Calendario de vigilancia" />
        <Calendario eventos={CALENDARIO} />
        <SH title="Histórico semanal" />
        <Weekly wbAll={wbAll} snap={snap} btcVal={btcVal} eurUsd={eurUsd} />
        <SH title="Aportaciones de capital" />
        <Aportaciones aportaciones={aportaciones} onAdd={addAportacion} />
        <SH title="Resumen anual" />
        <Annual snap={snap} btcVal={btcVal} total={total} totalEur={totalEur} aportaciones={aportaciones} eurUsd={eurUsd} />
      </main>
      <footer style={{ borderTop: '1px solid #2f3540', padding: '1.5rem 1.2rem', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#727a87', fontStyle: 'italic', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>
          &ldquo;{frase.q}&rdquo;
        </p>
        <p style={{ fontSize: 9, color: '#727a87', marginTop: 4, opacity: .6 }}>— {frase.a}</p>
      </footer>
    </div>
  )
}

function SH({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, margin:'1rem 0 .6rem', fontSize:10, color:'#727a87', textTransform:'uppercase', letterSpacing:'.1em' }}>
      {title}
      <div style={{ flex:1, height:1, background:'#2f3540' }} />
      {meta && <span style={{ fontSize:9, textTransform:'none', letterSpacing:0 }}>{meta}</span>}
    </div>
  )
}
