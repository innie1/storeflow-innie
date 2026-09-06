import type { TabId } from '@/types/store';
import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface NotificationDrawerProps {
  store: StoreData;
  onClose: () => void;
  onUpdate: (s: StoreData) => void;
  onNavigate?: (tab: TabId, param?: string) => void;
}

export default function NotificationDrawer({ store, onClose, onUpdate, onNavigate }: NotificationDrawerProps) {
  useBodyScrollLock();
  // Only display unread notifications in the tray
  const notes = (store.flowNotifications || []).filter(n => !n.read);

  // Closing the tray used to mark every notification read. Since the tray only
  // shows unread ones, opening it and acting on a single alert wiped the rest —
  // and because new notifications are deduplicated by id, a read one was never
  // re-added, so alerts for problems that were still unresolved never came
  // back. Closing is now just closing.
  const handleClose = () => onClose();

  /** Marks one notification attended to. Nothing else is touched. */
  const dismiss = (id: string) => {
    const updated = {
      ...store,
      flowNotifications: (store.flowNotifications || []).map(n => (n.id === id ? { ...n, read: true } : n)),
    };
    saveStore(updated);
    onUpdate(updated);
  };

  const markAllRead = () => {
    const allNotes = store.flowNotifications || [];
    const updated = {
      ...store,
      flowNotifications: allNotes.map(n => ({ ...n, read: true }))
    };
    saveStore(updated);
    onUpdate(updated);
  };

  const toneStyle: Record<string, string> = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-primary/10 border-primary/30 text-primary',
    danger: 'bg-destructive/10 border-destructive/30 text-destructive',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end" onClick={handleClose}>
      <div className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col" style={{ maxWidth: '448px', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1.5 rounded-full bg-border" /></div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border">
          <div>
            <h3 className="font-display font-bold text-base text-foreground">Notifications</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Alerts, insights and forecasts from Flow</p>
          </div>
          {notes.length > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary font-display font-semibold hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] no-scrollbar">
          {notes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs">
              No notifications yet. Flow alerts appear here.
            </div>
          ) : (
            notes.map(n => (
              <div key={n.id} className={`p-3 rounded-xl border flex gap-3 text-left ${toneStyle[n.tone] || 'bg-surface-2 border-border/40'}`}>
                <span className="text-lg shrink-0 mt-0.5">{n.icon || '🔔'}</span>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-display font-bold text-foreground leading-normal">{n.title || 'Flow Alert'}</p>
                    <button
                      onClick={() => dismiss(n.id)}
                      aria-label="Dismiss this notification"
                      className="shrink-0 -mt-0.5 -mr-1 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-3"
                    >
                      <span className="text-sm leading-none">×</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">{n.description || n.text}</p>
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/10">
                    <p className="text-[9px] text-muted-foreground/80 font-mono">
                      {new Date(n.date).toLocaleDateString()} · {new Date(n.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {n.actionTab && onNavigate && (
                      <button
                        onClick={() => {
                          // Acting on it is attending to it — and only to it.
                          dismiss(n.id);
                          // actionTab is a plain string on the stored
                          // notification. Index renders "That screen isn't
                          // available" for anything it does not know, so an
                          // unrecognised one is handled rather than fatal.
                          if (onNavigate) onNavigate(n.actionTab as TabId, n.actionParam);
                          handleClose();
                        }}
                        className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-[9px] font-display font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                      >
                        {n.actionLabel || 'Take Action →'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button onClick={handleClose} aria-label="Close notifications" className="w-full py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold hover:bg-surface-3 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
