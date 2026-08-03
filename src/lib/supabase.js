import { createClient } from '@supabase/supabase-js'

// Clave publicable: segura en navegador con RLS activado.
// La clave secreta NUNCA se usa aquí (regla de oro nº 2).
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(url, key)
