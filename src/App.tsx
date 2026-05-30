import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { ClockPage } from './pages/ClockPage';
import { AdminLogin } from './pages/AdminLogin';
import { AdminLayout } from './pages/AdminLayout';
import { AdminSetup } from './pages/AdminSetup';
import { RegisterPage } from './pages/RegisterPage';
import { InstallPrompt } from './components/InstallPrompt';

function getRoute(): { page: string; params: Record<string, string> } {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/register/')) {
    return { page: 'register', params: { token: hash.replace('/register/', '') } };
  }
  if (hash.startsWith('/admin/setup')) {
    return { page: 'setup', params: {} };
  }
  if (hash.startsWith('/admin/invitations')) {
    return { page: 'admin', params: { tab: 'invitations' } };
  }
  if (hash.startsWith('/admin')) {
    return { page: 'admin', params: {} };
  }
  return { page: 'clock', params: {} };
}

export default function App() {
  const { session, loading, isAdmin, signIn, signOut } = useAuth();
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    function onHashChange() {
      setRoute(getRoute());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-moja-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (route.page === 'register') {
    return <RegisterPage token={route.params.token} />;
  }

  if (route.page === 'setup') {
    return <AdminSetup onComplete={() => { window.location.hash = '#/admin'; window.location.reload(); }} />;
  }

  if (route.page === 'admin') {
    if (!session || !isAdmin) {
      return <AdminLogin onLogin={signIn} />;
    }
    return <AdminLayout onSignOut={signOut} initialTab={route.params.tab || 'dashboard'} />;
  }

  return (
    <>
      <ClockPage />
      <InstallPrompt />
    </>
  );
}
