import { useEffect, useState } from 'react';
import { Camera, Share2, Trash2, X } from 'lucide-react';
import IntakeCamera from '@/components/laundry/IntakeCamera';
import { dataUrlBytes } from '@/lib/downscale-image';
import {
  deleteLaundryPhoto,
  getLaundryPhotos,
  laundryPhotoId,
  saveLaundryPhoto,
  MAX_PHOTOS_PER_BUNDLE,
  type LaundryPhoto,
} from '@/lib/laundry-photos';

/**
 * The photos taken of one bundle.
 *
 * They stay on this device. Nothing uploads them, nothing syncs them, and the
 * record itself holds no reference to them — they are found by the bundle's
 * client ref — so there is no path by which a photo of somebody's clothes
 * leaves the shop's phone on its own.
 *
 * Sending one is a deliberate act: the share button hands the actual image to
 * whatever the phone can share with, and deleting is one tap with a
 * confirmation. The owner decides, every time.
 */

interface Props {
  clientRef: string;
  accessCode: string;
  /** Off during intake until the bundle has a ref; on afterwards. */
  canAdd?: boolean;
  /**
   * The line explaining what photos are for. Worth saying once on the intake
   * sheet; in a list of twenty bundles it is the same sentence twenty times.
   */
  hint?: boolean;
  onCountChange?: (count: number) => void;
}

async function sharePhoto(photo: LaundryPhoto, label: string): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const blob = await (await fetch(photo.dataUrl)).blob();
    const file = new File([blob], `${label || 'bundle'}.jpg`, { type: 'image/jpeg' });

    // The share sheet passes the real image to WhatsApp or anything else the
    // phone offers. A wa.me link cannot carry a picture, so this is the only
    // way to actually send one.
    const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: label });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export default function BundlePhotos({ clientRef, accessCode, canAdd = true, hint = true, onCountChange }: Props) {
  const [photos, setPhotos] = useState<LaundryPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewing, setViewing] = useState<LaundryPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LaundryPhoto | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    const rows = await getLaundryPhotos(clientRef);
    setPhotos(rows);
    onCountChange?.(rows.length);
  };

  useEffect(() => {
    let alive = true;
    getLaundryPhotos(clientRef).then(rows => {
      if (!alive) return;
      setPhotos(rows);
      onCountChange?.(rows.length);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientRef]);

  const add = async (dataUrl: string) => {
    const saved = await saveLaundryPhoto({
      id: laundryPhotoId(),
      clientRef,
      accessCode,
      dataUrl,
      takenAt: new Date().toISOString(),
      bytes: dataUrlBytes(dataUrl),
    });
    if (!saved) { setNote('That photo could not be saved on this device.'); return; }
    await refresh();
    setCameraOpen(false);
  };

  const remove = async (photo: LaundryPhoto) => {
    await deleteLaundryPhoto(photo.id);
    setConfirmDelete(null);
    setViewing(null);
    await refresh();
  };

  const full = photos.length >= MAX_PHOTOS_PER_BUNDLE;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {photos.map(photo => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setViewing(photo)}
            className="w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-border active:scale-95 transition"
          >
            <img src={photo.dataUrl} alt="Bundle at drop-off" className="w-full h-full object-cover" />
          </button>
        ))}

        {canAdd && !full && (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="w-14 h-14 shrink-0 rounded-xl border border-dashed border-border bg-surface-2 flex flex-col items-center justify-center gap-0.5 text-muted-foreground active:scale-95 transition"
          >
            <Camera className="w-4 h-4" />
            <span className="text-[9px] font-bold">Photo</span>
          </button>
        )}
      </div>

      {photos.length === 0 && canAdd && hint && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          A photo at drop-off settles most arguments later. Kept on this phone only.
        </p>
      )}
      {note && <p className="text-[10px] text-destructive">{note}</p>}

      <IntakeCamera open={cameraOpen} onCapture={add} onClose={() => setCameraOpen(false)} />

      {viewing && (
        <div
          className="fixed inset-0 z-[95] bg-black/95 flex flex-col"
          onClick={() => setViewing(null)}
          role="dialog"
          aria-label="Bundle photo"
        >
          <div className="flex justify-end p-3">
            <button type="button" aria-label="Close" className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-4">
            <img src={viewing.dataUrl} alt="Bundle at drop-off" className="max-h-full max-w-full object-contain rounded-xl" />
          </div>
          <div className="p-5 flex items-center justify-center gap-3" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              onClick={async () => {
                const result = await sharePhoto(viewing, clientRef);
                if (result === 'downloaded') setNote('Saved to your downloads — attach it from there.');
                if (result === 'failed') setNote('This device could not share that photo.');
              }}
              className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" /> Send
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(viewing)}
              className="h-11 px-5 rounded-xl bg-white/10 text-white font-display font-bold text-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[96] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-label="Delete photo">
          <div className="w-full sm:max-w-xs rounded-2xl bg-card border border-border p-5 space-y-3 text-left">
            <h3 className="font-display font-black text-base">Delete this photo?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              It is the only copy, and it is what settles an argument about this bundle later.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => remove(confirmDelete)}
                className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground font-display font-black text-xs"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-10 rounded-xl bg-surface-2 border border-border font-display font-bold text-xs"
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
