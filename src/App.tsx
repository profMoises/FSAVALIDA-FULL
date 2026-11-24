import { BrandLogo } from '@/components/BrandLogo';
import { AppShell } from '@/components/AppShell';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';

function Raiz() {
  const { loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50">
        <BrandLogo className="h-16 w-auto animate-pulse" />
      </div>
    );
  }

  if (!profile) return <LoginPage />;
  return <AppShell profile={profile} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Raiz />
    </AuthProvider>
  );
}
