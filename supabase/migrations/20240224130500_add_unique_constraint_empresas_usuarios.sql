ALTER TABLE public.empresas_usuarios
  ADD CONSTRAINT empresas_usuarios_empresa_user_unique UNIQUE (empresa_id, user_id);
