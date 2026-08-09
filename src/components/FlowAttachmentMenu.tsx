import { useRef, useState } from 'react';
import { Camera, FileText, Image, KeyRound, ListPlus, X, FileUp } from 'lucide-react';

interface Props { onClose: () => void; onCamera: () => void; onImage: (file: File) => void; onFile: (file: File) => void; onRestockCode: () => void; onBuyList: () => void; }

export default function FlowAttachmentMenu({ onClose, onCamera, onImage, onFile, onRestockCode, onBuyList }: Props) {
  const imageRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const choose = (fn: (file: File) => void, file?: File) => { if (!file) return; setBusy(true); fn(file); window.setTimeout(() => setBusy(false), 250); onClose(); };
  return (
    <div className="absolute bottom-[4.6rem] left-4 z-[80] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-2 animate-slide-up" role="menu">
      <div className="flex items-center justify-between px-2 py-1"><div><p className="text-sm font-display font-bold">Add to Flow</p><p className="text-[11px] text-muted-foreground">Import stock, receipts or business files</p></div><button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-2/60"><X className="w-4 h-4" /></button></div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" disabled={busy} onClick={onCamera} className="rounded-xl border border-border bg-surface-2/40 p-3 text-left flex items-center gap-3"><Camera className="w-5 h-5 text-primary" /><span><b className="block text-xs">Camera</b><small className="text-[10px] text-muted-foreground">Scan inside app</small></span></button>
        <button type="button" onClick={() => imageRef.current?.click()} className="rounded-xl border border-border bg-surface-2/40 p-3 text-left flex items-center gap-3"><Image className="w-5 h-5 text-primary" /><span><b className="block text-xs">Photos</b><small className="text-[10px] text-muted-foreground">Receipt images</small></span></button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-border bg-surface-2/40 p-3 text-left flex items-center gap-3"><FileText className="w-5 h-5 text-primary" /><span><b className="block text-xs">Files</b><small className="text-[10px] text-muted-foreground">PDF, Word, Excel, CSV</small></span></button>
        <button type="button" onClick={onRestockCode} className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-left flex items-center gap-3"><KeyRound className="w-5 h-5 text-primary" /><span><b className="block text-xs">Import code</b><small className="text-[10px] text-muted-foreground">Restock PO code</small></span></button>
        <button type="button" onClick={onBuyList} className="rounded-xl border border-border bg-surface-2/40 p-3 text-left flex items-center gap-3"><ListPlus className="w-5 h-5 text-primary" /><span><b className="block text-xs">Create buy list</b><small className="text-[10px] text-muted-foreground">Smart local recommendation</small></span></button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-border bg-surface-2/40 p-3 text-left flex items-center gap-3"><FileUp className="w-5 h-5" /><span><b className="block text-xs">Import stock</b><small className="text-[10px] text-muted-foreground">Use a stock file</small></span></button>
      </div>
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => choose(onImage, e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.json,image/*" className="hidden" onChange={e => choose(onFile, e.target.files?.[0])} />
    </div>
  );
}
