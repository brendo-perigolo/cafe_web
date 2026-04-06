BEGIN;

-- Inclui 'cartao' como método válido (mantém retrocompatibilidade com cheque)
DO $$
BEGIN
  ALTER TABLE public.colheitas
    DROP CONSTRAINT IF EXISTS colheitas_pagamento_metodo_check;

  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_pagamento_metodo_check
    CHECK (
      pagamento_metodo IS NULL
      OR pagamento_metodo IN ('dinheiro', 'pix', 'cartao', 'cheque')
    );
END $$;

COMMIT;
