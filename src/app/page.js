'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import TickerBar from '@/components/TickerBar'
import TabNav from '@/components/TabNav'
import CapitalCards from '@/components/CapitalCards'
import EvolutionChart from '@/components/EvolutionChart'
import PositionsTable from '@/components/PositionsTable'
import { RadarBelar, RadarJose } from '@/components/RadarModules'
import { CalendarView, WeeklyHistory, ContributionsTable, YearlyResults, ResultsSummary, Calculator, BackupExport, Settings, Footer } from '@/components/Sections'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [btcPrice, setBtcPrice] = useState(null)
  const [etoroLive, setEtoroLive] = useState(null)
  const [data, setData] = useState({
    brokers: [], wallets: [], snapshots: [], positions: [],
    contributions: [], yearlyResults: [], radarBelar: [],
    radarJose: [], calendarEvents: [], quotes: [],
    positionHistory: []
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: brokers }, { data: wallets }, { data: snapshots },
      { data: positions }, { data: contributions }, { data: yearlyResults },
      { data: radarBelar }, { data: radarJose }, { data: calendarEvents },
      { data: quotes }, { data: positionHistory },
    ] = await Promise.all([
      supabase.from('brokers').select('*').eq('active', true).order('sort_order'),
      supabase.from('wallets').select('*').eq('active', true).order('sort_order'),
      supabase.from('weekly_snapshots').select('*').order('week_date'),
      supabase.from('positions').select('*').eq('is_open', true).order('platform'),
      supabase.from('contributions').select('*').order('date'),
      supabase.from('yearly_results').select('*').order('year'),
      supabase.from('radar_belar').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('radar_jose').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('calendar_events').select('*').order('date'),
      supabase.from('quotes').select('*').eq('is_active', true),
      supabase.from('position_history').select('position_id,week_date,value,invested,event,event_amount').order('week_date'),
    ])
    setData({ brokers: brokers||[], wallets: wallets||[], snapshots: snapshots||[], positions: positions||[], contributions: contributions||[], yearlyResults: yearlyResults||[], radarBelar: radarBelar||[], radarJose: radarJose||[], calendarEvents: calendarEvents||[], quotes: quotes||[], positionHistory: positionHistory||[] })
    setLoading(false)
  }, [])

  // Live data: BTC price + eToro portfolio (auto-refresh every 30s)
  useEffect(() => {
    const loadLive = async () => {
      try {
        const [tickerRes, etoroRes] = await Promise.all([
          fetch('/api/tickers'),
          fetch('/api/etoro?action=portfolio'),
        ])
        const tickers = await tickerRes.json()
        const btc = tickers.find(t => t.symbol === 'BTC-USD')
        if (btc?.price) setBtcPrice(btc.price)
        const etoro = await etoroRes.json()
        if (etoro.ok) setEtoroLive(etoro)
      } catch(e) {}
    }
    loadLive()
    const id = setInterval(loadLive, 10000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleUpdateValues = async (key, value) => {
    if (!data.snapshots.length) return
    const latest = data.snapshots[data.snapshots.length - 1]
    const newData = { ...latest.data }
    if (key === 'btc_qty') {
      newData.btc_qty = value
      newData.btc_usd = btcPrice ? value * btcPrice : newData.btc_usd
    } else {
      newData[key] = value
    }
    const newTotal = (newData.etoro||0) + (newData.xtb||0) + (newData.ibkr||0) + (newData.btc_usd||0)
    await supabase.from('weekly_snapshots').update({ data: newData, total_usd: newTotal }).eq('id', latest.id)
    fetchAll()
  }

  const handleCloseWeek = async () => {
    const now = new Date()
    const day = now.getDay()
    const saturday = new Date(now)
    if (day !== 6) saturday.setDate(now.getDate() - ((day + 1) % 7))
    const weekDate = saturday.toISOString().split('T')[0]
    const latest = data.snapshots[data.snapshots.length - 1]
    if (!latest) return
    if (data.snapshots.some(s => s.week_date === weekDate)) {
      alert('Esta semana ya esta cerrada.')
      return
    }
    if (!confirm('Cerrar semana del ' + weekDate + '? Total: $' + latest.total_usd?.toLocaleString())) return
    await supabase.from('weekly_snapshots').insert({ week_date: weekDate, year: saturday.getFullYear(), data: latest.data, total_usd: latest.total_usd })
    if (data.positions.length > 0) {
      const posSnaps = data.positions.map(p => ({
        position_id: p.id, week_date: weekDate,
        value: Number(p.current_value || p.invested),
        invested: Number(p.invested),
      }))
      await supabase.from('position_history').insert(posSnaps).catch(() => {})
    }
    fetchAll()
  }

  const handleCloseYear = async () => {
    const year = new Date().getFullYear()
    if (!confirm('Cerrar el anno ' + year + '? Esto cerrara los resultados anuales y creara el anno ' + (year + 1) + '.')) return
    if (!confirm('SEGUNDA CONFIRMACION: Estas seguro de cerrar ' + year + '? Esta accion no se puede deshacer.')) return
    const latest = data.snapshots[data.snapshots.length - 1]
    if (!latest) return
    const yearSnapshots = data.snapshots.filter(s => new Date(s.week_date).getFullYear() === year)
    const firstOfYear = yearSnapshots[0]
    const ytdContribs = data.contributions.filter(c => new Date(c.date).getFullYear() === year).reduce((s, c) => s + Number(c.amount_usd || 0), 0)
    const existingYear = data.yearlyResults.find(r => r.year === year)
    const yearData = {
      year, invested_total: ytdContribs, final_value: latest.total_usd,
      pnl_usd: latest.total_usd - (firstOfYear?.total_usd || 0) - ytdContribs,
      pnl_pct: firstOfYear ? ((latest.total_usd - firstOfYear.total_usd - ytdContribs) / firstOfYear.total_usd) : 0,
    }
    if (existingYear) { await supabase.from('yearly_results').update(yearData).eq('year', year) }
    else { await supabase.from('yearly_results').insert(yearData) }
    const nextYear = year + 1
    const existingNext = data.yearlyResults.find(r => r.year === nextYear)
    if (!existingNext) {
      await supabase.from('yearly_results').insert({ year: nextYear, invested_total: 0, final_value: latest.total_usd, pnl_usd: 0, pnl_pct: 0 })
    }
    alert('Anno ' + year + ' cerrado. Anno ' + nextYear + ' creado.')
    fetchAll()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="text-2xl font-bold text-etoro tracking-widest mb-2 animate-pulse">BELAR</div>
        <div className="text-xs text-slate-400">Cargando datos...</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-50 bg-slate-50">
        <Header onCloseWeek={handleCloseWeek} onCloseYear={handleCloseYear} />
        <TickerBar />
        <TabNav active={tab} onChange={setTab} />
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {tab === 'dashboard' && <>
          <CapitalCards snapshots={data.snapshots} brokers={data.brokers} wallets={data.wallets} onUpdateValues={handleUpdateValues} btcPrice={btcPrice} etoroLive={etoroLive} />
          <EvolutionChart snapshots={data.snapshots} />
          <PositionsTable positions={data.positions} positionHistory={data.positionHistory} onRefresh={fetchAll} etoroLive={etoroLive} />
          <ResultsSummary snapshots={data.snapshots} contributions={data.contributions} />
        </>}
        {tab === 'historico' && <>
          <YearlyResults results={data.yearlyResults} contributions={data.contributions} snapshots={data.snapshots} />
          <EvolutionChart snapshots={data.snapshots} storageKey="historico" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <WeeklyHistory snapshots={data.snapshots} />
            <ContributionsTable contributions={data.contributions} onRefresh={fetchAll} />
          </div>
        </>}
        {tab === 'radar' && <>
          <RadarBelar items={data.radarBelar} onRefresh={fetchAll} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RadarJose items={data.radarJose} onRefresh={fetchAll} />
            <CalendarView events={data.calendarEvents} onRefresh={fetchAll} />
          </div>
        </>}
        {tab === 'tools' && <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Calculator />
            <BackupExport snapshots={data.snapshots} positions={data.positions} contributions={data.contributions} yearlyResults={data.yearlyResults} />
          </div>
          <Settings quotes={data.quotes} onRefresh={fetchAll} />
        </>}
        <Footer quotes={data.quotes} />
      </main>
    </div>
  )
}
