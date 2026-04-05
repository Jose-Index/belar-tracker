# BELAR Portfolio Tracker v8

Stack: Next.js 16 + Supabase + Vercel

## Setup rápido

### 1. Supabase
- SQL Editor → pega `supabase-schema.sql` → ejecutar
- Settings → API → copia URL y anon key

### 2. Variables de entorno (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
```

### 3. Vercel
Importa el repo desde GitHub → añade env vars → Deploy.

## Desarrollo local
```bash
npm install
npm run dev
```

## Tablas Supabase
| Tabla | Descripción |
|---|---|
| snap | Valores actuales (fila única) |
| notas | Notas por ticker |
| aportaciones | Historial de capital |
| wb_extra | Cierres semanales post-28/03/26 |
