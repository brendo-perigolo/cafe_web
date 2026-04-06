BEGIN;

-- 1) Campos ativo/inativo
ALTER TABLE public.propriedades
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

ALTER TABLE public.lavouras
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_propriedades_empresa_ativo ON public.propriedades(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_lavouras_empresa_ativo ON public.lavouras(empresa_id, ativo);

-- 2) Regras de "padrao" por empresa
-- Convenção já existente: propriedade "padrao" por empresa e lavoura "padrao" dentro dela.
-- Nova regra:
-- - Se existir qualquer propriedade (da empresa) com nome != 'padrao' e ativo = true,
--   então a propriedade 'padrao' daquela empresa deve ficar ativo = false.
-- - Se NÃO existir nenhuma propriedade ativa != 'padrao', então 'padrao' deve ficar ativo = true.

CREATE OR REPLACE FUNCTION public.propriedades_sync_padrao_ativo_for_empresa(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  has_other_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.propriedades p
    WHERE p.empresa_id = p_empresa_id
      AND lower(coalesce(p.nome, '')) <> 'padrao'
      AND p.ativo = true
  )
  INTO has_other_active;

  UPDATE public.propriedades p
  SET ativo = (NOT has_other_active)
  WHERE p.empresa_id = p_empresa_id
    AND lower(coalesce(p.nome, '')) = 'padrao';
END;
$$;

-- Evita recursão: não atualize a própria tabela em trigger FOR EACH ROW.
-- Usamos um trigger STATEMENT-level que identifica as empresas afetadas.

CREATE OR REPLACE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_for_empresa(empresa_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  padrao_id uuid;
BEGIN
  IF empresa_uuid IS NULL THEN
    RETURN;
  END IF;

  -- garante que exista a propriedade 'padrao'
  SELECT p.id INTO padrao_id
  FROM public.propriedades p
  WHERE p.empresa_id = empresa_uuid
    AND lower(coalesce(p.nome, '')) = 'padrao'
  ORDER BY p.created_at
  LIMIT 1;

  IF padrao_id IS NULL THEN
    INSERT INTO public.propriedades (empresa_id, nome, ativo)
    VALUES (empresa_uuid, 'padrao', true)
    RETURNING id INTO padrao_id;

    -- garante também a lavoura 'padrao' dentro do padrao
    INSERT INTO public.lavouras (empresa_id, propriedade_id, nome, quantidade_pe_de_cafe, ativo)
    VALUES (empresa_uuid, padrao_id, 'padrao', 0, true);
  END IF;

  PERFORM public.propriedades_sync_padrao_ativo_for_empresa(empresa_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_ins_stmt()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN (SELECT DISTINCT empresa_id FROM new_table) LOOP
    PERFORM public.propriedades_ensure_padrao_exists_and_sync_for_empresa(r.empresa_id);
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_upd_stmt()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN (
    SELECT DISTINCT empresa_id FROM new_table
    UNION
    SELECT DISTINCT empresa_id FROM old_table
  ) LOOP
    PERFORM public.propriedades_ensure_padrao_exists_and_sync_for_empresa(r.empresa_id);
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_del_stmt()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN (SELECT DISTINCT empresa_id FROM old_table) LOOP
    PERFORM public.propriedades_ensure_padrao_exists_and_sync_for_empresa(r.empresa_id);
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ab_propriedades_ensure_padrao_exists_and_sync ON public.propriedades;

DROP TRIGGER IF EXISTS ab_propriedades_ensure_padrao_exists_and_sync_ins ON public.propriedades;
CREATE TRIGGER ab_propriedades_ensure_padrao_exists_and_sync_ins
  AFTER INSERT ON public.propriedades
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_ins_stmt();

DROP TRIGGER IF EXISTS ab_propriedades_ensure_padrao_exists_and_sync_upd ON public.propriedades;
CREATE TRIGGER ab_propriedades_ensure_padrao_exists_and_sync_upd
  AFTER UPDATE ON public.propriedades
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_upd_stmt();

DROP TRIGGER IF EXISTS ab_propriedades_ensure_padrao_exists_and_sync_del ON public.propriedades;
CREATE TRIGGER ab_propriedades_ensure_padrao_exists_and_sync_del
  AFTER DELETE ON public.propriedades
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.propriedades_ensure_padrao_exists_and_sync_del_stmt();

-- 3) Backfill: sincroniza todas as empresas existentes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (SELECT id FROM public.empresas) LOOP
    -- garante padrao caso alguma empresa antiga não tenha
    INSERT INTO public.propriedades (empresa_id, nome, ativo)
    SELECT r.id, 'padrao', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.propriedades p
      WHERE p.empresa_id = r.id
        AND lower(coalesce(p.nome, '')) = 'padrao'
    );

    PERFORM public.propriedades_sync_padrao_ativo_for_empresa(r.id);
  END LOOP;
END $$;

COMMIT;
