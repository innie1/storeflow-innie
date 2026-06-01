import { useState } from 'react';
import { StoreData, GameService } from '@/types/store';
import { getEnabledGames, getDailyStats, recordGameSession } from '@/lib/games-data';
import { showToast } from '@/components/Toast';

interface Props {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  onGoToSettings: () => void;
}

export default function GamesDashboard({ store, onUpdate, onGoToSettings }: Props) {
  const enabled = getEnabledGames(store);
  const { total, players, count } = getDailyStats(store);
  const [detailGame, setDetailGame] = useState<GameService | null>(null);
  const [form, setForm] = useState({ players: '1', duration: '', notes: '' });

  const quickAdd = (game: GameService) => {
    const updated = recordGameSession(store, game.id, { players: 1 });
    onUpdate(updated);
    showToast(`✓ ${game.name} · ₦${game.price.toLocaleString()}`);
  };

  const saveDetail = () => {
    if (!detailGame) return;
    const p = Math.max(1, Number(form.players) || 1);
    const d = form.duration ? Number(form.duration) : undefined;
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

  if (enabled.length === 0) {
    return (
      <div className="animate-fade-in max-w-md mx-auto">
        <div className="bg-card shadow-card rounded-2xl p-6 text-center space-y-4">
          <div className="text-5xl">🎮</div>
          <h2 className="font-display font-bold text-lg">No games added yet</h2>
          <p className="text-sm text-muted-foreground">
            Enable the games and services your business offers to start recording sessions.
          </p>
          <button
            onClick={onGoToSettings}
            className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90"
          >
            ⚙️ Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card shadow-card rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Daily Balance</p>
          <p className="font-display font-bold text-2xl text-primary mt-1">₦{total.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{count} session{count === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-card shadow-card rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Players Today</p>
          <p className="font-display font-bold text-2xl text-foreground mt-1">{players}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Tap a card to record</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {enabled.map(g => (
          <div key={g.id} className="bg-card shadow-card rounded-2xl p-4 flex flex-col items-center text-center gap-2">
            <div className="text-4xl">{g.icon}</div>
            <p className="font-display font-bold text-sm">{g.name}</p>
            <p className="text-primary font-mono text-sm">₦{g.price.toLocaleString()}</p>
            <div className="grid grid-cols-2 gap-2 w-full mt-1">
              <button
                onClick={() => quickAdd(g)}
                className="p-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:opacity-90"
              >
                ＋ Play
              </button>
              <button
                onClick={() => { setDetailGame(g); setForm({ players: '1', duration: '', notes: '' }); }}
                className="p-2 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold hover:border-primary/30"
              >
                Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {detailGame && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailGame(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="text-3xl">{detailGame.icon}</div>
              <div>
                <h3 className="font-display font-bold text-lg">{detailGame.name}</h3>
                <p className="text-xs text-muted-foreground">₦{detailGame.price.toLocaleString()} per player</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Players</label>
                <input type="number" min="1" value={form.players} onChange={e => setForm({ ...form, players: e.target.value })} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Duration (min)</label>
                <input type="number" min="0" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="optional" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="optional" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="text-sm text-muted-foreground text-center">
              Total: <span className="text-primary font-display font-bold">₦{(detailGame.price * Math.max(1, Number(form.players) || 1)).toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDetailGame(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={saveDetail} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Save Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
