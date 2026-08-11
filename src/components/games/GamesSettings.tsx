import { useEffect, useState } from 'react';
import { StoreData } from '@/types/store';
import { getGames, updateGame, deleteGame, addGame, moveGame } from '@/lib/games-data';
import { showToast } from '@/components/Toast';
import ConfirmModal from '@/components/ConfirmModal';
import { Gamepad2, GripVertical, Plus, Trash2 } from 'lucide-react';

const ICONS = ['🎮', '🎱', '🏓', '🎯', '🎤', '🥽', '♟️', '🎲', '🃏', '🕹️', '⚽', '🏀', '🎳', '🎪'];

interface GamesSettingsProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function GamesSettings({ store, onUpdate }: GamesSettingsProps) {
  const games = getGames(store);
  const [adding, setAdding] = useState(false);
  const [newGame, setNewGame] = useState({ name: '', price: '', icon: '🎮' });
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  useEffect(() => {
    setPriceDrafts(prev => {
      const next = { ...prev };
      games.forEach(g => {
        if (!(g.id in next)) next[g.id] = String(g.price);
      });
      Object.keys(next).forEach(id => {
        if (!games.some(g => g.id === id)) delete next[id];
      });
      return next;
    });
  }, [store.games]);

  const handleToggle = (id: string) => {
    const game = games.find(g => g.id === id);
    if (!game) return;
    onUpdate(updateGame(store, id, { enabled: !game.enabled }));
  };

  const handlePriceChange = (id: string, value: string) => {
    setPriceDrafts(prev => ({ ...prev, [id]: value.replace(/[^0-9]/g, '') }));
  };

  const commitPrice = (id: string) => {
    const raw = priceDrafts[id] ?? '';
    if (raw === '') return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    onUpdate(updateGame(store, id, { price }));
  };

  const handleIcon = (id: string, icon: string) => {
    onUpdate(updateGame(store, id, { icon }));
  };

  const handleRemove = (id: string) => setPendingRemoveId(id);

  const confirmRemoveGame = () => {
    if (!pendingRemoveId) return;
    onUpdate(deleteGame(store, pendingRemoveId));
    showToast('Game removed');
    setPendingRemoveId(null);
  };

  const handleAdd = () => {
    const name = newGame.name.trim();
    if (!name) return showToast('Enter a game or service name', 'error');
    if (newGame.price.trim() === '') return showToast('Enter a price', 'error');
    const price = Number(newGame.price);
    if (!Number.isFinite(price) || price < 0) return showToast('Enter a valid price', 'error');
    onUpdate(addGame(store, { name, icon: newGame.icon, price, enabled: true }));
    setNewGame({ name: '', price: '', icon: '🎮' });
    setAdding(false);
    showToast('Game added');
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-5">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-black text-xl">Gaming Setup</h2>
            <p className="text-sm text-muted-foreground mt-1">Turn games on or off and set what you charge. Prices can be edited without the field jumping back to ₦0.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {games.map((g, i) => {
          const priceValue = priceDrafts[g.id] ?? String(g.price);
          return (
            <div key={g.id} className={`bg-card border rounded-2xl p-4 space-y-3 ${g.enabled ? 'border-primary/20' : 'border-border opacity-75'}`}>
              <div className="flex items-center gap-3">
                <select
                  value={g.icon}
                  onChange={e => handleIcon(g.id, e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl p-2 text-xl"
                  aria-label={`${g.name} icon`}
                >
                  {ICONS.includes(g.icon) ? null : <option value={g.icon}>{g.icon}</option>}
                  {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm truncate">{g.name}</p>
                  <p className="text-[11px] text-muted-foreground">{g.enabled ? 'Available to start from the dashboard' : 'Hidden from the dashboard'}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={g.enabled}
                  aria-label={`${g.enabled ? 'Disable' : 'Enable'} ${g.name}`}
                  onClick={() => handleToggle(g.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${g.enabled ? 'bg-success border-success' : 'bg-surface-2 border-border'}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${g.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₦</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceValue}
                    onChange={e => handlePriceChange(g.id, e.target.value)}
                    onBlur={() => commitPrice(g.id)}
                    placeholder="Enter price"
                    aria-label={`${g.name} price`}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-surface-2 border border-border text-sm font-display focus:outline-none focus:border-primary"
                  />
                </div>
                <button onClick={() => onUpdate(moveGame(store, g.id, -1))} disabled={i === 0} className="p-2.5 rounded-xl bg-surface-2 border border-border disabled:opacity-30" title="Move up"><GripVertical className="w-4 h-4 rotate-90" /></button>
                <button onClick={() => onUpdate(moveGame(store, g.id, 1))} disabled={i === games.length - 1} className="p-2.5 rounded-xl bg-surface-2 border border-border disabled:opacity-30" title="Move down"><GripVertical className="w-4 h-4 rotate-90" /></button>
                <button onClick={() => handleRemove(g.id)} className="p-2.5 rounded-xl bg-destructive/10 text-destructive" title="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-display font-bold">Add a game or service</h3>
          <div className="flex gap-2">
            <select value={newGame.icon} onChange={e => setNewGame({ ...newGame, icon: e.target.value })} className="bg-surface-2 border border-border rounded-xl p-2 text-xl">
              {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
            <input value={newGame.name} onChange={e => setNewGame({ ...newGame, name: e.target.value })} placeholder="Name" className="flex-1 p-3 rounded-xl bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
          <input type="text" inputMode="numeric" value={newGame.price} onChange={e => setNewGame({ ...newGame, price: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Enter price" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 p-3 rounded-xl bg-surface-2 border border-border text-sm font-display font-semibold">Cancel</button>
            <button onClick={handleAdd} className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground text-sm font-display font-bold"><Plus className="w-4 h-4 inline mr-1" />Add</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full p-3.5 rounded-2xl bg-card border border-dashed border-border text-sm font-display font-semibold text-muted-foreground hover:text-primary hover:border-primary/40">
          + Add custom game or service
        </button>
      )}

      <ConfirmModal
        isOpen={Boolean(pendingRemoveId)}
        title="Remove Game?"
        description="Are you sure you want to remove this game configuration?"
        confirmText="Remove Game"
        cancelText="Cancel"
        variant="danger"
        icon="🎮"
        onConfirm={confirmRemoveGame}
        onCancel={() => setPendingRemoveId(null)}
      />
    </div>
  );
}
