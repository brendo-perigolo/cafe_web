BEGIN;

CREATE TABLE IF NOT EXISTS public.colheitas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colheita_id uuid NOT NULL REFERENCES public.colheitas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dados jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colheitas_historico_colheita_id ON public.colheitas_historico(colheita_id);
CREATE INDEX IF NOT EXISTS idx_colheitas_historico_empresa_id ON public.colheitas_historico(empresa_id);

ALTER TABLE public.colheitas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros podem ver historico de colheitas" ON public.colheitas_historico;
DROP POLICY IF EXISTS "Membros podem inserir historico de colheitas" ON public.colheitas_historico;

CREATE POLICY "Membros podem ver historico de colheitas"
  ON public.colheitas_historico FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros podem inserir historico de colheitas"
  ON public.colheitas_historico FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

COMMIT;
