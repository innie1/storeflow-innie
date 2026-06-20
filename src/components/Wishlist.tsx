import { useState } from 'react';
import { StoreData, WishlistItem } from '@/types/store';
import { addWishlistItem, deleteWishlistItem } from '@/lib/store-data';
import { 
  Star, Plus, Trash2, Calendar, CircleDollarSign, HelpCircle, Sparkles, ShoppingBag
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface WishlistProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Wishlist({ store, onUpdate }: WishlistProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');

  const handleAddWish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !estimatedCost) {
      showToast('Product name and estimated cost price are required', 'error');
      return;
    }
    const nextStore = addWishlistItem(store, name.trim(), Number(estimatedCost), notes.trim() || undefined);
    onUpdate(nextStore);
    showToast('Product saved to wishlist!');
    resetForm();
  };

  const handleDeleteWish = (id: string) => {
    if (confirm('Remove item from wishlist?')) {
      const nextStore = deleteWishlistItem(store, id);
      onUpdate(nextStore);
      showToast('Item removed.');
    }
  };

  const handleAddFromRecommendation = (recommendedName: string, estCost: number) => {
    const nextStore = addWishlistItem(store, recommendedName, estCost, 'Recommended by Flow assistant.');
    onUpdate(nextStore);
    showToast(`✓ Added ${recommendedName} to wishlist!`);
  };

  const resetForm = () => {
    setName('');
    setEstimatedCost('');
    setNotes('');
    setShowAddModal(false);
  };

  const wishlist = store.wishlist || [];

  // Flow recommendation logic: recommend items from standard default options that do not exist in products or current wishlist
  const getFlowRecommendations = () => {
    const defaultProductNames = [
      { name: 'Indomitable Noodles', cost: 10000 },
      { name: 'Fayrouz Can', cost: 14000 },
      { name: 'Omo Detergent (Small)', cost: 2000 },
      { name: 'Golden Morn (1kg)', cost: 3500 },
      { name: 'Egg Crate (Fresh)', cost: 7000 }
    ];

    const currentInventoryNames = new Set(store.products.map(p => p.name.toLowerCase()));
    const currentWishlistNames = new Set(wishlist.map(w => w.name.toLowerCase()));

    return defaultProductNames.filter(dp => 
      !currentInventoryNames.has(dp.name.toLowerCase()) && 
      !currentWishlistNames.has(dp.name.toLowerCase())
    ).slice(0, 3);
  };

  const flowRecommendations = getFlowRecommendations();

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" /> Product Wishlist
          </h2>
          <p className="text-sm text-muted-foreground">Save items you plan to stock later and check estimated buying costs.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Wishlist Item
        </button>
      </div>

      {/* Flow Recommendations Section */}
      {flowRecommendations.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500 shrink-0 animate-pulse" />
            <h4 className="font-display font-bold text-sm text-yellow-500">Flow's Wishlist Recommendations</h4>
          </div>
          <p className="text-xs text-muted-foreground">Based on top retail market analytics, you should consider stocking these high-demand items:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {flowRecommendations.map((rec, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-950 border border-border flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{rec.name}</p>
                  <p className="text-[10px] text-muted-foreground">Est. Cost: ₦{rec.cost.toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => handleAddFromRecommendation(rec.name, rec.cost)}
                  className="px-2.5 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-[10px] shrink-0"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main wishlist */}
      {wishlist.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
          <p className="text-muted-foreground text-sm">Wishlist is empty. Save products to plan capital expansions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wishlist.map(w => (
            <div key={w.id} className="p-5 rounded-2xl bg-slate-950 border border-border flex justify-between items-center gap-4 hover:border-yellow-500/25 transition-all shadow-sm">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-yellow-500 shrink-0">
                    <ShoppingBag className="w-4.5 h-4.5" />
                  </div>
                  <h3 className="font-display font-bold text-base text-foreground truncate leading-tight">{w.name}</h3>
                </div>
                {w.notes && <p className="text-xs text-muted-foreground line-clamp-2">{w.notes}</p>}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> {new Date(w.dateAdded).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1 font-sans text-yellow-500 font-bold">
                    <CircleDollarSign className="w-3.5 h-3.5 text-yellow-500 shrink-0" /> Est: ₦{w.estimatedCost.toLocaleString()}
                  </span>
                </div>
              </div>

              <button 
                onClick={() => handleDeleteWish(w.id)}
                className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/25 transition-all shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal uploader */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handleAddWish} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">Add to Wishlist</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Plan your upcoming stock additions and capital requirements.</p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Product Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sachet Onion Paste Carton"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Estimated Cost (₦)</label>
                <input 
                  type="number" 
                  value={estimatedCost} 
                  onChange={e => setEstimatedCost(e.target.value)}
                  placeholder="e.g. 18000"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Notes (Optional)</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Demand is high among baking customers. Check wholesale prices at Alaba."
                  rows={3}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 resize-none text-left"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Save to Wishlist
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
