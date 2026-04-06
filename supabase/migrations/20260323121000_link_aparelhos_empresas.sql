BEGIN;

ALTER TABLE public.aparelhos
  ADD COLUMN IF NOT EXISTS empresa_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.aparelhos WHERE empresa_id IS NULL) THEN
    RAISE NOTICE 'Existem aparelhos sem empresa associada; mantendo empresa_id como NULL até regularização.';
  ELSE
    ALTER TABLE public.aparelhos
      ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.aparelhos
    ADD CONSTRAINT aparelhos_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.aparelhos
  DROP CONSTRAINT IF EXISTS aparelhos_token_unique;

DO $$
BEGIN
  ALTER TABLE public.aparelhos
    ADD CONSTRAINT aparelhos_empresa_token_unique UNIQUE (empresa_id, token);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Usuários autenticados podem ver aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Membros da empresa podem ver aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Membros da empresa podem criar aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar aparelhos" ON public.aparelhos;
DROP POLICY IF EXISTS "Membros da empresa podem deletar aparelhos" ON public.aparelhos;

CREATE POLICY "Membros da empresa podem ver aparelhos"
  ON public.aparelhos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar aparelhos"
  ON public.aparelhos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar aparelhos"
  ON public.aparelhos FOR UPDATE
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

CREATE POLICY "Membros da empresa podem deletar aparelhos"
  ON public.aparelhos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE INDEX IF NOT EXISTS idx_aparelhos_empresa_id ON public.aparelhos (empresa_id);

COMMIT;
