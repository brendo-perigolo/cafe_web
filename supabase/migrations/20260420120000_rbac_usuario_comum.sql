BEGIN;

-- RBAC objetivo:
-- - Usuário comum (cargo != 'admin'):
--   - pode lançar colheitas (somente do dia) e ver apenas as colheitas do dia criadas por ele
--   - pode ver/cadastrar panhadores e aparelhos (já cobertos por policies existentes)
--   - NÃO acessa financeiro/relatórios/configuração por UI; e no banco bloqueamos planos_contas/despesas
-- - Admin da empresa (cargo='admin'):
--   - pode ver todas as colheitas da empresa
--   - pode confirmar pagamento/editar/excluir (colheitas) e escrever histórico
-- - Master (e-mail fixo) tem acesso total.

-- =========
-- Empresas (evita vazamento de multi-tenant)
-- =========
DROP POLICY IF EXISTS "Usuários autenticados podem ver empresas" ON public.empresas;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir empresas" ON public.empresas;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar empresas" ON public.empresas;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar empresas" ON public.empresas;

CREATE POLICY "Ver empresas vinculadas"
  ON public.empresas FOR SELECT
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR EXISTS (
      SELECT 1
      FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = empresas.id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
  );

CREATE POLICY "Master pode inserir empresas"
  ON public.empresas FOR INSERT
  WITH CHECK (lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com'));

CREATE POLICY "Master pode atualizar empresas"
  ON public.empresas FOR UPDATE
  USING (lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com'))
  WITH CHECK (lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com'));

CREATE POLICY "Master pode deletar empresas"
  ON public.empresas FOR DELETE
  USING (lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com'));


-- =========
-- Colheitas (Movimentações)
-- =========
DROP POLICY IF EXISTS "Membros da empresa podem ver colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem criar colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar colheitas" ON public.colheitas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar colheitas" ON public.colheitas;

-- Admin/master: vê tudo da empresa
CREATE POLICY "Admins podem ver colheitas"
  ON public.colheitas FOR SELECT
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas.empresa_id)
  );

-- Usuário comum: vê somente o que ele lançou hoje
CREATE POLICY "Usuário vê colheitas próprias do dia"
  ON public.colheitas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = colheitas.empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    AND colheitas.user_id = auth.uid()
    AND (colheitas.data_colheita AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );

-- Admin/master: pode lançar (sem restrição de data), mas sempre para si mesmo.
CREATE POLICY "Admins podem criar colheitas"
  ON public.colheitas FOR INSERT
  WITH CHECK (
    (lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com') OR public.is_empresa_admin(colheitas.empresa_id))
    AND colheitas.user_id = auth.uid()
  );

-- Usuário comum: pode lançar somente do dia e para si
CREATE POLICY "Usuário cria colheitas do dia"
  ON public.colheitas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.empresas_usuarios eu
      WHERE eu.empresa_id = colheitas.empresa_id
        AND eu.user_id = auth.uid()
        AND eu.ativo = true
    )
    AND colheitas.user_id = auth.uid()
    AND (colheitas.data_colheita AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );

-- Somente admin/master pode atualizar/excluir colheitas
CREATE POLICY "Admins podem atualizar colheitas"
  ON public.colheitas FOR UPDATE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas.empresa_id)
  )
  WITH CHECK (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas.empresa_id)
  );

CREATE POLICY "Admins podem deletar colheitas"
  ON public.colheitas FOR DELETE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas.empresa_id)
  );


-- =========
-- Histórico de colheitas (audit)
-- =========
DROP POLICY IF EXISTS "Membros podem ver historico de colheitas" ON public.colheitas_historico;
DROP POLICY IF EXISTS "Membros podem inserir historico de colheitas" ON public.colheitas_historico;

CREATE POLICY "Admins podem ver historico de colheitas"
  ON public.colheitas_historico FOR SELECT
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas_historico.empresa_id)
  );

CREATE POLICY "Admins podem inserir historico de colheitas"
  ON public.colheitas_historico FOR INSERT
  WITH CHECK (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(colheitas_historico.empresa_id)
  );


-- =========
-- Financeiro (bloquear para usuário comum)
-- =========
DROP POLICY IF EXISTS "Membros da empresa podem ver planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem criar planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar planos de contas" ON public.planos_contas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar planos de contas" ON public.planos_contas;

CREATE POLICY "Admins podem ver planos de contas"
  ON public.planos_contas FOR SELECT
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(planos_contas.empresa_id)
  );

CREATE POLICY "Admins podem criar planos de contas"
  ON public.planos_contas FOR INSERT
  WITH CHECK (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(planos_contas.empresa_id)
  );

CREATE POLICY "Admins podem atualizar planos de contas"
  ON public.planos_contas FOR UPDATE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(planos_contas.empresa_id)
  )
  WITH CHECK (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(planos_contas.empresa_id)
  );

CREATE POLICY "Admins podem deletar planos de contas"
  ON public.planos_contas FOR DELETE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(planos_contas.empresa_id)
  );


DROP POLICY IF EXISTS "Membros da empresa podem ver despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem criar despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem atualizar despesas" ON public.despesas;
DROP POLICY IF EXISTS "Membros da empresa podem deletar despesas" ON public.despesas;

CREATE POLICY "Admins podem ver despesas"
  ON public.despesas FOR SELECT
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(despesas.empresa_id)
  );

CREATE POLICY "Admins podem criar despesas"
  ON public.despesas FOR INSERT
  WITH CHECK (
    (
      lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
      OR public.is_empresa_admin(despesas.empresa_id)
    )
    AND despesas.criado_por = auth.uid()
  );

CREATE POLICY "Admins podem atualizar despesas"
  ON public.despesas FOR UPDATE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(despesas.empresa_id)
  )
  WITH CHECK (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(despesas.empresa_id)
  );

CREATE POLICY "Admins podem deletar despesas"
  ON public.despesas FOR DELETE
  USING (
    lower(coalesce(auth.email(), '')) = lower('brendoaperigolo@gmail.com')
    OR public.is_empresa_admin(despesas.empresa_id)
  );

COMMIT;
