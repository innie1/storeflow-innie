import { useState } from 'react';
import { StoreData } from '@/types/store';
import { getGames, updateGame, deleteGame, addGame, moveGame } from '@/lib/games-data';
import { showToast } from '@/components/Toast';

const ICONS = ['🎮', '🎱', '🏓', '🎯', '🎤', '🥽', '♟️', '🎲', '🃏', '🕹️', '⚽', '🏀', '🎳', '🎪'];

interface Props {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function GamesSettings({ store, onUpdate }: Props) {
  const games = getGames(store);
  const [adding, setAdding] = useState(false);
  const [newGame, setNewGame] = useState({ name: '', price: '', icon: '🎮' });

  const handleToggle = (id: string, enabled: boolean) => {
    onUpdate(updateGame(store, id, { enabled }));
  };
  const handlePrice = (id: string, value: string) => {
    const n = Number(value) || 0;
    onUpdate(updateGame(store, id, { price: n }));
  };
  const handleIcon = (id: string, icon: string) => {
    onUpdate(updateGame(store, id, { icon }));
  };
  const handleRemove = (id: string) => {
    if (!confirm('Remove this game?')) return;
    onUpdate(deleteGame(store, id));
    showToast('Game removed');
  };
  const handleAdd = () => {
    if (!newGame.name.trim()) return showToast('Enter a name', 'error');
    const price = Number(newGame.price) || 0;
    onUpdate(addGame(store, { name: newGame.name.trim(), icon: newGame.icon, price, enabled: true }));
    setNewGame({ name: '', price: '', icon: '🎮' });
    setAdding(false);
    showToast('Game added');
  };

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      <div className="bg-card shadow-card rounded-xl p-4">
        <h3 className="font-display font-bold text-base">Games & Services</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Enable what you offer, set the price, reorder, or add custom games.</p>
      </div>

      <div className="space-y-2">
        {games.map((g, i) => (
          <div key={g.id} className="bg-card shadow-card rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-3">
              <select
                value={g.icon}
                onChange={e => handleIcon(g.id, e.target.value)}
                className="bg-surface-2 border border-border rounded-lg p-1 text-xl"
                aria-label="Icon"
              >
                {ICONS.includes(g.icon) ? null : <option value={g.icon}>{g.icon}</option>}
                {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm truncate">{g.name}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={g.enabled} onChange={e => handleToggle(g.id, e.target.checked)} />
                <div className="w-10 h-5 bg-surface-2 border border-border rounded-full peer-checked:bg-primary transition-colors relative">
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform ${g.enabled ? 'translate-x-5' : ''}`} />
                </div>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">₦</span>
              <input
                type="number"
                min="0"
                value={g.price}
                onChange={e => handlePrice(g.id, e.target.value)}
                className="flex-1 p-2 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
              />
              <button onClick={() => onUpdate(moveGame(store, g.id, -1))} disabled={i === 0} className="px-2 py-2 rounded-lg bg-surface-2 border border-border text-xs disabled:opacity-40">↑</button>
              <button onClick={() => onUpdate(moveGame(store, g.id, 1))} disabled={i === games.length - 1} className="px-2 py-2 rounded-lg bg-surface-2 border border-border text-xs disabled:opacity-40">↓</button>
              <button onClick={() => handleRemove(g.id)} className="px-2 py-2 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20">✕</button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
          <h4 className="font-display font-bold text-sm">New Game / Service</h4>
          <div className="flex gap-2">
            <select value={newGame.icon} onChange={e => setNewGame({ ...newGame, icon: e.target.value })} className="bg-surface-2 border border-border rounded-lg p-2 text-xl">
              {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
            <input value={newGame.name} onChange={e => setNewGame({ ...newGame, name: e.target.value })} placeholder="Name" className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
          <input type="number" value={newGame.price} onChange={e => setNewGame({ ...newGame, price: e.target.value })} placeholder="Price (₦)" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
            <button onClick={handleAdd} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Add Game</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full p-3 rounded-xl bg-card shadow-card border border-dashed border-border text-sm font-display font-semibold text-muted-foreground hover:text-primary hover:border-primary/40">
          + Add custom game
        </button>
      )}
    </div>
  );
}
