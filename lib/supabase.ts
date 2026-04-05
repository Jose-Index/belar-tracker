import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

// Tipos principales
export interface Snap {
  id: number
  etoro: number
  xtb: number
  ibkr: number
  btc_qty: number
  updated_at: string
}

export interface Nota {
  id: number
  ticker: string
  texto: string
  fecha: string
  created_at: string
}

export interface Aportacion {
  id: number
  fecha: string
  broker: string
  importe_eur: number
  importe_usd: number | null
}

export interface WbRow {
  id: number
  fecha: string
  etoro: number
  xtb: number
  ibkr: number
  btc_usd: number
}
