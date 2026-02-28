-- Criar tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Usuários podem ver seu próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem inserir seu próprio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Criar tabela de panhadores
CREATE TABLE public.panhadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  preco_por_kg DECIMAL(10,2) NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.panhadores ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para panhadores
CREATE POLICY "Usuários podem ver seus próprios panhadores"
  ON public.panhadores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar panhadores"
  ON public.panhadores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus panhadores"
  ON public.panhadores FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus panhadores"
  ON public.panhadores FOR DELETE
  USING (auth.uid() = user_id);

-- Criar tabela de colheitas
CREATE TABLE public.colheitas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  peso_kg DECIMAL(10,2) NOT NULL,
  preco_por_kg DECIMAL(10,2) NOT NULL,
  valor_total DECIMAL(10,2) NOT NULL,
  panhador_id UUID NOT NULL REFERENCES public.panhadores(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data_colheita TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sincronizado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.colheitas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para colheitas
CREATE POLICY "Usuários podem ver suas próprias colheitas"
  ON public.colheitas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar colheitas"
  ON public.colheitas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas colheitas"
  ON public.colheitas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas colheitas"
  ON public.colheitas FOR DELETE
  USING (auth.uid() = user_id);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers para atualizar updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_panhadores_updated_at
  BEFORE UPDATE ON public.panhadores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_colheitas_updated_at
  BEFORE UPDATE ON public.colheitas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para criar perfil automaticamente ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Índices para performance
CREATE INDEX idx_panhadores_user_id ON public.panhadores(user_id);
CREATE INDEX idx_panhadores_ativo ON public.panhadores(ativo);
CREATE INDEX idx_colheitas_user_id ON public.colheitas(user_id);
CREATE INDEX idx_colheitas_panhador_id ON public.colheitas(panhador_id);
CREATE INDEX idx_colheitas_data ON public.colheitas(data_colheita);
CREATE INDEX idx_colheitas_sincronizado ON public.colheitas(sincronizado);