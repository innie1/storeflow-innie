import { useEffect, useRef, useState } from 'react';
import { Camera, Image, Key, Zap, ZapOff, Check, X, ShieldAlert } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { showToast } from '@/components/Toast';

interface QRScannerPageProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScannerPage({ onScanSuccess, onClose }: QRScannerPageProps) {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanSuccess, setScanSuccess] = useState(false);

  useEffect(() => {
    // Initialize Html5Qrcode programmatically
    const qrCodeId = 'reader-viewport';
    const html5QrCode = new Html5Qrcode(qrCodeId);
    html5QrCodeRef.current = html5QrCode;

    // Start scanning
    html5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        qrbox: (width, height) => {
          const size = Math.min(width, height) * 0.7;
          return { width: size, height: size };
        }
      },
      (decodedText) => {
        handleSuccess(decodedText);
      },
      () => {
        // Ignored to avoid terminal spam
      }
    ).then(() => {
      setCameraActive(true);
    }).catch(() => {
      setCameraActive(false);
      showToast('Could not access camera. Try photo import or manual entry.', 'warning');
    });

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleSuccess = (text: string) => {
    // 1. Success feedback (haptics)
    if (navigator.vibrate) {
      navigator.vibrate(150);
    }
    
    // Stop scanning
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      html5QrCodeRef.current.stop().catch(() => {});
    }

    setScanSuccess(true);
    showToast('QR Code Scanned successfully!', 'success');

    // Callback after animation completes
    setTimeout(() => {
      onScanSuccess(text);
    }, 1200);
  };

  const toggleFlash = async () => {
    if (!html5QrCodeRef.current || !cameraActive) return;
    try {
      const track = html5QrCodeRef.current.getActiveTrack();
      if (track) {
        const capabilities = track.getCapabilities();
        // Check if torch/flash constraint exists
        if ('torch' in capabilities) {
          const nextState = !flashOn;
          await track.applyConstraints({
            advanced: [{ torch: nextState }]
          } as any);
          setFlashOn(nextState);
        } else {
          showToast('Torch flashlight is not supported on this device', 'info');
        }
      }
    } catch (err) {
      showToast('Flash operation failed', 'error');
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !html5QrCodeRef.current) return;
    try {
      const decodedText = await html5QrCodeRef.current.scanFile(file, true);
      handleSuccess(decodedText);
    } catch (err) {
      showToast('Could not find any scannable QR Code in this photo', 'error');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col justify-between text-white animate-fade-in select-none">
      
      {/* Inject custom styling keyframes directly */}
      <style>{`
        @keyframes laser-sweep {
          0% { top: 4%; opacity: 0.8; }
          50% { top: 96%; opacity: 1; }
          100% { top: 4%; opacity: 0.8; }
        }
        .laser-line {
          animation: laser-sweep 2s infinite ease-in-out;
        }
      `}</style>

      {/* Header controls */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-10 shrink-0">
        <h2 className="font-display font-bold text-sm tracking-wide text-[#FFC72C] flex items-center gap-1.5">
          <Camera className="w-4.5 h-4.5" /> SECURE QR SCANNER
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Viewport & Scan Box */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* html5-qrcode video viewport container */}
        <div id="reader-viewport" className="absolute inset-0 w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

        {/* Viewport Mask & Grid */}
        <div className="absolute inset-0 bg-black/40 z-10 flex flex-col items-center justify-center">
          
          {/* Scan Zone Box */}
          <div className="relative w-64 h-64 border border-white/20 rounded-2xl flex items-center justify-center">
            
            {/* Custom Glowing Corner brackets */}
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#FFC72C] rounded-tl-xl shadow-[0_0_10px_#FFC72C]" />
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#FFC72C] rounded-tr-xl shadow-[0_0_10px_#FFC72C]" />
            <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#FFC72C] rounded-bl-xl shadow-[0_0_10px_#FFC72C]" />
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#FFC72C] rounded-br-xl shadow-[0_0_10px_#FFC72C]" />

            {/* Glowing Laser Sweep Line */}
            <div className="laser-line absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-[#FFC72C] to-transparent shadow-[0_0_10px_#FFC72C]" />
          </div>

          <p className="text-[11px] font-medium tracking-wide text-white/80 mt-6 bg-black/40 px-3.5 py-1.5 rounded-full border border-white/5">
            Align StoreFlow QR inside the frame
          </p>
        </div>

        {/* Success Overlay Animation */}
        {scanSuccess && (
          <div className="absolute inset-0 bg-green-500 flex flex-col items-center justify-center gap-3 z-30 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white flex items-center justify-center text-white scale-up-bounce">
              <Check className="w-12 h-12" />
            </div>
            <span className="font-display font-bold text-lg text-white">Valid Secure QR!</span>
          </div>
        )}
      </div>

      {/* Bottom Toolbars */}
      <div className="p-6 bg-gradient-to-t from-black/95 to-black/60 z-10 space-y-4 shrink-0">
        
        {/* Flash, Gallery, Manual buttons */}
        <div className="flex justify-around max-w-sm mx-auto">
          <button
            onClick={toggleFlash}
            disabled={!cameraActive}
            className={`p-3.5 rounded-full transition flex items-center justify-center cursor-pointer ${
              flashOn ? 'bg-[#FFC72C] text-black shadow-lg shadow-[#FFC72C]/20' : 'bg-white/10 text-white hover:bg-white/20'
            } disabled:opacity-50`}
          >
            {flashOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition flex items-center justify-center cursor-pointer"
          >
            <Image className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowManual(!showManual)}
            className={`p-3.5 rounded-full transition flex items-center justify-center cursor-pointer ${
              showManual ? 'bg-[#FFC72C] text-black shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Key className="w-5 h-5" />
          </button>
        </div>

        {/* File input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileImport}
        />

        {/* Manual Input form */}
        {showManual && (
          <form onSubmit={handleManualSubmit} className="max-w-sm mx-auto pt-3 animate-scale-up space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste secure token / QR data..."
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/25 text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-[#FFC72C]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#FFC72C] text-black text-xs font-bold font-display hover:brightness-110 cursor-pointer"
              >
                Scan Code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
