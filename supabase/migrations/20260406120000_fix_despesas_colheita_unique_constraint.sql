BEGIN;

-- O PostgREST/Supabase upsert com `on_conflict=colheita_id` exige uma UNIQUE/EXCLUDE constraint.
-- Antes havia um índice único parcial (WHERE colheita_id IS NOT NULL), que não é aceito pelo ON CONFLICT.

-- Remove o índice parcial antigo (se existir).
DROP INDEX IF EXISTS public.idx_despesas_colheita_id_unique;

-- Safety: se por algum motivo existirem duplicatas, mantém só o registro mais recente.
WITH ranked AS (
  SELECT
    id,
    colheita_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY colheita_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.despesas
  WHERE colheita_id IS NOT NULL
)
DELETE FROM public.despesas d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- Adiciona a constraint UNIQUE (permite múltiplos NULL por padrão no Postgres).
DO $$
BEGIN
  ALTER TABLE public.despesas
    ADD CONSTRAINT despesas_colheita_id_unique UNIQUE (colheita_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
