BEGIN;

-- Configurações por empresa (média do saco + preço padrão por saco)
CREATE TABLE IF NOT EXISTS public.empresas_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  kg_por_saco numeric(10,2) NOT NULL DEFAULT 60,
  preco_padrao_por_saco numeric(10,2) NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_config_kg_por_saco_check CHECK (kg_por_saco > 0),
  CONSTRAINT empresas_config_preco_padrao_por_saco_check CHECK (preco_padrao_por_saco >= 0)
);

ALTER TABLE public.empresas_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros da empresa podem ver configuracoes" ON public.empresas_config;
DROP POLICY IF EXISTS "Membros da empresa podem criar configuracoes" ON public.empresas_config;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar configuracoes" ON public.empresas_config;
DROP POLICY IF EXISTS "Membros da empresa podem deletar configuracoes" ON public.empresas_config;

CREATE POLICY "Membros da empresa podem ver configuracoes"
  ON public.empresas_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem criar configuracoes"
  ON public.empresas_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    OR lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Membros da empresa podem atualizar configuracoes"
  ON public.empresas_config FOR UPDATE
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

CREATE POLICY "Membros da empresa podem deletar configuracoes"
  ON public.empresas_config FOR DELETE
  USING (
    lower(coalesce(auth.email(), '')) = 'brendoaperigolo@gmail.com'
  );

DROP TRIGGER IF EXISTS update_empresas_config_updated_at ON public.empresas_config;
CREATE TRIGGER update_empresas_config_updated_at
  BEFORE UPDATE ON public.empresas_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Garante uma linha padrão para empresas já existentes
INSERT INTO public.empresas_config (empresa_id)
SELECT e.id
FROM public.empresas e
ON CONFLICT (empresa_id) DO NOTHING;

-- Cria automaticamente a configuração padrão ao criar uma nova empresa
CREATE OR REPLACE FUNCTION public.empresas_insert_default_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.empresas_config (empresa_id)
  VALUES (NEW.id)
  ON CONFLICT (empresa_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_empresas_created_default_config ON public.empresas;
CREATE TRIGGER on_empresas_created_default_config
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.empresas_insert_default_config();

-- Campos calculados de saco/preço na colheita
ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS quantidade_sacos numeric(12,4),
  ADD COLUMN IF NOT EXISTS preco_por_saco numeric(10,2);

CREATE OR REPLACE FUNCTION public.colheitas_calcular_sacos_e_valores()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg_kg_por_saco numeric(10,2);
  cfg_preco_padrao_por_saco numeric(10,2);
BEGIN
  -- Carrega configuração da empresa; se não existir, usa padrões.
  SELECT ec.kg_por_saco, ec.preco_padrao_por_saco
    INTO cfg_kg_por_saco, cfg_preco_padrao_por_saco
  FROM public.empresas_config ec
  WHERE ec.empresa_id = NEW.empresa_id;

  IF cfg_kg_por_saco IS NULL THEN
    cfg_kg_por_saco := 60;
  END IF;

  IF cfg_preco_padrao_por_saco IS NULL THEN
    cfg_preco_padrao_por_saco := 50;
  END IF;

  IF cfg_kg_por_saco <= 0 THEN
    RAISE EXCEPTION 'kg_por_saco inválido para a empresa %', NEW.empresa_id;
  END IF;

  -- Quantidade de sacos sempre deriva do peso em kg.
  IF NEW.peso_kg IS NOT NULL THEN
    NEW.quantidade_sacos := round((NEW.peso_kg / cfg_kg_por_saco)::numeric, 4);
  END IF;

  -- Normaliza preços: sempre tentamos manter preco_por_kg e preco_por_saco preenchidos.
  IF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NULL THEN
    NEW.preco_por_saco := cfg_preco_padrao_por_saco;
    NEW.preco_por_kg := round((cfg_preco_padrao_por_saco / cfg_kg_por_saco)::numeric, 2);
  ELSIF NEW.preco_por_kg IS NOT NULL AND NEW.preco_por_saco IS NULL THEN
    NEW.preco_por_saco := round((NEW.preco_por_kg * cfg_kg_por_saco)::numeric, 2);
  ELSIF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NOT NULL THEN
    NEW.preco_por_kg := round((NEW.preco_por_saco / cfg_kg_por_saco)::numeric, 2);
  END IF;

  -- Calcula valor_total se não vier do app
  IF NEW.valor_total IS NULL AND NEW.preco_por_kg IS NOT NULL AND NEW.peso_kg IS NOT NULL THEN
    NEW.valor_total := round((NEW.peso_kg * NEW.preco_por_kg)::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS colheitas_calcular_sacos_e_valores ON public.colheitas;
CREATE TRIGGER colheitas_calcular_sacos_e_valores
  BEFORE INSERT OR UPDATE ON public.colheitas
  FOR EACH ROW
  EXECUTE FUNCTION public.colheitas_calcular_sacos_e_valores();

COMMIT;
