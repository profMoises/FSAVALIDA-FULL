import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Perfil } from '@/lib/domain';

export type PerfilAtual = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  pasta_id: string | null;
  pasta_ids: string[];
  primeiro_acesso: boolean;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  profile: PerfilAtual | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type LinhaPerfil = Omit<PerfilAtual, 'pasta_ids'> & { vinculos: { pasta_id: string }[] };

async function carregarPerfil(userId: string): Promise<PerfilAtual | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, perfil, pasta_id, primeiro_acesso, vinculos:profile_pastas(pasta_id)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error('Não foi possível carregar o seu perfil.');
  if (!data) return null;
  const { vinculos, ...perfil } = data as LinhaPerfil;
  return { ...perfil, pasta_ids: vinculos.map((vinculo) => vinculo.pasta_id) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PerfilAtual | null>(null);

  useEffect(() => {
    let ativo = true;

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      (async () => {
        if (!ativo) return;
        setSession(novaSessao);

        if (!novaSessao) {
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          const perfil = await carregarPerfil(novaSessao.user.id);
          if (!ativo) return;
          if (!perfil) {
            await supabase.auth.signOut();
            return;
          }
          setProfile(perfil);

          supabase.functions.invoke('registrar-login').catch(() => {});
        } catch {
          if (ativo) setProfile(null);
        } finally {
          if (ativo) setLoading(false);
        }
      })();
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ loading, session, profile, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth precisa estar dentro de AuthProvider.');
  return contexto;
}
