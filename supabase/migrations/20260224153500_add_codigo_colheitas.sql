BEGIN;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS codigo TEXT;

UPDATE public.colheitas
SET codigo = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
WHERE codigo IS NULL;

ALTER TABLE public.colheitas
  ALTER COLUMN codigo SET NOT NULL,
  ALTER COLUMN codigo SET DEFAULT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));

CREATE UNIQUE INDEX IF NOT EXISTS colheitas_codigo_key
  ON public.colheitas(codigo);

COMMIT;
