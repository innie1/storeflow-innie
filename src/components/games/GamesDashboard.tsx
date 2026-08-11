import { useEffect, useState } from 'react';
import { StoreData, GameService } from '@/types/store';
import { ensureDefaultGames, getEnabledGames, getDailyStats, recordGameSession, DEFAULT_GAMES } from '@/lib/games-data';
import { showToast } from '@/components/Toast';
import { Gamepad2, Users, Clock3, Receipt, Settings2, Play, History, TrendingUp } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  onGoToSettings: () => void;
}

export default function GamesDashboard({ store, onUpdate, onGoToSettings }: Props) {
  const [detailGame, setDetailGame] = useState<GameService | null>(null);
  const [form, setForm] = useState({ players: '1', duration: '', notes: '' });

  useEffect(() => {
    if ((!store.games || store.games.length === 0) && (store.category === 'games' || store.storeType === 'games')) {
      onUpdate(ensureDefaultGames(store));
    }
  }, [store, onUpdate]);

  const enabled = getEnabledGames(store);
  const fallbackGames: GameService[] = DEFAULT_GAMES.map((g, i) => ({ ...g, id: `default-${i}` }));
  const displayGames = enabled.length > 0 ? enabled : fallbackGames;
  const { total, players, count, sessions } = getDailyStats(store);

  const quickAdd = (game: GameService) => {
    let working = store;
    if (!working.games?.some(g => g.id === game.id)) {
      working = ensureDefaultGames(working);
      const realGame = working.games?.find(g => g.name === game.name);
      if (!realGame) return;
      game = realGame;
    }
    const updated = recordGameSession(working, game.id, { players: 1 });
    onUpdate(updated);
    showToast(`✓ ${game.name} · ₦${game.price.toLocaleString()}`);
  };

  const openDetails = (game: GameService) => {
    const realGame = store.games?.find(g => g.id === game.id) || store.games?.find(g => g.name === game.name) || game;
    setDetailGame(realGame);
    setForm({ players: '1', duration: '', notes: '' });
  };

  const saveDetail = () => {
    if (!detailGame) return;
    const p = Math.max(1, Number(form.players) || 1);
    const d = form.duration ? Math.max(1, Number(form.duration)) : undefined;
    const updated = recordGameSession(store, detailGame.id, {
      players: p,
      duration: d,
      notes: form.notes,
      amount: detailGame.price * p,
    });
    onUpdate(updated);
    showToast(`✓ ${detailGame.name} × ${p}`);
    setDetailGame(null);
    setForm({ players: '1', duration: '', notes: '' });
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary font-bold">Gaming Centre</p>
          <h1 className="font-display font-black text-2xl text-foreground mt-1">Today's gaming floor</h1>
          <p className="text-sm text-muted-foreground mt-1">Start a session in one tap. Edit games and prices only when you need to.</p>
        </div>
        <button onClick={onGoToSettings} className="shrink-0 w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center hover:border-primary/40" title="Gaming setup">
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Receipt className="w-4 h-4" /> Revenue</div>
          <p className="font-display font-black text-2xl text-primary mt-2">₦{total.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Today</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Play className="w-4 h-4" /> Sessions</div>
          <p className="font-display font-black text-2xl mt-2">{count}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Completed / recorded</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Users className="w-4 h-4" /> Players</div>
          <p className="font-display font-black text-2xl mt-2">{players}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Today</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Gamepad2 className="w-4 h-4" /> Games</div>
          <p className="font-display font-black text-2xl mt-2">{enabled.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Available now</p>
        </div>
      </div>

      <section className="bg-card border border-border rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display font-bold text-base">Start a session</h2>
            <p className="text-xs text-muted-foreground">Tap Play for a normal session or Details for more information.</p>
          </div>
          <Gamepad2 className="w-5 h-5 text-primary" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {displayGames.map(g => (
            <div key={g.id} className="rounded-2xl border border-border bg-surface-2/40 p-3.5 hover:border-primary/30 transition-colors">
              <div className="text-3xl">{g.icon}</div>
              <p className="font-display font-bold text-sm mt-2 truncate">{g.name}</p>
              <p className="text-primary font-mono text-sm mt-0.5">₦{g.price.toLocaleString()} <span className="text-[10px] text-muted-foreground font-sans">/ player</span></p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => quickAdd(g)} className="p-2 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold flex items-center justify-center gap-1 active:scale-95">
                  <Play className="w-3.5 h-3.5" /> Play
                </button>
                <button onClick={() => openDetails(g)} className="p-2 rounded-xl bg-background border border-border text-xs font-display font-semibold active:scale-95">
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display font-bold text-base">Recent sessions</h2>
            <p className="text-xs text-muted-foreground">Your latest activity today.</p>
          </div>
          <History className="w-5 h-5 text-muted-foreground" />
        </div>
        {sessions.length === 0 ? (
          <div className="py-7 text-center text-sm text-muted-foreground">
            <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No sessions yet. Start one above.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/40 border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm truncate">{s.gameName}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> {s.players} player{s.players === 1 ? '' : 's'}
                    {s.duration ? <><span>·</span><Clock3 className="w-3 h-3" /> {s.duration} min</> : null}
                  </p>
                </div>
                <p className="font-display font-bold text-sm text-primary shrink-0">₦{s.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pb-2">
        <TrendingUp className="w-3.5 h-3.5" />
        <span>Use Analytics to see your best-performing games.</span>
      </div>

      {detailGame && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailGame(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="text-3xl">{detailGame.icon}</div>
              <div>
                <h3 className="font-display font-bold text-lg">{detailGame.name}</h3>
                <p className="text-xs text-muted-foreground">₦{detailGame.price.toLocaleString()} per player</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Players</label>
                <input type="number" min="1" value={form.players} onChange={e => setForm({ ...form, players: e.target.value })} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Duration (minutes)</label>
                <input type="number" min="1" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="Optional" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Session note</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. customer requested extra controller" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Session total</p>
              <p className="text-xl font-display font-black text-primary">₦{(detailGame.price * Math.max(1, Number(form.players) || 1)).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDetailGame(null)} className="flex-1 p-3 rounded-xl bg-surface-2 border border-border text-sm font-display font-semibold">Cancel</button>
              <button onClick={saveDetail} className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground text-sm font-display font-bold">Record Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
