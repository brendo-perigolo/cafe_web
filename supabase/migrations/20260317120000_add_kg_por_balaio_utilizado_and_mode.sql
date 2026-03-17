BEGIN;

-- Garante existência da tabela de configurações (para bases incompletas).
CREATE TABLE IF NOT EXISTS public.empresas_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  kg_por_saco numeric(10,2) NOT NULL DEFAULT 60,
  preco_padrao_por_saco numeric(10,2) NOT NULL DEFAULT 50,
  kg_por_balaio numeric(10,2) NOT NULL DEFAULT 15,
  usar_kg_por_balaio_padrao boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_config_kg_por_saco_check CHECK (kg_por_saco > 0),
  CONSTRAINT empresas_config_preco_padrao_por_saco_check CHECK (preco_padrao_por_saco >= 0),
  CONSTRAINT empresas_config_kg_por_balaio_check CHECK (kg_por_balaio > 0)
);

-- Configuração: definir se o lançamento deve usar o kg/balaio padrão (true)
-- ou exigir preenchimento manual no lançamento (false).
ALTER TABLE public.empresas_config
  ADD COLUMN IF NOT EXISTS usar_kg_por_balaio_padrao boolean NOT NULL DEFAULT true;

-- Salva o kg/balaio efetivamente utilizado no lançamento (para histórico e consistência).
ALTER TABLE public.colheitas
  ADD COLUMN IF NOT EXISTS kg_por_balaio_utilizado numeric(10,2);

-- Atualiza trigger de cálculos (sacos + balaios) para usar o kg/balaio do lançamento quando informado.
CREATE OR REPLACE FUNCTION public.colheitas_calcular_sacos_e_valores()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg_kg_por_saco numeric(10,2);
  cfg_preco_padrao_por_saco numeric(10,2);
  cfg_kg_por_balaio numeric(10,2);
  cfg_usar_padrao boolean;
  eff_kg_por_balaio numeric(10,2);
BEGIN
  -- Carrega configuração da empresa; se não existir, usa padrões.
  SELECT ec.kg_por_saco, ec.preco_padrao_por_saco, ec.kg_por_balaio, ec.usar_kg_por_balaio_padrao
    INTO cfg_kg_por_saco, cfg_preco_padrao_por_saco, cfg_kg_por_balaio, cfg_usar_padrao
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

  IF cfg_usar_padrao IS NULL THEN
    cfg_usar_padrao := true;
  END IF;

  IF cfg_kg_por_saco <= 0 THEN
    RAISE EXCEPTION 'kg_por_saco inválido para a empresa %', NEW.empresa_id;
  END IF;

  IF cfg_usar_padrao = false THEN
    IF NEW.kg_por_balaio_utilizado IS NULL THEN
      RAISE EXCEPTION 'Informe o peso médio do balaio (kg) no lançamento para a empresa %', NEW.empresa_id;
    END IF;
    eff_kg_por_balaio := NEW.kg_por_balaio_utilizado;
  ELSE
    eff_kg_por_balaio := COALESCE(NEW.kg_por_balaio_utilizado, cfg_kg_por_balaio);
  END IF;

  IF eff_kg_por_balaio IS NULL THEN
    eff_kg_por_balaio := 15;
  END IF;

  IF eff_kg_por_balaio <= 0 THEN
    RAISE EXCEPTION 'kg_por_balaio inválido para a empresa %', NEW.empresa_id;
  END IF;

  -- Garante persistir o kg/balaio efetivo usado no lançamento.
  NEW.kg_por_balaio_utilizado := eff_kg_por_balaio;

  -- Quantidade de sacos e balaios sempre derivam do peso em kg.
  IF NEW.peso_kg IS NOT NULL THEN
    NEW.quantidade_sacos := round((NEW.peso_kg / cfg_kg_por_saco)::numeric, 4);
    NEW.quantidade_balaios := round((NEW.peso_kg / eff_kg_por_balaio)::numeric, 4);
  END IF;

  -- Normaliza preços: mantém preco_por_kg, preco_por_saco e preco_por_balaio preenchidos.
  IF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NULL AND NEW.preco_por_balaio IS NULL THEN
    NEW.preco_por_saco := cfg_preco_padrao_por_saco;
    NEW.preco_por_kg := round((cfg_preco_padrao_por_saco / cfg_kg_por_saco)::numeric, 2);
    NEW.preco_por_balaio := round((NEW.preco_por_kg * eff_kg_por_balaio)::numeric, 2);
  ELSIF NEW.preco_por_kg IS NOT NULL THEN
    IF NEW.preco_por_saco IS NULL THEN
      NEW.preco_por_saco := round((NEW.preco_por_kg * cfg_kg_por_saco)::numeric, 2);
    END IF;
    IF NEW.preco_por_balaio IS NULL THEN
      NEW.preco_por_balaio := round((NEW.preco_por_kg * eff_kg_por_balaio)::numeric, 2);
    END IF;
  ELSIF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NOT NULL THEN
    NEW.preco_por_kg := round((NEW.preco_por_saco / cfg_kg_por_saco)::numeric, 2);
    IF NEW.preco_por_balaio IS NULL THEN
      NEW.preco_por_balaio := round((NEW.preco_por_kg * eff_kg_por_balaio)::numeric, 2);
    END IF;
  ELSIF NEW.preco_por_kg IS NULL AND NEW.preco_por_saco IS NULL AND NEW.preco_por_balaio IS NOT NULL THEN
    NEW.preco_por_kg := round((NEW.preco_por_balaio / eff_kg_por_balaio)::numeric, 2);
    NEW.preco_por_saco := round((NEW.preco_por_kg * cfg_kg_por_saco)::numeric, 2);
  END IF;

  -- Calcula valor_total se não vier do app
  IF NEW.valor_total IS NULL AND NEW.preco_por_balaio IS NOT NULL AND NEW.quantidade_balaios IS NOT NULL THEN
    NEW.valor_total := round((NEW.quantidade_balaios * NEW.preco_por_balaio)::numeric, 2);
  ELSIF NEW.valor_total IS NULL AND NEW.preco_por_kg IS NOT NULL AND NEW.peso_kg IS NOT NULL THEN
    NEW.valor_total := round((NEW.peso_kg * NEW.preco_por_kg)::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

-- Garante o trigger.
DROP TRIGGER IF EXISTS colheitas_calcular_sacos_e_valores ON public.colheitas;
CREATE TRIGGER colheitas_calcular_sacos_e_valores
  BEFORE INSERT OR UPDATE ON public.colheitas
  FOR EACH ROW
  EXECUTE FUNCTION public.colheitas_calcular_sacos_e_valores();

COMMIT;
