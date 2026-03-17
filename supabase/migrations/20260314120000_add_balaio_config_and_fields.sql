BEGIN;

-- Se a base ainda não tiver a tabela de configurações por empresa, cria agora.
-- (Isso evita erro quando a migração anterior ainda não foi aplicada.)
CREATE TABLE IF NOT EXISTS public.empresas_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  kg_por_saco numeric(10,2) NOT NULL DEFAULT 60,
  preco_padrao_por_saco numeric(10,2) NOT NULL DEFAULT 50,
  kg_por_balaio numeric(10,2) NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_config_kg_por_saco_check CHECK (kg_por_saco > 0),
  CONSTRAINT empresas_config_preco_padrao_por_saco_check CHECK (preco_padrao_por_saco >= 0),
  CONSTRAINT empresas_config_kg_por_balaio_check CHECK (kg_por_balaio > 0)
);

-- Configuração por empresa: peso do balaio (kg)
ALTER TABLE public.empresas_config
  ADD COLUMN IF NOT EXISTS kg_por_balaio numeric(10,2) NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empresas_config_kg_por_balaio_check'
  ) THEN
    ALTER TABLE public.empresas_config
      ADD CONSTRAINT empresas_config_kg_por_balaio_check CHECK (kg_por_balaio > 0);
  END IF;
END $$;

-- Campos auxiliares na colheita (média de balaios e preço por balaio)
-- OBS: garantimos também as colunas de SACO, pois a função de cálculo usa ambas.
ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS quantidade_sacos numeric(12,4),
  ADD COLUMN IF NOT EXISTS preco_por_saco numeric(10,2),
  ADD COLUMN IF NOT EXISTS quantidade_balaios numeric(12,4),
  ADD COLUMN IF NOT EXISTS preco_por_balaio numeric(10,2),
  ADD COLUMN IF NOT EXISTS mostrar_balaio_no_ticket boolean NOT NULL DEFAULT false;

-- Atualiza trigger de cálculos (sacos + balaios)
CREATE OR REPLACE FUNCTION public.colheitas_calcular_sacos_e_valores()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg_kg_por_saco numeric(10,2);
  cfg_preco_padrao_por_saco numeric(10,2);
  cfg_kg_por_balaio numeric(10,2);
BEGIN
  -- Carrega configuração da empresa; se não existir, usa padrões.
  SELECT ec.kg_por_saco, ec.preco_padrao_por_saco, ec.kg_por_balaio
    INTO cfg_kg_por_saco, cfg_preco_padrao_por_saco, cfg_kg_por_balaio
  FROM public.empresas_config ec
  WHERE ec.empresa_id = NEW.empresa_id;

  IF cfg_kg_por_saco IS NULL THEN
    cfg_kg_por_saco := 60;
  END IF;

  IF cfg_preco_padrao_por_saco IS NULL THEN
    cfg_preco_padrao_por_saco := 50;
  END IF;

  IF cfg_kg_por_balaio IS NULL THEN
    cfg_kg_por_balaio := 15;
  END IF;

  IF cfg_kg_por_saco <= 0 THEN
    RAISE EXCEPTION 'kg_por_saco inválido para a empresa %', NEW.empresa_id;
  END IF;

  IF cfg_kg_por_balaio <= 0 THEN
    RAISE EXCEPTION 'kg_por_balaio inválido para a empresa %', NEW.empresa_id;
  END IF;

  -- Quantidade de sacos sempre deriva do peso em kg.
  IF NEW.peso_kg IS NOT NULL THEN
    NEW.quantidade_sacos := round((NEW.peso_kg / cfg_kg_por_saco)::numeric, 4);
    NEW.quantidade_balaios := round((NEW.peso_kg / cfg_kg_por_balaio)::numeric, 4);
  END IF;

  -- Normaliza preços: mantém preco_por_kg, preco_por_saco e preco_por_balaio preenchidos.
  IF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NULL AND NEW.preco_por_balaio IS NULL THEN
    NEW.preco_por_saco := cfg_preco_padrao_por_saco;
    NEW.preco_por_kg := round((cfg_preco_padrao_por_saco / cfg_kg_por_saco)::numeric, 2);
    NEW.preco_por_balaio := round((NEW.preco_por_kg * cfg_kg_por_balaio)::numeric, 2);
  ELSIF NEW.preco_por_kg IS NOT NULL THEN
    IF NEW.preco_por_saco IS NULL THEN
      NEW.preco_por_saco := round((NEW.preco_por_kg * cfg_kg_por_saco)::numeric, 2);
    END IF;
    IF NEW.preco_por_balaio IS NULL THEN
      NEW.preco_por_balaio := round((NEW.preco_por_kg * cfg_kg_por_balaio)::numeric, 2);
    END IF;
  ELSIF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NOT NULL THEN
    NEW.preco_por_kg := round((NEW.preco_por_saco / cfg_kg_por_saco)::numeric, 2);
    IF NEW.preco_por_balaio IS NULL THEN
      NEW.preco_por_balaio := round((NEW.preco_por_kg * cfg_kg_por_balaio)::numeric, 2);
    END IF;
  ELSIF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NULL AND NEW.preco_por_balaio IS NOT NULL THEN
    NEW.preco_por_kg := round((NEW.preco_por_balaio / cfg_kg_por_balaio)::numeric, 2);
    NEW.preco_por_saco := round((NEW.preco_por_kg * cfg_kg_por_saco)::numeric, 2);
  END IF;

  -- Calcula valor_total se não vier do app
  IF NEW.valor_total IS NULL AND NEW.preco_por_kg IS NOT NULL AND NEW.peso_kg IS NOT NULL THEN
    NEW.valor_total := round((NEW.peso_kg * NEW.preco_por_kg)::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

-- Garante o trigger mesmo se a migração anterior não tiver sido aplicada.
DROP TRIGGER IF EXISTS colheitas_calcular_sacos_e_valores ON public.colheitas;
CREATE TRIGGER colheitas_calcular_sacos_e_valores
  BEFORE INSERT OR UPDATE ON public.colheitas
  FOR EACH ROW
  EXECUTE FUNCTION public.colheitas_calcular_sacos_e_valores();

-- Garante uma linha padrão para empresas já existentes
INSERT INTO public.empresas_config (empresa_id)
SELECT e.id
FROM public.empresas e
ON CONFLICT (empresa_id) DO NOTHING;

COMMIT;
