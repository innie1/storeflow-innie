import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
import { downscaleImageToDataUrl } from '@/lib/downscale-image';

/**
 * The camera, inside the app.
 *
 * Deliberately not `<input type="file" capture>`: that hands the phone over to
 * the system camera app, and the attendant is out of StoreFlow mid-intake with
 * a half-filled form behind them. This streams the camera into the page, so
 * taking a photo of a bundle never leaves the counter screen.
 *
 * The stream is stopped on every exit path. A camera left running keeps the
 * indicator light on and drains the battery, and on a shop phone that is the
 * kind of thing that gets an app uninstalled.
 */

interface Props {
  open: boolean;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export default function IntakeCamera({ open, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) { stop(); return; }

    let cancelled = false;
    setError(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This device will not let the app open a camera.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        const name = (err as { name?: string })?.name || '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in your browser settings to take photos.'
            : name === 'NotFoundError'
              ? 'No camera found on this device.'
              : 'The camera could not be opened.',
        );
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, facing, stop]);

  // The camera must not keep running if this unmounts while open.
  useEffect(() => stop, [stop]);

  const take = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Straight off a modern phone this is several megabytes. It goes into
      // the browser's own storage on the shop's device, so it is shrunk to
      // something a dispute can still be settled from.
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const dataUrl = blob
        ? await downscaleImageToDataUrl(blob, { maxEdge: 1024, quality: 0.62 })
        : canvas.toDataURL('image/jpeg', 0.6);

      onCapture(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-black flex flex-col" role="dialog" aria-label="Take a photo of the bundle">
      <div className="flex items-center justify-between p-3 shrink-0">
        <p className="text-xs font-display font-black text-white/80 uppercase tracking-wider">Photo of the bundle</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFacing(current => (current === 'environment' ? 'user' : 'environment'))}
            aria-label="Switch camera"
            className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { stop(); onClose(); }}
            aria-label="Close camera"
            className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        {error ? (
          <p className="text-sm text-white/70 text-center px-8 leading-relaxed">{error}</p>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      <div className="shrink-0 p-6 flex items-center justify-center">
        {!error && (
          <button
            type="button"
            onClick={take}
            disabled={busy}
            aria-label="Take photo"
            className="w-16 h-16 rounded-full bg-white ring-4 ring-white/30 flex items-center justify-center active:scale-95 transition disabled:opacity-50"
          >
            <Camera className="w-6 h-6 text-black" />
          </button>
        )}
      </div>
    </div>
  );
}
