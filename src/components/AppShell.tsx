import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ClipboardList, FolderOpen, KeyRound, LayoutDashboard, Link2, LogOut, Users, CalendarClock, type LucideProps } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import { TrocaSenhaObrigatoriaModal } from '@/components/TrocaSenhaObrigatoriaModal';
import { PERFIL_LABEL, PERFIL_STYLE, type Perfil } from '@/lib/domain';
import type { PerfilAtual } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlanosPage } from '@/pages/PlanosPage';
import { PublicacoesPage } from '@/pages/PublicacoesPage';
import { PastasPage } from '@/pages/PastasPage';
import { UsuariosPage } from '@/pages/UsuariosPage';
import { ConfiguracaoPrazosPage } from '@/pages/ConfiguracaoPrazosPage';
import { GerenciarLinksPage } from '@/pages/GerenciarLinksPage';
import { LinksUteisModal } from '@/components/LinksUteisModal';

type Aba = 'dashboard' | 'planos' | 'publicacoes' | 'pastas' | 'usuarios' | 'prazos' | 'links';

type AbaConfig = {
  id: Aba;
  label: string;
  icon: ComponentType<LucideProps>;
};

const ABA_DASHBOARD: AbaConfig = { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard };
const ABAS_PLANOS: AbaConfig = { id: 'planos', label: 'Planos de aula', icon: ClipboardList };
const ABA_PUBLICACOES: AbaConfig = { id: 'publicacoes', label: 'Publicações', icon: FolderOpen };
const ABA_PRAZOS: AbaConfig = { id: 'prazos', label: 'Configuração de prazos', icon: CalendarClock };
const ABA_LINKS: AbaConfig = { id: 'links', label: 'Gerenciar Links Úteis', icon: Link2 };

function abasDoPerfil(perfil: Perfil): AbaConfig[] {
  if (perfil === 'admin') {
    return [
      ABA_DASHBOARD,
      ABAS_PLANOS,
      ABA_PUBLICACOES,
      ABA_PRAZOS,
      ABA_LINKS,
      { id: 'pastas', label: 'Pastas', icon: FolderOpen },
      { id: 'usuarios', label: 'Usuários', icon: Users },
    ];
  }
  if (perfil === 'pedagogia' || perfil === 'coordenacao') {
    return [ABA_DASHBOARD, ABAS_PLANOS, ABA_PUBLICACOES, ABA_PRAZOS];
  }
  return [ABAS_PLANOS, ABA_PUBLICACOES];
}

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

function MenuUsuario({ profile, onAlterarSenha, onSair }: { profile: PerfilAtual; onAlterarSenha: () => void; onSair: () => void }) {
  const [aberto, setAberto] = useState(false);
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: MouseEvent) => {
      if (!referencia.current?.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  return (
    <div ref={referencia} className="relative">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        className="flex items-center gap-3 rounded-full py-1 pl-1 pr-3 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">
          {iniciais(profile.nome)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium text-slate-900">{profile.nome}</span>
          <span className="block text-xs text-slate-500">{PERFIL_LABEL[profile.perfil]}</span>
        </span>
      </button>

      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-lg animate-modal-in">
          <div className="px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-slate-900">{profile.nome}</p>
            <p className="truncate text-xs text-slate-500">{profile.email}</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PERFIL_STYLE[profile.perfil]}`}>
              {PERFIL_LABEL[profile.perfil]}
            </span>
          </div>
          <div className="border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                onAlterarSenha();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <KeyRound className="h-4 w-4 text-slate-500" />
              Alterar senha
            </button>
            <button
              type="button"
              onClick={onSair}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4 text-slate-500" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ profile }: { profile: PerfilAtual }) {
  const { signOut } = useAuth();
  const abas = abasDoPerfil(profile.perfil);
  const [aba, setAba] = useState<Aba>(abas[0].id);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [linksUteisAberto, setLinksUteisAberto] = useState(false);
  const [senhaObrigatoriaConcluida, setSenhaObrigatoriaConcluida] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 animate-fade-in">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden text-sm font-semibold text-slate-900 sm:block">Planos de Aula</span>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Principal">
            {abas.map(({ id, label, icon: Icone }) => {
              const ativa = aba === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAba(id)}
                  aria-current={ativa ? 'page' : undefined}
                  className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition ${
                    ativa ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icone className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {profile.perfil === 'docente' && (
              <button
                type="button"
                onClick={() => setLinksUteisAberto(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 text-sm font-medium text-teal-700 transition hover:bg-teal-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20"
              >
                <Link2 className="h-4 w-4" />
                Links Úteis
              </button>
            )}
            <MenuUsuario profile={profile} onAlterarSenha={() => setAlterandoSenha(true)} onSair={signOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {aba === 'dashboard' && <DashboardPage profile={profile} />}
        {aba === 'planos' && <PlanosPage profile={profile} />}
        {aba === 'publicacoes' && <PublicacoesPage profile={profile} />}
        {aba === 'pastas' && <PastasPage />}
        {aba === 'usuarios' && <UsuariosPage currentUserId={profile.id} perfilAtual={profile.perfil} />}
        {aba === 'prazos' && <ConfiguracaoPrazosPage profile={profile} />}
        {aba === 'links' && <GerenciarLinksPage />}
      </main>

      {profile.primeiro_acesso && !senhaObrigatoriaConcluida && (
        <TrocaSenhaObrigatoriaModal
          userId={profile.id}
          email={profile.email}
          onConcluido={() => setSenhaObrigatoriaConcluida(true)}
        />
      )}
      {alterandoSenha && <ChangePasswordModal email={profile.email} onFechar={() => setAlterandoSenha(false)} />}
      {linksUteisAberto && <LinksUteisModal onFechar={() => setLinksUteisAberto(false)} />}
    </div>
  );
}
