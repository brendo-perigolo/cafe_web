BEGIN;

ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS empresa_id UUID;

WITH panhador_empresa AS (
  SELECT id AS panhador_id, empresa_id
  FROM public.panhadores
)
UPDATE public.colheitas c
SET empresa_id = pe.empresa_id
FROM panhador_empresa pe
WHERE c.panhador_id = pe.panhador_id
  AND c.empresa_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.colheitas WHERE empresa_id IS NULL) THEN
    RAISE EXCEPTION 'Existem colheitas sem empresa associada. Atualize-as antes de aplicar esta migração.';
  ELSE
    ALTER TABLE public.colheitas
      ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.colheitas
    ADD CONSTRAINT colheitas_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Usuários podem criar colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Usuários podem atualizar suas colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Usuários podem deletar suas colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem ver colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem criar colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar colheitas" ON public.colheitas;

CREATE POLICY "Membros da empresa podem ver colheitas"
  ON public.colheitas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar colheitas"
  ON public.colheitas FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
      AND user_id = auth.uid()
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar colheitas"
  ON public.colheitas FOR UPDATE
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
      AND user_id = auth.uid()
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
      AND user_id = auth.uid()
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem deletar colheitas"
  ON public.colheitas FOR DELETE
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
      AND user_id = auth.uid()
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE INDEX IF NOT EXISTS idx_colheitas_empresa_id ON public.colheitas(empresa_id);

COMMIT;
