import { Flame, X } from 'lucide-react';
import type { TabId } from '@/types/store';
import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { visibleNotifications } from '@/lib/notification-gate';
import { describeWhen, isToday } from '@/lib/notification-time';
import type { ActingUser } from '@/lib/permissions';
import MessageIcon from '@/components/MessageIcon';

interface NotificationDrawerProps {
  store: StoreData;
  onClose: () => void;
  onUpdate: (s: StoreData) => void;
  onNavigate?: (tab: TabId, param?: string) => void;
  /** Who is looking, so a worker is not shown the owner's money. */
  currentUser?: ActingUser | null;
  /** The streak lives in here now, rather than as a flame on the top bar. */
  onOpenStreak?: () => void;
}

/** The tint behind each alert's icon, by how urgent it is. */
const TONE_TILE: Record<string, string> = {
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  info: 'bg-primary/15',
  danger: 'bg-destructive/15',
};

/** And the icon itself, in the colour that goes with the tint. */
const TONE_INK: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-primary',
  danger: 'text-destructive',
};

type Note = NonNullable<StoreData['flowNotifications']>[number];

/**
 * The one inbox.
 *
 * An alert used to be a tinted card holding a paragraph, a timestamp in the
 * American order ("11/13/2026 · 02:58 PM") and a tiny button - one of them
 * filled the panel. Each is a line now: what happened, a second line kept to
 * two rows, when, and one thing to do about it. The newest come first, under
 * Today and Earlier.
 */
export default function NotificationDrawer({ store, onClose, onUpdate, onNavigate, currentUser, onOpenStreak }: NotificationDrawerProps) {
  useBodyScrollLock();
  // Only display unread notifications in the tray, newest first.
  const notes = visibleNotifications(store.flowNotifications || [], currentUser)
    .filter(n => !n.read)
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const groups = [
    { title: 'Today', items: notes.filter(n => isToday(n.date)) },
    { title: 'Earlier', items: notes.filter(n => !isToday(n.date)) },
  ].filter(group => group.items.length > 0);
  const streak = store.streak?.count || 0;

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
    // Only what this person was shown. The list belongs to the shop, so
    // marking everything read on a worker's phone would clear the owner's too.
    const shown = new Set(notes.map(n => n.id));
    const allNotes = store.flowNotifications || [];
    const updated = {
      ...store,
      flowNotifications: allNotes.map(n => (shown.has(n.id) ? { ...n, read: true } : n))
    };
    saveStore(updated);
    onUpdate(updated);
  };

  const act = (n: Note) => {
    // Acting on it is attending to it — and only to it.
    dismiss(n.id);
    // actionTab is a plain string on the stored notification. Index renders
    // "That screen isn't available" for anything it does not know, so an
    // unrecognised one is handled rather than fatal.
    if (onNavigate && n.actionTab) onNavigate(n.actionTab as TabId, n.actionParam);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end" onClick={handleClose}>
      <div className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col" style={{ maxWidth: '448px', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1.5 rounded-full bg-border" /></div>
        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-[17px] text-foreground">Notifications</h3>
          {notes.length > 0 && (
            <button onClick={markAllRead} className="text-sm text-primary font-display font-bold">
              Mark all read
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3 min-h-[200px] no-scrollbar">
          {streak > 0 && onOpenStreak && (
            <button
              type="button"
              onClick={onOpenStreak}
              className="w-full flex items-center gap-3 py-3 text-left"
            >
              <span className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                <Flame className="w-[18px] h-[18px] text-orange-400" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-foreground">{streak}-day streak</span>
                <span className="block text-xs text-muted-foreground mt-0.5">Keep recording every day</span>
              </span>
              <span className="text-sm font-bold text-primary shrink-0">See it ›</span>
            </button>
          )}

          {notes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nothing new. Alerts from Flow show up here.
            </div>
          ) : (
            groups.map(group => (
              <section key={group.title} aria-label={group.title}>
                <p className="text-xs text-muted-foreground pt-3 pb-1">{group.title}</p>
                <ul>
                  {group.items.map(n => (
                    <li key={n.id} className="flex items-start gap-3 py-3 border-t border-border first:border-t-0">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TONE_TILE[n.tone] || 'bg-surface-2'} ${TONE_INK[n.tone] || 'text-muted-foreground'}`} aria-hidden>
                        <MessageIcon emoji={n.icon || '🔔'} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{n.title || 'Flow alert'}</p>
                        {(n.description || n.text) && (
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">{n.description || n.text}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground">{describeWhen(n.date)}</span>
                          {n.actionTab && onNavigate && (
                            <button type="button" onClick={() => act(n)} className="text-sm font-bold text-primary">
                              <span>{n.actionLabel || 'Open'}</span> ›
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        aria-label="Dismiss this notification"
                        className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button onClick={handleClose} aria-label="Close notifications" className="w-full h-11 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold hover:bg-surface-3 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
