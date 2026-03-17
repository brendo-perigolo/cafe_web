BEGIN;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS pago_em timestamptz,
  ADD COLUMN IF NOT EXISTS pago_por uuid,
  ADD COLUMN IF NOT EXISTS pagamento_lote text;

-- FK opcional para quem confirmou (se a tabela profiles existir no schema atual)
DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_pago_por_fkey
      FOREIGN KEY (pago_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_colheitas_pago_em ON public.colheitas(pago_em);
CREATE INDEX IF NOT EXISTS idx_colheitas_pagamento_lote ON public.colheitas(pagamento_lote);

COMMIT;
