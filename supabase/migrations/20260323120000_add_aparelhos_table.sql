-- Tabela de aparelhos (equipamentos/dispositivos)
-- Guarda token de identificação única, nome e status (ativo/inativo)
CREATE TABLE IF NOT EXISTS public.aparelhos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.aparelhos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aparelhos
  ADD CONSTRAINT aparelhos_token_unique UNIQUE (token);

CREATE POLICY "Usuários autenticados podem ver aparelhos"
  ON public.aparelhos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem inserir aparelhos"
  ON public.aparelhos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar aparelhos"
  ON public.aparelhos FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem deletar aparelhos"
  ON public.aparelhos FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_aparelhos_updated_at
  BEFORE UPDATE ON public.aparelhos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_aparelhos_nome ON public.aparelhos (nome);
CREATE INDEX idx_aparelhos_ativo ON public.aparelhos (ativo);
