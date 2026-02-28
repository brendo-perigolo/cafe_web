-- Tabela de vínculo entre usuários e empresas
CREATE TABLE public.empresas_usuarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cargo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus vínculos"
  ON public.empresas_usuarios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam seus vínculos"
  ON public.empresas_usuarios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam seus vínculos"
  ON public.empresas_usuarios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_empresas_usuarios_empresa ON public.empresas_usuarios (empresa_id);
CREATE INDEX idx_empresas_usuarios_user ON public.empresas_usuarios (user_id);
CREATE INDEX idx_empresas_usuarios_ativo ON public.empresas_usuarios (ativo);
