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
    return NextResponse.json({ status: 'belar-api-ok', actions: ['update_radar', 'add_calendar', 'update_positions'] })
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
