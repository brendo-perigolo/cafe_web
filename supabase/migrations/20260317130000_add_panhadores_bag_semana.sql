BEGIN;

ALTER TABLE public.panhadores
  ADD COLUMN IF NOT EXISTS bag_numero text,
  ADD COLUMN IF NOT EXISTS bag_semana text,
  ADD COLUMN IF NOT EXISTS bag_atualizado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_panhadores_empresa_bag_numero
  ON public.panhadores(empresa_id, bag_numero);

COMMIT;
