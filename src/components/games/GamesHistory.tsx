import { StoreData } from '@/types/store';
import { deleteSession, getAnalytics } from '@/lib/games-data';
import { showToast } from '@/components/Toast';

interface Props {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function GamesHistory({ store, onUpdate }: Props) {
  const sessions = (store.gameSessions || []);
  const { dayTotal, weekTotal, monthTotal } = getAnalytics(store);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const todaySessions = sessions.filter(s => new Date(s.date).getTime() >= todayTs);

  const handleDelete = (id: string) => {
    if (!confirm('Delete this session?')) return;
    onUpdate(deleteSession(store, id));
    showToast('Session deleted');
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Today', val: dayTotal },
          { label: 'Week', val: weekTotal },
          { label: 'Month', val: monthTotal },
        ].map(s => (
          <div key={s.label} className="bg-card shadow-card rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="font-display font-bold text-base text-primary mt-1">₦{s.val.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-display font-bold text-sm mb-2">Today's Sessions ({todaySessions.length})</h3>
        {todaySessions.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">No sessions recorded today.</p>
        ) : (
          <div className="space-y-2">
            {todaySessions.map(s => (
              <div key={s.id} className="bg-card shadow-card rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{s.gameName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{s.players} player{s.players === 1 ? '' : 's'}
                    {s.duration ? ` · ${s.duration} min` : ''}
                  </p>
                  {s.notes && <p className="text-[11px] text-muted-foreground italic truncate">"{s.notes}"</p>}
                </div>
                <p className="font-display font-bold text-sm text-primary">₦{s.amount.toLocaleString()}</p>
                <button onClick={() => handleDelete(s.id)} className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > todaySessions.length && (
        <div>
          <h3 className="font-display font-bold text-sm mb-2">Earlier</h3>
          <div className="space-y-2">
            {sessions.filter(s => new Date(s.date).getTime() < todayTs).slice(0, 50).map(s => (
              <div key={s.id} className="bg-card shadow-card rounded-xl p-3 flex items-center gap-3 opacity-90">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{s.gameName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    {' · '}{s.players} player{s.players === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="font-display font-bold text-sm text-primary">₦{s.amount.toLocaleString()}</p>
                <button onClick={() => handleDelete(s.id)} className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
