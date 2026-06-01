import { StoreData } from '@/types/store';
import { getAnalytics } from '@/lib/games-data';

interface Props {
  store: StoreData;
}

export default function GamesAnalytics({ store }: Props) {
  const { dayTotal, weekTotal, monthTotal, mostPlayed, topEarning, days, games } = getAnalytics(store);
  const maxDay = Math.max(1, ...days.map(d => d.amount));

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Today', val: dayTotal },
          { label: 'This Week', val: weekTotal },
          { label: 'This Month', val: monthTotal },
        ].map(s => (
          <div key={s.label} className="bg-card shadow-card rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="font-display font-bold text-base text-primary mt-1">₦{s.val.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-card shadow-card rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Most Played</p>
          {mostPlayed ? (
            <>
              <p className="font-display font-bold text-lg mt-1">{mostPlayed.name}</p>
              <p className="text-xs text-muted-foreground">{mostPlayed.sessions} sessions · {mostPlayed.players} players</p>
            </>
          ) : <p className="text-sm text-muted-foreground mt-1">No data yet</p>}
        </div>
        <div className="bg-card shadow-card rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Top Earning</p>
          {topEarning ? (
            <>
              <p className="font-display font-bold text-lg mt-1">{topEarning.name}</p>
              <p className="text-xs text-primary">₦{topEarning.revenue.toLocaleString()}</p>
            </>
          ) : <p className="text-sm text-muted-foreground mt-1">No data yet</p>}
        </div>
      </div>

      <div className="bg-card shadow-card rounded-xl p-4">
        <h3 className="font-display font-bold text-sm mb-3">Daily Income — Last 7 Days</h3>
        <div className="flex items-end gap-2 h-32">
          {days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-primary/70 rounded-t transition-all"
                  style={{ height: `${(d.amount / maxDay) * 100}%`, minHeight: d.amount > 0 ? '4px' : '0' }}
                  title={`₦${d.amount.toLocaleString()}`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{d.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card shadow-card rounded-xl p-4">
        <h3 className="font-display font-bold text-sm mb-3">Per-Game Performance</h3>
        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">No sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {[...games].sort((a, b) => b.revenue - a.revenue).map(g => (
              <div key={g.name} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-display font-semibold">{g.name}</p>
                  <p className="text-[11px] text-muted-foreground">{g.sessions} sessions · {g.players} players</p>
                </div>
                <p className="font-display font-bold text-primary">₦{g.revenue.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
