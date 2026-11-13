import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-card z-10 pb-2 border-b border-border/40">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
