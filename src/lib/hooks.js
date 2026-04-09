'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export function useSupabase(table, options = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { select = '*', order, filter, single = false } = options

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from(table).select(select)
      if (order) query = query.order(order.column, { ascending: order.ascending ?? true })
      if (filter) {
        for (const f of Array.isArray(filter) ? filter : [filter]) {
          query = query[f.op || 'eq'](f.column, f.value)
        }
      }
      if (single) query = query.single()

      const { data: result, error: err } = await query
      if (err) throw err
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [table, select, JSON.stringify(order), JSON.stringify(filter), single])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useBrokers() {
  return useSupabase('brokers', {
    filter: { column: 'active', value: true },
    order: { column: 'sort_order' }
  })
}

export function useWallets() {
  return useSupabase('wallets', {
    filter: { column: 'active', value: true },
    order: { column: 'sort_order' }
  })
}

export function useSnapshots() {
  return useSupabase('weekly_snapshots', {
    order: { column: 'week_date' }
  })
}

export function useLatestSnapshot() {
  return useSupabase('weekly_snapshots', {
    order: { column: 'week_date', ascending: false },
    single: false
  })
}

export function usePositions(onlyOpen = true) {
  const filter = onlyOpen ? { column: 'is_open', value: true } : undefined
  return useSupabase('positions', {
    filter,
    order: { column: 'platform' }
  })
}

export function useContributions() {
  return useSupabase('contributions', {
    order: { column: 'date' }
  })
}

export function useYearlyResults() {
  return useSupabase('yearly_results', {
    order: { column: 'year' }
  })
}

export function useRadarBelar() {
  return useSupabase('radar_belar', {
    filter: { column: 'is_active', value: true },
    order: { column: 'created_at', ascending: false }
  })
}

export function useRadarJose() {
  return useSupabase('radar_jose', {
    filter: { column: 'is_active', value: true },
    order: { column: 'created_at', ascending: false }
  })
}

export function useCalendarEvents() {
  return useSupabase('calendar_events', {
    order: { column: 'date' }
  })
}

export function useQuotes() {
  return useSupabase('quotes', {
    filter: { column: 'is_active', value: true }
  })
}

// Mutations
export async function upsertSnapshot(weekDate, data, totalUsd) {
  const year = new Date(weekDate).getFullYear()
  return supabase.from('weekly_snapshots').upsert({
    week_date: weekDate,
    year,
    data,
    total_usd: totalUsd,
  }, { onConflict: 'week_date' })
}

export async function updateSnapshotValues(id, data, totalUsd) {
  return supabase.from('weekly_snapshots').update({
    data,
    total_usd: totalUsd,
  }).eq('id', id)
}

export async function updatePosition(id, updates) {
  return supabase.from('positions').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function addRadarJose(ticker, note) {
  return supabase.from('radar_jose').insert({ ticker, note })
}

export async function removeRadarJose(id) {
  return supabase.from('radar_jose').update({ is_active: false }).eq('id', id)
}

export async function addCalendarEvent(event) {
  return supabase.from('calendar_events').insert(event)
}
