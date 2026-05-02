import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Render a flash of green when a code is detected. Default true. */
  greenFlash?: boolean;
}

const REGION_ID = 'barcode-scanner-region';

export default function BarcodeScanner({ onDetected, onClose, title = 'Scan Barcode', subtitle, greenFlash = true }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: { width: 240, height: 160 },
      aspectRatio: 1.4,
    };

    scanner.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        if (lockRef.current) return;
        lockRef.current = true;
        // feedback
        if (greenFlash) setFlash(true);
        try { navigator.vibrate?.(80); } catch {}
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 1200; g.gain.value = 0.05;
          o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 120);
        } catch {}
        setTimeout(() => {
          onDetected(decodedText);
        }, 250);
      },
      () => { /* per-frame failures are noise */ }
    ).catch(err => {
      if (mounted) setError(err?.message || 'Camera unavailable. Allow camera access and reload.');
    });

    return () => {
      mounted = false;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onDetected, greenFlash]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-display font-bold text-base">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-surface-2 border border-border text-muted-foreground hover:text-foreground">✕</button>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4">
        <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-2xl overflow-hidden">
          <div id={REGION_ID} className="w-full h-full" />
          {/* Targeting frame */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`w-[80%] h-[40%] rounded-2xl border-4 transition-colors duration-200 ${flash ? 'border-success shadow-[0_0_60px_hsl(var(--success))]' : 'border-primary/70'}`} />
          </div>
          {flash && (
            <div className="absolute inset-0 bg-success/30 animate-fade-in pointer-events-none" />
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 m-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
          {error}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center pb-4 px-4">
        Point your camera at a barcode or QR code. Scanning works offline.
      </p>
    </div>
  );
}
