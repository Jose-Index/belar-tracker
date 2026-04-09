'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import TickerBar from '@/components/TickerBar'
import CapitalCards from '@/components/CapitalCards'
import EvolutionChart from '@/components/EvolutionChart'
import PositionsTable from '@/components/PositionsTable'
import { RadarBelar, RadarJose } from '@/components/RadarModules'
import { CalendarView, WeeklyHistory, ContributionsTable, YearlyResults, ResultsSummary, Calculator, Footer } from '@/components/Sections'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    brokers: [], wallets: [], snapshots: [], positions: [],
    contributions: [], yearlyResults: [], radarBelar: [],
    radarJose: [], calendarEvents: [], quotes: []
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: brokers },
      { data: wallets },
      { data: snapshots },
      { data: positions },
      { data: contributions },
      { data: yearlyResults },
      { data: radarBelar },
      { data: radarJose },
      { data: calendarEvents },
      { data: quotes },
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
    ])

    setData({
      brokers: brokers || [], wallets: wallets || [],
      snapshots: snapshots || [], positions: positions || [],
      contributions: contributions || [], yearlyResults: yearlyResults || [],
      radarBelar: radarBelar || [], radarJose: radarJose || [],
      calendarEvents: calendarEvents || [], quotes: quotes || [],
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleUpdateValues = async (code, value) => {
    if (!data.snapshots.length) return
    const latest = data.snapshots[data.snapshots.length - 1]
    const newData = { ...latest.data }
    if (code === 'btc') { newData.btc_usd = value } else { newData[code] = value }
    const newTotal = (newData.etoro || 0) + (newData.xtb || 0) + (newData.ibkr || 0) + (newData.btc_usd || 0)
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
    const exists = data.snapshots.some(s => s.week_date === weekDate)
    if (exists) { alert('Esta semana ya est\u00e1 cerrada.'); return }
    await supabase.from('weekly_snapshots').insert({
      week_date: weekDate, year: saturday.getFullYear(),
      data: latest.data, total_usd: latest.total_usd,
    })
    fetchAll()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-2xl font-bold text-etoro tracking-widest mb-2 animate-pulse">BELAR</div>
          <div className="text-xs text-slate-400">Cargando datos...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <TickerBar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Capital Cards */}
        <CapitalCards snapshots={data.snapshots} brokers={data.brokers} wallets={data.wallets} onUpdateValues={handleUpdateValues} />

        {/* AYTD & GLOBAL + Close Week */}
        <div className="flex items-start gap-5">
          <div className="flex-1">
            <ResultsSummary snapshots={data.snapshots} contributions={data.contributions} />
          </div>
          <button onClick={handleCloseWeek}
            className="px-5 py-3 bg-etoro text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors tracking-widest shadow-sm mt-1">
            CERRAR SEMANA
          </button>
        </div>

        {/* Evolution Chart */}
        <EvolutionChart snapshots={data.snapshots} />

        {/* Positions */}
        <PositionsTable positions={data.positions} />

        {/* Radar + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RadarBelar items={data.radarBelar} onRefresh={fetchAll} />
          <RadarJose items={data.radarJose} onRefresh={fetchAll} />
        </div>

        {/* Calendar */}
        <CalendarView events={data.calendarEvents} onRefresh={fetchAll} />

        {/* Weekly History + Contributions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WeeklyHistory snapshots={data.snapshots} />
          <ContributionsTable contributions={data.contributions} />
        </div>

        {/* Yearly Results + Calculator */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <YearlyResults results={data.yearlyResults} />
          </div>
          <Calculator />
        </div>

        <Footer quotes={data.quotes} />
      </main>
    </div>
  )
}
