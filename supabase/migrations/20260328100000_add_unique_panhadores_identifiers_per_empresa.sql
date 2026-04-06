BEGIN;

-- Normaliza dados existentes para evitar duplicidade por formatação
UPDATE public.panhadores
SET cpf = NULLIF(regexp_replace(coalesce(cpf, ''), '\\D', '', 'g'), '')
WHERE cpf IS NOT NULL;

UPDATE public.panhadores
SET telefone = NULLIF(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '')
WHERE telefone IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'panhadores'
      AND column_name = 'bag_numero'
  ) THEN
    EXECUTE $$
      UPDATE public.panhadores
      SET bag_numero = NULLIF(btrim(coalesce(bag_numero, '')), '')
      WHERE bag_numero IS NOT NULL
    $$;
  END IF;
END $$;

-- Bloqueia migração se já existirem duplicidades por empresa
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.panhadores
    WHERE cpf IS NOT NULL AND cpf <> ''
    GROUP BY empresa_id, cpf
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade detectada: existe mais de 1 panhador com o mesmo CPF na mesma empresa. Corrija antes de aplicar a constraint.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.panhadores
    WHERE telefone IS NOT NULL AND telefone <> ''
    GROUP BY empresa_id, telefone
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade detectada: existe mais de 1 panhador com o mesmo telefone na mesma empresa. Corrija antes de aplicar a constraint.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'panhadores'
      AND column_name = 'bag_numero'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.panhadores
      WHERE bag_numero IS NOT NULL AND bag_numero <> ''
      GROUP BY empresa_id, lower(bag_numero)
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicidade detectada: existe mais de 1 panhador com o mesmo número de bag na mesma empresa. Corrija antes de aplicar a constraint.';
    END IF;
  END IF;
END $$;

-- Unicidade por empresa (permite null/vazio)
CREATE UNIQUE INDEX IF NOT EXISTS idx_panhadores_empresa_cpf_unique
  ON public.panhadores (empresa_id, cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_panhadores_empresa_telefone_unique
  ON public.panhadores (empresa_id, telefone)
  WHERE telefone IS NOT NULL AND telefone <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'panhadores'
      AND column_name = 'bag_numero'
  ) THEN
    EXECUTE $$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_panhadores_empresa_bag_unique
        ON public.panhadores (empresa_id, lower(bag_numero))
        WHERE bag_numero IS NOT NULL AND bag_numero <> ''
    $$;
  END IF;
END $$;

COMMIT;
