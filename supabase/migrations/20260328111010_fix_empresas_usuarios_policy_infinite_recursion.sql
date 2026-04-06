-- Corrige erro: infinite recursion detected in policy for relation "empresas_usuarios"
-- Motivo: policies que consultam a própria tabela (empresas_usuarios) dentro do USING/WITH CHECK
-- podem entrar em recursão. Aqui movemos a checagem de admin para uma função SECURITY DEFINER.

BEGIN;

DROP POLICY IF EXISTS "Acesso a vínculos" ON public.empresas_usuarios;
DROP POLICY IF EXISTS "Atualizar vínculos" ON public.empresas_usuarios;

-- Checa se o usuário atual é admin da empresa. SECURITY DEFINER evita recursão de RLS.
CREATE OR REPLACE FUNCTION public.is_empresa_admin(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresas_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.ativo = true
      AND eu.cargo = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_empresa_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_empresa_admin(uuid) TO authenticated;

CREATE POLICY "Acesso a vínculos"
  ON public.empresas_usuarios FOR SELECT
  USING (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
    OR public.is_empresa_admin(empresas_usuarios.empresa_id)
  );

CREATE POLICY "Atualizar vínculos"
  ON public.empresas_usuarios FOR UPDATE
  USING (
    coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
    OR auth.uid() = user_id
    OR public.is_empresa_admin(empresas_usuarios.empresa_id)
  )
  WITH CHECK (
    coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
    OR auth.uid() = user_id
    OR public.is_empresa_admin(empresas_usuarios.empresa_id)
  );

-- Garante que usuário comum não consegue se promover para admin e nem mudar vínculo de empresa/usuário.
CREATE OR REPLACE FUNCTION public.empresas_usuarios_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com');
  v_is_admin boolean := public.is_empresa_admin(OLD.empresa_id);
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido alterar empresa_id ou user_id.';
  END IF;

  IF NOT v_is_master AND NOT v_is_admin THEN
    IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN
      RAISE EXCEPTION 'Sem permissão para alterar cargo.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_usuarios_guard_update ON public.empresas_usuarios;
CREATE TRIGGER trg_empresas_usuarios_guard_update
BEFORE UPDATE ON public.empresas_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.empresas_usuarios_guard_update();

COMMIT;
