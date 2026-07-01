import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from './hooks/useAuth';
import { ClockPage } from './pages/ClockPage';
import { AdminLogin } from './pages/AdminLogin';
import { AdminLayout } from './pages/AdminLayout';
import { AdminSetup } from './pages/AdminSetup';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPassword } from './pages/ResetPassword';
import { MyHoursPage } from './pages/MyHoursPage';
import { TimecardReportPage } from './pages/TimecardReportPage';
import { InstallPrompt } from './components/InstallPrompt';
import { BugReportButton } from './components/BugReportButton';

function getRoute(): { page: string; params: Record<string, string> } {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/register/')) {
    return { page: 'register', params: { token: hash.replace('/register/', '') } };
  }
  if (hash.startsWith('/timecard/')) {
    return { page: 'timecard', params: { token: hash.replace('/timecard/', '') } };
  }
  if (hash.startsWith('/my-hours')) {
    return { page: 'my-hours', params: {} };
  }
  if (hash.startsWith('/admin/setup')) {
    return { page: 'setup', params: {} };
  }
  if (hash.startsWith('/admin/reset-password')) {
    return { page: 'reset-password', params: {} };
  }
  if (hash.startsWith('/admin/invitations')) {
    return { page: 'admin', params: { tab: 'invitations' } };
  }
  if (hash.startsWith('/admin/timecards')) {
    return { page: 'admin', params: { tab: 'timecards' } };
  }
  if (hash.startsWith('/admin')) {
    return { page: 'admin', params: {} };
  }
  return { page: 'clock', params: {} };
}

export default function App() {
  const { session, loading, isAdmin, signIn, signOut } = useAuth();
  const [route, setRoute] = useState(getRoute);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    function onHashChange() {
      setRoute(getRoute());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function renderPage() {
    if (loading) {
      return <div className="min-h-screen bg-moja-bg" />;
    }

    if (route.page === 'register') {
      return <RegisterPage token={route.params.token} />;
    }

    if (route.page === 'timecard') {
      return <TimecardReportPage token={route.params.token} />;
    }

    if (route.page === 'my-hours') {
      return <MyHoursPage />;
    }

    if (route.page === 'reset-password') {
      return <ResetPassword />;
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

  return (
    <>
      {renderPage()}
      <BugReportButton />
      {needRefresh && (
        <div className="fixed top-4 left-4 right-4 z-[9999] animate-slide-in">
          <div className="max-w-md mx-auto bg-moja-blue text-white rounded-xl shadow-2xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Update Available</p>
              <p className="text-xs text-white/70 font-medium">A new version is ready to install.</p>
            </div>
            <button
              onClick={() => updateServiceWorker()}
              className="flex-shrink-0 px-4 py-2 bg-white text-moja-blue text-sm font-bold rounded-lg hover:bg-white/90 active:scale-95 transition-all"
            >
              Update
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="flex-shrink-0 p-1.5 text-white/50 hover:text-white rounded transition-colors"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
