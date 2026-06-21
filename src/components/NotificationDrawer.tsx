import { useEffect } from 'react';
import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';

interface NotificationDrawerProps {
  store: StoreData;
  onClose: () => void;
  onUpdate: (s: StoreData) => void;
}

export default function NotificationDrawer({ store, onClose, onUpdate }: NotificationDrawerProps) {
  const notes = store.flowNotifications || [];
  const markAllRead = () => {
    const updated = { ...store, flowNotifications: notes.map(n => ({ ...n, read: true })) };
    saveStore(updated); 
    onUpdate(updated);
  };

  useEffect(() => {
    if (notes.some(n => !n.read)) {
      const updated = { ...store, flowNotifications: notes.map(n => ({ ...n, read: true })) };
      saveStore(updated); 
      onUpdate(updated);
    }
  }, [notes, store, onUpdate]);

  const toneStyle: Record<string, string> = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-primary/10 border-primary/30 text-primary',
    danger: 'bg-destructive/10 border-destructive/30 text-destructive',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col" style={{ maxWidth: '448px', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1.5 rounded-full bg-border" /></div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border">
          <div>
            <h3 className="font-display font-bold text-base text-foreground">Notifications</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Alerts, insights and forecasts from Flow</p>
          </div>
          {notes.some(n => !n.read) && (
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
              <div key={n.id} className={`p-3 rounded-xl border flex gap-3 text-left ${toneStyle[n.type] || 'bg-surface-2'}`}>
                <span className="text-lg shrink-0 mt-0.5">{n.icon || '🔔'}</span>
                <div className="space-y-1">
                  <p className="text-xs font-display font-semibold text-foreground leading-normal">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(n.date).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold hover:bg-surface-3 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
