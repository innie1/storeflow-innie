import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    // Check iOS
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone = (window.navigator as any).standalone === true;
    if (ios && !isStandalone) {
      setIsIOS(true);
      setShowIOSBanner(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setShowInstall(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      {showInstall && (
        <button
          onClick={handleInstall}
          className="fixed bottom-20 left-4 z-50 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg animate-pulse-gold hover:opacity-90 transition-opacity"
        >
          📲 Install App
        </button>
      )}

      {isIOS && showIOSBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-50 p-3 rounded-xl bg-card border border-primary/30 gold-glow flex items-center gap-3 animate-slide-up">
          <span className="text-sm flex-1">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to install</span>
          <button onClick={() => setShowIOSBanner(false)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
        </div>
      )}
    </>
  );
}
