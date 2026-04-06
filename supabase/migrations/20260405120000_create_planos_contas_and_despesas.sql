BEGIN;

-- Planos de contas (por empresa)
CREATE TABLE IF NOT EXISTS public.planos_contas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL,
  nome text NOT NULL,
  nome_lower text GENERATED ALWAYS AS (lower(trim(nome))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planos_contas
  ADD CONSTRAINT planos_contas_empresa_id_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;

ALTER TABLE public.planos_contas
  ADD CONSTRAINT planos_contas_empresa_nome_unique UNIQUE (empresa_id, nome_lower);

ALTER TABLE public.planos_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da empresa podem ver planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem criar planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar planos de contas" ON public.planos_contas;

CREATE POLICY "Membros da empresa podem ver planos de contas"
  ON public.planos_contas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar planos de contas"
  ON public.planos_contas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar planos de contas"
  ON public.planos_contas FOR UPDATE
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

CREATE POLICY "Membros da empresa podem deletar planos de contas"
  ON public.planos_contas FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE TRIGGER update_planos_contas_updated_at
  BEFORE UPDATE ON public.planos_contas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_planos_contas_empresa_id ON public.planos_contas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_planos_contas_nome_lower ON public.planos_contas(empresa_id, nome_lower);

-- Seed: planos padrão por empresa
INSERT INTO public.planos_contas (empresa_id, nome)
SELECT e.id, v.nome
FROM public.empresas e
CROSS JOIN (
  VALUES
    ('Pagamento de panha'),
    ('Combustível'),
    ('Despesas gerais'),
    ('Aluguel'),
    ('Energia elétrica'),
    ('Peças e reparo'),
    ('Maquinário')
) AS v(nome)
ON CONFLICT ON CONSTRAINT planos_contas_empresa_nome_unique DO NOTHING;


-- Despesas
CREATE TABLE IF NOT EXISTS public.despesas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL,
  criado_por uuid NOT NULL,
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  tipo_servico text NULL,
  plano_conta_id uuid NOT NULL,
  pagamento_metodo text NULL,
  colheita_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_empresa_id_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE public.despesas
    ADD CONSTRAINT despesas_criado_por_fkey
      FOREIGN KEY (criado_por) REFERENCES public.profiles(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_plano_conta_id_fkey
    FOREIGN KEY (plano_conta_id) REFERENCES public.planos_contas(id) ON DELETE RESTRICT;

ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_colheita_id_fkey
    FOREIGN KEY (colheita_id) REFERENCES public.colheitas(id) ON DELETE CASCADE;

-- Um pagamento de colheita gera no máximo 1 despesa espelhada
CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_colheita_id_unique
  ON public.despesas(colheita_id)
  WHERE colheita_id IS NOT NULL;

-- Validações
ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_valor_check CHECK (valor > 0);

DO $$
BEGIN
  ALTER TABLE public.despesas
    ADD CONSTRAINT despesas_pagamento_metodo_check
    CHECK (
      pagamento_metodo IS NULL
      OR pagamento_metodo IN ('dinheiro', 'pix', 'cartao', 'cheque')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da empresa podem ver despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem criar despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar despesas" ON public.despesas;

CREATE POLICY "Membros da empresa podem ver despesas"
  ON public.despesas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar despesas"
  ON public.despesas FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
      AND criado_por = auth.uid()
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar despesas"
  ON public.despesas FOR UPDATE
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.empresas_usuarios eu
        WHERE eu.empresa_id = empresa_id
          AND eu.user_id = auth.uid()
          AND eu.ativo = true
      )
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
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem deletar despesas"
  ON public.despesas FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE TRIGGER update_despesas_updated_at
  BEFORE UPDATE ON public.despesas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_despesas_empresa_data ON public.despesas(empresa_id, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_despesas_empresa_plano ON public.despesas(empresa_id, plano_conta_id);

COMMIT;
