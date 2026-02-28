BEGIN;

ALTER TABLE public.colheitas_historico
  DROP CONSTRAINT IF EXISTS colheitas_historico_user_id_fkey;

ALTER TABLE public.colheitas_historico
  ADD CONSTRAINT colheitas_historico_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMIT;
