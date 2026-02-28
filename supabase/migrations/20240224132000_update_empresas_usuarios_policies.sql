DROP POLICY IF EXISTS "Usuários veem seus vínculos" ON public.empresas_usuarios;
DROP POLICY IF EXISTS "Usuários criam seus vínculos" ON public.empresas_usuarios;
DROP POLICY IF EXISTS "Usuários atualizam seus vínculos" ON public.empresas_usuarios;

CREATE POLICY "Acesso a vínculos"
  ON public.empresas_usuarios FOR SELECT
  USING (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Gerenciar vínculos"
  ON public.empresas_usuarios FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
  );

CREATE POLICY "Atualizar vínculos"
  ON public.empresas_usuarios FOR UPDATE
  USING (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
  );
