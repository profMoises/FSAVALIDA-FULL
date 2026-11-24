/*
# Remove privilégios do papel anônimo nas tabelas do aplicativo

1. Segurança
   - O papel `anon` (visitante não autenticado) tinha SELECT/INSERT/UPDATE/DELETE
     em todas as tabelas, embora nenhuma política o contemple. O acesso já era
     bloqueado pelo RLS, mas o privilégio é desnecessário e perigoso caso alguma
     política futura inclua `anon`.
   - O aplicativo exige login, portanto nada é revogado do papel `authenticated`.
*/

REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.pastas FROM anon;
REVOKE ALL ON public.profile_pastas FROM anon;
REVOKE ALL ON public.planos_aula FROM anon;
REVOKE ALL ON public.plano_interacoes FROM anon;
REVOKE ALL ON public.notificacoes_email FROM anon;
REVOKE ALL ON public.dashboard_config_prazos FROM anon;
