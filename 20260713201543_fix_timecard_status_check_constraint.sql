import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed')) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  // Already installed or dismissed
  if (dismissed) return null;
  if (window.matchMedia('(display-mode: standalone)').matches) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-in">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-moja-blue flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-moja-blue">Install Moja Time Clock</h3>
          {showIOSPrompt ? (
            <p className="text-xs text-moja-blue/60 font-semibold mt-0.5">
              Tap the share button, then "Add to Home Screen"
            </p>
          ) : (
            <p className="text-xs text-moja-blue/60 font-semibold mt-0.5">
              Add to your home screen for quick access
            </p>
          )}
        </div>
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-moja-orange text-white text-sm font-bold rounded-xl hover:bg-moja-orange/90 active:scale-95 transition-all touch-manipulation"
          >
            <Download className="w-4 h-4" />
            Install
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-2 text-moja-blue/30 hover:text-moja-blue/60 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
