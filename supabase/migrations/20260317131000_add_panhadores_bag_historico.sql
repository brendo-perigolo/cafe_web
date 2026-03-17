BEGIN;

-- Histórico de alterações de bag vinculada ao panhador.
CREATE TABLE IF NOT EXISTS public.panhadores_bag_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  panhador_id uuid NOT NULL REFERENCES public.panhadores(id) ON DELETE CASCADE,
  bag_anterior text,
  bag_nova text,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por uuid,
  observacao text
);

-- FK opcional para quem alterou (se a tabela profiles existir no schema atual)
DO $$
BEGIN
  ALTER TABLE public.panhadores_bag_historico
    ADD CONSTRAINT panhadores_bag_historico_alterado_por_fkey
      FOREIGN KEY (alterado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_panhadores_bag_hist_empresa_em
  ON public.panhadores_bag_historico(empresa_id, alterado_em DESC);

CREATE INDEX IF NOT EXISTS idx_panhadores_bag_hist_panhador_em
  ON public.panhadores_bag_historico(panhador_id, alterado_em DESC);

COMMIT;
