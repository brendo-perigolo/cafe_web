BEGIN;

-- Propriedades (fazendas/sítios) por empresa.
CREATE TABLE IF NOT EXISTS public.propriedades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text,
  endereco text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da empresa podem ver propriedades" ON public.propriedades;
DROP POLICY IF EXISTS "Membros da empresa podem criar propriedades" ON public.propriedades;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar propriedades" ON public.propriedades;
DROP POLICY IF EXISTS "Membros da empresa podem deletar propriedades" ON public.propriedades;

CREATE POLICY "Membros da empresa podem ver propriedades"
  ON public.propriedades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar propriedades"
  ON public.propriedades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar propriedades"
  ON public.propriedades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem deletar propriedades"
  ON public.propriedades FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

DROP TRIGGER IF EXISTS update_propriedades_updated_at ON public.propriedades;
CREATE TRIGGER update_propriedades_updated_at
  BEFORE UPDATE ON public.propriedades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_propriedades_empresa_id ON public.propriedades(empresa_id);
CREATE INDEX IF NOT EXISTS idx_propriedades_nome ON public.propriedades(nome);

-- Lavouras por propriedade.
CREATE TABLE IF NOT EXISTS public.lavouras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  propriedade_id uuid NOT NULL REFERENCES public.propriedades(id) ON DELETE CASCADE,
  nome text NOT NULL,
  quantidade_pe_de_cafe integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lavouras_quantidade_pe_de_cafe_check CHECK (quantidade_pe_de_cafe >= 0)
);

ALTER TABLE public.lavouras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da empresa podem ver lavouras" ON public.lavouras;
DROP POLICY IF EXISTS "Membros da empresa podem criar lavouras" ON public.lavouras;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar lavouras" ON public.lavouras;
DROP POLICY IF EXISTS "Membros da empresa podem deletar lavouras" ON public.lavouras;

CREATE POLICY "Membros da empresa podem ver lavouras"
  ON public.lavouras FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar lavouras"
  ON public.lavouras FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar lavouras"
  ON public.lavouras FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem deletar lavouras"
  ON public.lavouras FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

DROP TRIGGER IF EXISTS update_lavouras_updated_at ON public.lavouras;
CREATE TRIGGER update_lavouras_updated_at
  BEFORE UPDATE ON public.lavouras
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lavouras_empresa_id ON public.lavouras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lavouras_propriedade_id ON public.lavouras(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_lavouras_nome ON public.lavouras(nome);

-- Garante opções padrão ("padrao") por empresa.
INSERT INTO public.propriedades (empresa_id, nome)
SELECT e.id, 'padrao'
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.propriedades p
  WHERE p.empresa_id = e.id
    AND lower(coalesce(p.nome, '')) = 'padrao'
);

INSERT INTO public.lavouras (empresa_id, propriedade_id, nome, quantidade_pe_de_cafe)
SELECT p.empresa_id, p.id, 'padrao', 0
FROM public.propriedades p
WHERE lower(coalesce(p.nome, '')) = 'padrao'
  AND NOT EXISTS (
    SELECT 1 FROM public.lavouras l
    WHERE l.propriedade_id = p.id
      AND lower(l.nome) = 'padrao'
  );

-- Liga colheitas a propriedade/lavoura.
ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS propriedade_id uuid;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS lavoura_id uuid;

-- Preenche registros existentes com a opção "padrao".
UPDATE public.colheitas c
SET propriedade_id = p.id
FROM public.propriedades p
WHERE c.propriedade_id IS NULL
  AND p.empresa_id = c.empresa_id
  AND lower(coalesce(p.nome, '')) = 'padrao';

UPDATE public.colheitas c
SET lavoura_id = l.id
FROM public.lavouras l
WHERE c.lavoura_id IS NULL
  AND l.empresa_id = c.empresa_id
  AND l.propriedade_id = c.propriedade_id
  AND lower(l.nome) = 'padrao';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.colheitas WHERE propriedade_id IS NULL OR lavoura_id IS NULL) THEN
    RAISE EXCEPTION 'Existem colheitas sem propriedade/lavoura associada (padrao).';
  END IF;
END $$;

ALTER TABLE public.colheitas
  ALTER COLUMN propriedade_id SET NOT NULL;

ALTER TABLE public.colheitas
  ALTER COLUMN lavoura_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_propriedade_id_fkey
      FOREIGN KEY (propriedade_id) REFERENCES public.propriedades(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_lavoura_id_fkey
      FOREIGN KEY (lavoura_id) REFERENCES public.lavouras(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_colheitas_propriedade_id ON public.colheitas(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_colheitas_lavoura_id ON public.colheitas(lavoura_id);

-- Trigger para não deixar em branco: se não enviar propriedade/lavoura, usa/cria "padrao".
CREATE OR REPLACE FUNCTION public.colheitas_set_default_propriedade_lavoura()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prop_id uuid;
  lav_id uuid;
BEGIN
  -- Se lavoura veio, mas propriedade não, deriva propriedade.
  IF NEW.lavoura_id IS NOT NULL AND NEW.propriedade_id IS NULL THEN
    SELECT l.propriedade_id INTO prop_id
    FROM public.lavouras l
    WHERE l.id = NEW.lavoura_id;
    NEW.propriedade_id := prop_id;
  END IF;

  IF NEW.propriedade_id IS NULL THEN
    SELECT p.id INTO prop_id
    FROM public.propriedades p
    WHERE p.empresa_id = NEW.empresa_id
      AND lower(coalesce(p.nome, '')) = 'padrao'
    ORDER BY p.created_at
    LIMIT 1;

    IF prop_id IS NULL THEN
      INSERT INTO public.propriedades (empresa_id, nome)
      VALUES (NEW.empresa_id, 'padrao')
      RETURNING id INTO prop_id;
    END IF;

    NEW.propriedade_id := prop_id;
  END IF;

  IF NEW.lavoura_id IS NULL THEN
    SELECT l.id INTO lav_id
    FROM public.lavouras l
    WHERE l.empresa_id = NEW.empresa_id
      AND l.propriedade_id = NEW.propriedade_id
      AND lower(l.nome) = 'padrao'
    ORDER BY l.created_at
    LIMIT 1;

    IF lav_id IS NULL THEN
      INSERT INTO public.lavouras (empresa_id, propriedade_id, nome, quantidade_pe_de_cafe)
      VALUES (NEW.empresa_id, NEW.propriedade_id, 'padrao', 0)
      RETURNING id INTO lav_id;
    END IF;

    NEW.lavoura_id := lav_id;
  END IF;

  -- Valida vínculo/empresa (evita cruzar empresa ou propriedade incorreta).
  PERFORM 1
  FROM public.propriedades p
  WHERE p.id = NEW.propriedade_id
    AND p.empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propriedade inválida para a empresa %', NEW.empresa_id;
  END IF;

  PERFORM 1
  FROM public.lavouras l
  WHERE l.id = NEW.lavoura_id
    AND l.empresa_id = NEW.empresa_id
    AND l.propriedade_id = NEW.propriedade_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lavoura inválida para a propriedade %', NEW.propriedade_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_colheitas_set_default_propriedade_lavoura ON public.colheitas;
CREATE TRIGGER aa_colheitas_set_default_propriedade_lavoura
  BEFORE INSERT OR UPDATE ON public.colheitas
  FOR EACH ROW
  EXECUTE FUNCTION public.colheitas_set_default_propriedade_lavoura();

COMMIT;
