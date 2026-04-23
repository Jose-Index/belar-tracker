-- ════════════════════════════════════════════════════════════════
-- BELAR Tracker v10.0 · Migración SQL
-- Ejecutar en SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/ruqgzfoperkfmahpbpcv/sql/new
-- ════════════════════════════════════════════════════════════════

-- 1. Añadir columna `resp` a positions (Jose / Belar / Deal)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS resp VARCHAR(20) DEFAULT NULL;

-- 2. Nueva tabla broker_balances: saldos manuales (cash) persistentes por broker
CREATE TABLE IF NOT EXISTS broker_balances (
  id SERIAL PRIMARY KEY,
  broker VARCHAR(10) NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broker_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on broker_balances" ON broker_balances;
CREATE POLICY "Allow all on broker_balances"
  ON broker_balances FOR ALL USING (true) WITH CHECK (true);

-- Seed inicial (idempotente)
INSERT INTO broker_balances (broker, balance) VALUES
  ('etoro', 0), ('xtb', 0), ('ibkr', 0)
ON CONFLICT (broker) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- FIN migración v10. Después de ejecutar, el tracker queda listo.
-- ════════════════════════════════════════════════════════════════
