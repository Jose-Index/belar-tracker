'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import TickerBar from '@/components/TickerBar'
import TabNav from '@/components/TabNav'
import CapitalCards from '@/components/CapitalCards'
import EvolutionChart from '@/components/EvolutionChart'
import PositionsTable from '@/components/PositionsTable'
import { RadarBelar, RadarJose, ExceptionsSection } from '@/components/RadarModules'
import {
  CalendarView, WeeklyHistory, ContributionsTable, YearlyResults,
  ResultsSummary, Calculator, BackupExport, Settings, Footer,
  BrokerBalancesRegister,
} from '@/components/Sections'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [btcPrice, setBtcPrice] = useState(null)
  const [eurUsdRate, setEurUsdRate] = useState(1.08)
  const [etoroLive, setEtoroLive] = useState(null)
  const [data, setData] = useState({
    brokers: [], wallets: [], snapshots: [], positions: [],
    contributions: [], yearlyResults: [], radarBelar: [],
    radarJose: [], calendarEvents: [], quotes: [],
    positionHistory: [], exceptions: [], brokerBalances: [],
  })

  const doFetch = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
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
      supabase.from('radar_belar').select('*').eq('is_active', true).order('added_date', { ascending: false }),
      supabase.from('radar_jose').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('calendar_events').select('*').order('date'),
      supabase.from('quotes').select('*').eq('is_active', true),
      supabase.from('position_history').select('position_id,week_date,value,invested,event,event_amount').order('week_date'),
    ])

    let exceptions = []
    try {
      const { data: ex } = await supabase.from('exceptions').select('*').eq('is_active', true).order('activated_at', { ascending: false })
      exceptions = ex || []
    } catch (_) { exceptions = [] }

    let brokerBalances = []
    try {
      const { data: bb } = await supabase.from('broker_balances').select('*')
      brokerBalances = bb || []
    } catch (_) { brokerBalances = [] }

    setData({
      brokers: brokers||[], wallets: wallets||[], snapshots: snapshots||[],
      positions: positions||[], contributions: contributions||[],
      yearlyResults: yearlyResults||[], radarBelar: radarBelar||[],
      radarJose: radarJose||[], calendarEvents: calendarEvents||[],
      quotes: quotes||[], positionHistory: positionHistory||[],
      exceptions, brokerBalances,
    })
    if (!silent) setLoading(false)
  }, [])

  // fetchAll = carga inicial con splash · refreshData = refresco silencioso (sin parpadeo)
  const fetchAll = useCallback(() => doFetch({ silent: false }), [doFetch])
  const refreshData = useCallback(() => doFetch({ silent: true }), [doFetch])

  useEffect(() => {
    const loadLive = async () => {
      try {
        const [tickerRes, etoroRes] = await Promise.all([
          fetch('/api/tickers'),
          fetch('/api/etoro?action=portfolio').catch(() => null),
        ])
        const tickers = await tickerRes.json()
        const btc = tickers.find(t => t.symbol === 'BTC-USD')
        if (btc?.price) setBtcPrice(btc.price)
        const eur = tickers.find(t => t.symbol === 'EURUSD=X')
        if (eur?.price) setEurUsdRate(eur.price)
        if (etoroRes) {
          const etoro = await etoroRes.json()
          if (etoro.ok) setEtoroLive(etoro)
        }
      } catch(e) {}
    }
    loadLive()
    const id = setInterval(loadLive, 30000)
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
    refreshData()
  }

  const btcQty = data.snapshots.length ? (data.snapshots[data.snapshots.length - 1].data?.btc_qty || 0) : 0

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
        <Header />
        <TickerBar />
        <TabNav active={tab} onChange={setTab} />
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {tab === 'dashboard' && <>
          <CapitalCards snapshots={data.snapshots} brokers={data.brokers} wallets={data.wallets} onUpdateValues={handleUpdateValues} btcPrice={btcPrice} />
          <EvolutionChart snapshots={data.snapshots} />
          <PositionsTable positions={data.positions} positionHistory={data.positionHistory} onRefresh={refreshData} eurUsdRate={eurUsdRate} />
          <BrokerBalancesRegister
            brokerBalances={data.brokerBalances}
            positions={data.positions}
            snapshots={data.snapshots}
            btcPrice={btcPrice}
            btcQty={btcQty}
            eurUsdRate={eurUsdRate}
           
            onRefresh={refreshData}
          />
          <ResultsSummary snapshots={data.snapshots} contributions={data.contributions} />
        </>}
        {tab === 'historico' && <>
          <YearlyResults results={data.yearlyResults} contributions={data.contributions} snapshots={data.snapshots} />
          <EvolutionChart snapshots={data.snapshots} storageKey="historico" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <WeeklyHistory snapshots={data.snapshots} />
            <ContributionsTable contributions={data.contributions} onRefresh={refreshData} />
          </div>
        </>}
        {tab === 'radar' && <>
          <RadarBelar items={data.radarBelar} onRefresh={refreshData} />
          <ExceptionsSection items={data.exceptions} onRefresh={refreshData} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RadarJose items={data.radarJose} onRefresh={refreshData} />
            <CalendarView events={data.calendarEvents} onRefresh={refreshData} />
          </div>
        </>}
        {tab === 'tools' && <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Calculator />
            <BackupExport snapshots={data.snapshots} positions={data.positions} contributions={data.contributions} yearlyResults={data.yearlyResults} />
          </div>
          <Settings quotes={data.quotes} onRefresh={refreshData} />
        </>}
        <Footer quotes={data.quotes} />
      </main>
    </div>
  )
}
