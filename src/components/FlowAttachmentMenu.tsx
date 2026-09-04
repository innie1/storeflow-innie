import { useRef } from 'react';
import { Camera, FileText, Image, KeyRound, ListPlus, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCamera: () => void;
  /** Called with the picked file. The caller attaches it to the composer. */
  onPickFile: (file: File) => void;
  onRestockCode: () => void;
  onBuyList: () => void;
}

const ACCEPTED_FILES = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.json';

/**
 * What the "+" offers next to the Flow composer.
 *
 * Previously six tiles in a two-column grid, two of which ("Files" and
 * "Import stock") opened the same picker with the same accept list — the same
 * action twice under different names. Picking anything closed the sheet and,
 * for a stock file, navigated straight out of the chat with a toast, so the
 * file the merchant had just chosen was thrown away.
 *
 * Now: one row of quick sources, then the two flows that are genuinely
 * different. Files are handed back to the composer as an attachment, so the
 * merchant can see what they picked, remove it, and send a message with it.
 */
export default function FlowAttachmentMenu({ onClose, onCamera, onPickFile, onRestockCode, onBuyList }: Props) {
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (file?: File) => {
    if (!file) return;
    onPickFile(file);
    onClose();
  };

  return (
    <>
      {/* Tapping anywhere else closes it — the old menu could only be dismissed
          by its own X or by pressing + again. */}
      <button
        type="button"
        aria-label="Close attachment menu"
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/20 cursor-default"
      />
      <div
        className="absolute bottom-[4.6rem] left-4 right-4 z-[80] rounded-2xl border border-border bg-background shadow-2xl p-3 animate-slide-up"
        role="menu"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-display font-bold">Add to Flow</p>
            <p className="text-[11px] text-muted-foreground">Attach a receipt, a stock file, or start a list</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-surface-2/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { icon: Camera, label: 'Camera', hint: 'Scan now', onClick: onCamera },
            { icon: Image, label: 'Photo', hint: 'From gallery', onClick: () => imageRef.current?.click() },
            { icon: FileText, label: 'File', hint: 'PDF, Excel, CSV', onClick: () => fileRef.current?.click() },
          ].map(({ icon: Icon, label, hint, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="rounded-xl border border-border bg-surface-2/40 p-3 flex flex-col items-center gap-1.5 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-[11px] font-bold leading-none">{label}</span>
              <span className="text-[9px] text-muted-foreground leading-none">{hint}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 mt-2">
          <button
            type="button"
            onClick={onRestockCode}
            className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-center gap-3 text-left hover:bg-primary/15 transition-colors"
          >
            <KeyRound className="w-5 h-5 text-primary shrink-0" />
            <span className="min-w-0">
              <b className="block text-xs">Enter a restock code</b>
              <small className="block text-[10px] text-muted-foreground">Pull in a purchase order by its code</small>
            </span>
          </button>
          <button
            type="button"
            onClick={onBuyList}
            className="rounded-xl border border-border bg-surface-2/40 p-3 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
          >
            <ListPlus className="w-5 h-5 text-primary shrink-0" />
            <span className="min-w-0">
              <b className="block text-xs">Build a buy list</b>
              <small className="block text-[10px] text-muted-foreground">From what your sales say you need</small>
            </span>
          </button>
        </div>

        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept={`${ACCEPTED_FILES},image/*`} className="hidden" onChange={e => pick(e.target.files?.[0])} />
      </div>
    </>
  );
}
