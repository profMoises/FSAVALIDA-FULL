import { useState, type FormEvent } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { BTN_PRIMARY, INPUT, LABEL } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const entrar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro('E-mail ou senha incorretos.');
    setEntrando(false);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-teal-50/80 via-slate-50 to-slate-50 px-4 py-12 animate-fade-in">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-teal-200/30 blur-3xl" />

      <div className="relative w-full max-w-md text-center">
        <BrandLogo className="mx-auto h-20 w-auto" />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">Validação de Planos de Aula</h1>
        <p className="mt-2 text-sm text-slate-500">Entre com o usuário fornecido pela administração.</p>

        <form onSubmit={entrar} className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-left shadow-sm">
          <div>
            <label htmlFor="email" className={LABEL}>
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@escola.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="mt-5">
            <label htmlFor="senha" className={LABEL}>
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={INPUT}
            />
          </div>

          {erro && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}

          <button type="submit" disabled={entrando} className={`${BTN_PRIMARY} mt-6 h-11 w-full`}>
            {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Entrar
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Não há cadastro público. Em caso de dúvida, procure a administração.
        </p>
      </div>
    </div>
  );
}
