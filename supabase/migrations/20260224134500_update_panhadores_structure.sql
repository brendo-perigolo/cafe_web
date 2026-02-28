BEGIN;

ALTER TABLE public.panhadores
  DROP COLUMN IF EXISTS preco_por_kg,
  ADD COLUMN IF NOT EXISTS apelido TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS empresa_id UUID;

WITH first_company AS (
  SELECT DISTINCT ON (user_id) user_id, empresa_id
  FROM public.empresas_usuarios
  WHERE ativo = true
  ORDER BY user_id, created_at DESC
)
UPDATE public.panhadores p
SET empresa_id = fc.empresa_id
FROM first_company fc
WHERE p.user_id = fc.user_id
  AND p.empresa_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.panhadores WHERE empresa_id IS NULL) THEN
    RAISE EXCEPTION 'Existem panhadores sem empresa associada. Atualize-os antes de aplicar esta migração.';
  ELSE
    ALTER TABLE public.panhadores
      ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.panhadores
    ADD CONSTRAINT panhadores_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios panhadores" ON public.panhadores;
DROP POLICY IF EXISTS "Usuários podem criar panhadores" ON public.panhadores;
DROP POLICY IF EXISTS "Usuários podem atualizar seus panhadores" ON public.panhadores;
DROP POLICY IF EXISTS "Usuários podem deletar seus panhadores" ON public.panhadores;

CREATE POLICY "Membros da empresa podem ver panhadores"
  ON public.panhadores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar panhadores"
  ON public.panhadores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar panhadores"
  ON public.panhadores FOR UPDATE
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

CREATE POLICY "Membros da empresa podem deletar panhadores"
  ON public.panhadores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE INDEX IF NOT EXISTS idx_panhadores_empresa_id ON public.panhadores(empresa_id);

COMMIT;
