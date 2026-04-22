-- ═══════════════════════════════════════════════════════════════
-- BELAR Tracker v1.3 — Tabla `exceptions`
-- Auditoría de excepciones tasadas activadas por Belar
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.exceptions (
  id BIGSERIAL PRIMARY KEY,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exception_type SMALLINT NOT NULL CHECK (exception_type IN (1, 2, 3)),
  ticker TEXT NOT NULL,
  platform TEXT,
  justification TEXT NOT NULL,
  -- Campos específicos por tipo
  previous_sl NUMERIC,      -- Excepción 2
  proposed_sl NUMERIC,      -- Excepción 2
  exit_date DATE,           -- Excepción 3
  exit_price NUMERIC,       -- Excepción 3
  -- Resultado posterior
  outcome TEXT CHECK (outcome IN ('favorable', 'desfavorable', 'neutro', NULL)),
  outcome_note TEXT,
  outcome_updated_at TIMESTAMPTZ,
  -- Soft delete por consistencia con otras tablas
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_exceptions_activated_at ON public.exceptions(activated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_type ON public.exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_exceptions_ticker ON public.exceptions(ticker);
CREATE INDEX IF NOT EXISTS idx_exceptions_outcome ON public.exceptions(outcome);

-- RLS allow all (consistente con el resto del proyecto)
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_select" ON public.exceptions;
DROP POLICY IF EXISTS "allow_all_insert" ON public.exceptions;
DROP POLICY IF EXISTS "allow_all_update" ON public.exceptions;
DROP POLICY IF EXISTS "allow_all_delete" ON public.exceptions;

CREATE POLICY "allow_all_select" ON public.exceptions FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON public.exceptions FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON public.exceptions FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON public.exceptions FOR DELETE USING (true);

-- Verificación
SELECT 'Tabla exceptions creada correctamente' AS status;
