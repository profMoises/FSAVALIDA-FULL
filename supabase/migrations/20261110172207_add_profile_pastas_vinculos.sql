/*
# Vínculo de múltiplas pastas para pedagogia e coordenação

1. New Tables
- `profile_pastas`: liga um perfil a uma ou mais pastas.
  - `profile_id` (uuid, references profiles, cascade on delete)
  - `pasta_id` (uuid, references pastas, cascade on delete)
  - `created_at` (timestamp)
  - Primary key (profile_id, pasta_id)

2. Data
- Vínculos existentes de pedagogia e coordenação em `profiles.pasta_id` são copiados para `profile_pastas`. Nada é apagado.

3. Security
- RLS enabled on `profile_pastas`.
- Grant SELECT to `authenticated` (the folder list is shared structure, like `pastas` and `profiles`).
- Grant SELECT, INSERT, DELETE to `service_role`: writes happen only in the admin-users edge function, which checks the caller is admin.
- No write policies for `authenticated`, so the browser cannot change links directly.
*/

CREATE TABLE IF NOT EXISTS public.profile_pastas (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pasta_id uuid NOT NULL REFERENCES public.pastas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, pasta_id)
);

CREATE INDEX IF NOT EXISTS profile_pastas_pasta_id_idx ON public.profile_pastas (pasta_id);

ALTER TABLE public.profile_pastas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profile_pastas TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.profile_pastas TO service_role;

DROP POLICY IF EXISTS "select_vinculos_pastas" ON public.profile_pastas;
CREATE POLICY "select_vinculos_pastas" ON public.profile_pastas FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.profile_pastas (profile_id, pasta_id)
SELECT id, pasta_id
FROM public.profiles
WHERE perfil IN ('pedagogia', 'coordenacao') AND pasta_id IS NOT NULL
ON CONFLICT DO NOTHING;
