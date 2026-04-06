-- Permite que admins de uma empresa listem e atualizem vínculos (incluindo cargo)
-- sem permitir que um usuário comum se promova para admin.

DROP POLICY IF EXISTS "Acesso a vínculos" ON public.empresas_usuarios;
DROP POLICY IF EXISTS "Atualizar vínculos" ON public.empresas_usuarios;

CREATE POLICY "Acesso a vínculos"
  ON public.empresas_usuarios FOR SELECT
  USING (
    auth.uid() = user_id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.empresas_usuarios me
      WHERE me.user_id = auth.uid()
        AND me.empresa_id = empresas_usuarios.empresa_id
        AND me.ativo = true
        AND me.cargo = 'admin'
    )
  );

CREATE POLICY "Atualizar vínculos"
  ON public.empresas_usuarios FOR UPDATE
  USING (
    coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.empresas_usuarios me
      WHERE me.user_id = auth.uid()
        AND me.empresa_id = empresas_usuarios.empresa_id
        AND me.ativo = true
        AND me.cargo = 'admin'
    )
  )
  WITH CHECK (
    -- Master pode atualizar tudo
    coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'

    -- Admin pode atualizar registros da sua empresa, mas não pode "mover" o vínculo
    OR (
      EXISTS (
        SELECT 1
        FROM public.empresas_usuarios me
        WHERE me.user_id = auth.uid()
          AND me.empresa_id = empresas_usuarios.empresa_id
          AND me.ativo = true
          AND me.cargo = 'admin'
      )
      AND empresa_id = (SELECT eu.empresa_id FROM public.empresas_usuarios eu WHERE eu.id = empresas_usuarios.id)
      AND user_id = (SELECT eu.user_id FROM public.empresas_usuarios eu WHERE eu.id = empresas_usuarios.id)
    )

    -- Usuário comum só atualiza o próprio vínculo sem alterar cargo/empresa/user_id
    OR (
      auth.uid() = user_id
      AND cargo = (SELECT eu.cargo FROM public.empresas_usuarios eu WHERE eu.id = empresas_usuarios.id)
      AND empresa_id = (SELECT eu.empresa_id FROM public.empresas_usuarios eu WHERE eu.id = empresas_usuarios.id)
      AND user_id = (SELECT eu.user_id FROM public.empresas_usuarios eu WHERE eu.id = empresas_usuarios.id)
    )
  );
