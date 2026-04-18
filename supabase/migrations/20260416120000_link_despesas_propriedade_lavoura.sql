BEGIN;

-- Liga despesas (opcional) a propriedade e lavoura para análises futuras.
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS propriedade_id uuid,
  ADD COLUMN IF NOT EXISTS lavoura_id uuid;

DO $$
BEGIN
  ALTER TABLE public.despesas
    ADD CONSTRAINT despesas_propriedade_id_fkey
      FOREIGN KEY (propriedade_id) REFERENCES public.propriedades(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.despesas
    ADD CONSTRAINT despesas_lavoura_id_fkey
      FOREIGN KEY (lavoura_id) REFERENCES public.lavouras(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_despesas_propriedade_id ON public.despesas(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_despesas_lavoura_id ON public.despesas(lavoura_id);

COMMIT;
