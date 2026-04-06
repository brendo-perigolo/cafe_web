BEGIN;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS pagamento_metodo text;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS pagamento_cheque_numero text;

-- Restrição simples (valores conhecidos). Mantém compatível com null.
DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_pagamento_metodo_check
    CHECK (
      pagamento_metodo IS NULL
      OR pagamento_metodo IN ('dinheiro', 'pix', 'cheque')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cheque número: somente números quando informado
DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_pagamento_cheque_numero_check
    CHECK (
      pagamento_cheque_numero IS NULL
      OR pagamento_cheque_numero ~ '^[0-9]+$'
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_colheitas_pagamento_metodo ON public.colheitas(empresa_id, pagamento_metodo);

COMMIT;
