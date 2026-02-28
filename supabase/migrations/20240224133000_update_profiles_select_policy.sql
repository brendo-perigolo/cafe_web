DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.profiles;

CREATE POLICY "Perfil próprio ou master"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR coalesce(auth.email(), '') = 'brendoaperigolo@gmail.com'
  );
