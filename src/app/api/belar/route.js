import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// GET handler — allows Claude to write via web_fetch without bash/Chrome
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const payload = searchParams.get('data')
  if (!action || !payload) {
    return NextResponse.json({
      status: 'belar-api-ok',
      actions: ['update_radar', 'add_calendar', 'update_positions', 'add_exception', 'update_exception_outcome']
    })
  }
  try {
    const data = JSON.parse(decodeURIComponent(payload))
    return handleAction(action, data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { action, data } = body
    return handleAction(action, data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function handleAction(action, data) {
  if (action === 'update_radar') {
      // Only clear existing if replace=true is explicitly passed
      if (data?.replace) {
        await supabase.from('radar_belar').update({ is_active: false }).eq('is_active', true)
      }
      if (data?.items?.length) {
        const items = data.items.map(item => ({
          ticker: item.ticker,
          note: item.note,
          score: item.score || null,
          added_date: new Date().toISOString().split('T')[0],
          is_active: true,
        }))
        await supabase.from('radar_belar').insert(items)
      }
      return NextResponse.json({ ok: true, replaced: !!data?.replace, count: data?.items?.length || 0 })
    }

    if (action === 'add_calendar') {
      if (data?.events?.length) {
        await supabase.from('calendar_events').insert(data.events)
      }
      return NextResponse.json({ ok: true, count: data?.events?.length || 0 })
    }

    if (action === 'update_positions') {
      // Update current_value for multiple positions
      if (data?.updates?.length) {
        for (const u of data.updates) {
          await supabase.from('positions').update({ current_value: u.value }).eq('ticker', u.ticker).eq('is_open', true)
        }
      }
      return NextResponse.json({ ok: true, count: data?.updates?.length || 0 })
    }

    if (action === 'add_exception') {
      // Registra una excepción tasada activada por Belar (v1.3)
      // Schema: { exception_type: 1|2|3, ticker, platform?, justification,
      //           previous_sl?, proposed_sl?, exit_date?, exit_price? }
      if (!data?.exception_type || ![1, 2, 3].includes(data.exception_type)) {
        return NextResponse.json({ error: 'exception_type must be 1, 2 or 3' }, { status: 400 })
      }
      if (!data?.ticker || !data?.justification) {
        return NextResponse.json({ error: 'ticker and justification are required' }, { status: 400 })
      }
      const row = {
        exception_type: data.exception_type,
        ticker: data.ticker.toUpperCase(),
        platform: data.platform || null,
        justification: data.justification,
        previous_sl: data.previous_sl ?? null,
        proposed_sl: data.proposed_sl ?? null,
        exit_date: data.exit_date || null,
        exit_price: data.exit_price ?? null,
      }
      const { data: inserted, error } = await supabase.from('exceptions').insert(row).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, exception: inserted })
    }

    if (action === 'update_exception_outcome') {
      // Actualiza el resultado de una excepción a posteriori
      // Schema: { id, outcome: 'favorable'|'desfavorable'|'neutro', outcome_note? }
      if (!data?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      if (!['favorable', 'desfavorable', 'neutro'].includes(data?.outcome)) {
        return NextResponse.json({ error: 'outcome must be favorable|desfavorable|neutro' }, { status: 400 })
      }
      const { error } = await supabase.from('exceptions').update({
        outcome: data.outcome,
        outcome_note: data.outcome_note || null,
        outcome_updated_at: new Date().toISOString(),
      }).eq('id', data.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
