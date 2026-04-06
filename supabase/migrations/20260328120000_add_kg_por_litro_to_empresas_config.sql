BEGIN;

-- Adiciona um fator de conversão para litros (kg por litro).
-- OBS: a densidade varia por produto/umidade, então deixamos configurável.
ALTER TABLE public.empresas_config
  ADD COLUMN IF NOT EXISTS kg_por_litro numeric(10,4) NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empresas_config_kg_por_litro_check'
  ) THEN
    ALTER TABLE public.empresas_config
      ADD CONSTRAINT empresas_config_kg_por_litro_check CHECK (kg_por_litro > 0);
  END IF;
END $$;

COMMIT;
