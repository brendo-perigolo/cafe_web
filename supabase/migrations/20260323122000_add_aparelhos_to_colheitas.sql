BEGIN;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS aparelho_token TEXT;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS pendente_aparelho BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_colheitas_aparelho_token ON public.colheitas (aparelho_token);
CREATE INDEX IF NOT EXISTS idx_colheitas_pendente_aparelho ON public.colheitas (pendente_aparelho);

COMMIT;
