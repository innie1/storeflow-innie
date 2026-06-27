import { useState, useMemo, useEffect } from 'react';
import { StoreData, Product, CustomerRequest, PlannedRestock } from '@/types/store';
import { receiveStock } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { 
  TrendingUp, AlertTriangle, Coins, Sparkles, CheckCircle, 
  Trash2, Plus, Info, Lightbulb, CheckSquare, Square 
} from 'lucide-react';

interface SmartRestockEngineProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

interface BuyListItem {
  id: string; // matches product ID, or generated for new products
  name: string;
  category: string;
  currentStock: number;
  suggestedQty: number;
  costPrice: number;
  sellingPrice: number;
  priorityScore: number;
  reason: string;
  supplier: string;
  isNewProduct?: boolean;
  requestsCount?: number;
  selected: boolean;
}

export default function SmartRestockEngine({ store, onUpdate, onClose }: SmartRestockEngineProps) {
  // Available budget = cash available
  const cashBalance = store.cashBalance || 0;
  const bankBalance = store.bankBalance || 0;
  const walletBalance = store.walletBalance || 0;
  const availableBudget = cashBalance + bankBalance + walletBalance;

  // Desired coverage days default
  const [coverageDays, setCoverageDays] = useState(14);
  const [itemsList, setItemsList] = useState<BuyListItem[]>([]);
  const [showAddNewForm, setShowAddNewForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCost, setNewProductCost] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductQty, setNewProductQty] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Groceries');
  const [newProductSupplier, setNewProductSupplier] = useState('Default Supplier');

  const suppliers = useMemo(() => store.suppliers || [], [store.suppliers]);
  const sales = useMemo(() => store.sales || [], [store.sales]);
  const requests = useMemo(() => store.customerRequests || [], [store.customerRequests]);

  // 1. Run the Restock recommendation engine
  const generatedRecommendations = useMemo(() => {
    const list: BuyListItem[] = [];

    // Map existing products
    store.products.forEach(p => {
      // Out-of-stock check / low stock check
      const isOutOfStock = p.quantity <= 0;
      const isBelowMin = p.quantity < (p.minimumStock || 10);
      
      // Calculate sales velocity (last 30 days)
      const pSales = sales.filter(s => s.productId === p.id);
      const totalQtySold = pSales.reduce((sum, s) => sum + s.quantity, 0);
      const avgDailySales = totalQtySold / 30;

      // Urgency Score
      let stockUrgencyScore = 0;
      if (isOutOfStock) stockUrgencyScore = 50;
      else if (isBelowMin) stockUrgencyScore = 30;
      else if (p.quantity / (avgDailySales || 0.1) <= 7) stockUrgencyScore = 20; // Runs out in a week

      // Velocity Score
      let velocityScore = 5;
      if (avgDailySales >= 5) velocityScore = 40;
      else if (avgDailySales >= 2) velocityScore = 30;
      else if (avgDailySales >= 0.5) velocityScore = 20;

      // Profit Contribution
      const totalProfit = pSales.reduce((sum, s) => sum + s.profit, 0);
      let profitScore = 5;
      if (totalProfit >= 50000) profitScore = 25;
      else if (totalProfit >= 10000) profitScore = 15;

      // Customer Requests
      const reqCount = requests.filter(r => r.text.toLowerCase().includes(p.name.toLowerCase())).length;
      const requestScore = Math.min(50, reqCount * 5);

      // Seasonality (Christmas, Rainy season, Back-to-school keywords)
      let seasonalityScore = 0;
      const currentMonth = new Date().getMonth(); // 0 = Jan, 11 = Dec
      const lowerName = p.name.toLowerCase();
      const lowerCat = p.category ? p.category.toLowerCase() : '';

      if (currentMonth === 11 && (lowerName.includes('holiday') || lowerName.includes('decor') || lowerName.includes('gift') || lowerName.includes('toy') || lowerCat.includes('holiday'))) {
        seasonalityScore = 25;
      } else if ((currentMonth === 5 || currentMonth === 6 || currentMonth === 7) && (lowerName.includes('umbrella') || lowerName.includes('rain') || lowerName.includes('boots') || lowerName.includes('tea') || lowerName.includes('coffee'))) {
        seasonalityScore = 20;
      } else if ((currentMonth === 8 || currentMonth === 0) && (lowerName.includes('pen') || lowerName.includes('book') || lowerName.includes('bag') || lowerName.includes('stationery') || lowerCat.includes('stationery'))) {
        seasonalityScore = 20;
      }

      // Supplier Lead Time (default 3 days, if stock runs out before then)
      let leadTimeScore = 0;
      const daysLeft = p.quantity / (avgDailySales || 0.01);
      if (daysLeft <= 4) leadTimeScore = 15;

      // Inventory Age / Overstock deductions
      let ageDeduction = 0;
      if (p.quantity > (p.maximumStock || 100)) {
        ageDeduction = -50;
      } else {
        // No sales in 60 days
        const lastSaleDate = pSales.length > 0 ? new Date(pSales[0].date).getTime() : 0;
        if (lastSaleDate > 0 && Date.now() - lastSaleDate > 60 * 24 * 60 * 60 * 1000) {
          ageDeduction = -30;
        }
      }

      // Calculate Priority Score
      const priorityScore = Math.max(0, stockUrgencyScore + velocityScore + profitScore + requestScore + seasonalityScore + leadTimeScore + ageDeduction);

      // Determine Suggested Qty
      const coverageQty = Math.ceil((avgDailySales || 0.5) * coverageDays);
      const idealQty = Math.max(0, (p.minimumStock || 10) * 2 - p.quantity);
      let suggestedQty = Math.max(1, Math.max(coverageQty, idealQty));

      // Calculate AI explanation reason
      let reason = 'Urgent restock to prevent stockout.';
      if (reqCount >= 5) reason = `Frequently requested by ${reqCount} customers this month.`;
      else if (totalProfit >= 30000) reason = `High profit contributor, generating ₦${totalProfit.toLocaleString()} profit.`;
      else if (avgDailySales >= 2) reason = `High sales velocity (${avgDailySales.toFixed(1)} sold daily).`;
      else if (seasonalityScore > 0) reason = 'Seasonal demand increase.';

      // Do not suggest if stock is already way over maximum
      if (p.quantity >= (p.maximumStock || 100) || ageDeduction === -50) {
        return;
      }

      list.push({
        id: p.id,
        name: p.name,
        category: p.category || 'General',
        currentStock: p.quantity,
        suggestedQty,
        costPrice: p.costPrice || 100,
        sellingPrice: p.sellingPrice || 150,
        priorityScore,
        reason,
        supplier: suppliers[0]?.name || 'Default Supplier',
        selected: priorityScore >= 20 // Auto-select high/critical items
      });
    });

    // 2. New Product Opportunities (Unmatched customer requests)
    const productNames = store.products.map(p => p.name.toLowerCase());
    const unmatchedRequests = requests.filter(r => !productNames.some(name => r.text.toLowerCase().includes(name)));

    // Group unmatched requests by keyword
    const requestGroups: Record<string, number> = {};
    unmatchedRequests.forEach(r => {
      const words = r.text.split(' ');
      const keyword = words.slice(0, 3).join(' ').trim();
      if (keyword.length > 2) {
        requestGroups[keyword] = (requestGroups[keyword] || 0) + 1;
      }
    });

    Object.entries(requestGroups).forEach(([keyword, count]) => {
      if (count >= 2) {
        const potentialProfit = count * 2000;
        list.push({
          id: `new-${Math.random().toString(36).slice(2, 6)}`,
          name: keyword,
          category: 'New Request',
          currentStock: 0,
          suggestedQty: count * 10,
          costPrice: 250,
          sellingPrice: 350,
          priorityScore: count * 10 + 15,
          reason: `Requested by ${count} customers. Potential monthly profit: ₦${potentialProfit.toLocaleString()}`,
          supplier: suppliers[0]?.name || 'Default Supplier',
          isNewProduct: true,
          requestsCount: count,
          selected: true
        });
      }
    });

    // Sort by priority score descending
    return list.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [store.products, sales, requests, suppliers, coverageDays]);

  // Sync recommendation engine list on load or settings change
  useEffect(() => {
    setItemsList(generatedRecommendations);
  }, [generatedRecommendations]);

  // Calculations on selected Buy List items
  const totals = useMemo(() => {
    const selectedItems = itemsList.filter(it => it.selected);
    const totalCost = selectedItems.reduce((sum, it) => sum + it.suggestedQty * it.costPrice, 0);
    const estRevenue = selectedItems.reduce((sum, it) => sum + it.suggestedQty * it.sellingPrice, 0);
    const estProfit = estRevenue - totalCost;
    const remaining = availableBudget - totalCost;
    const budgetUsedPct = availableBudget > 0 ? Math.min(100, (totalCost / availableBudget) * 100) : 0;

    return {
      totalCost,
      estRevenue,
      estProfit,
      remaining,
      budgetUsedPct,
      count: selectedItems.length,
      qty: selectedItems.reduce((sum, it) => sum + it.suggestedQty, 0)
    };
  }, [itemsList, availableBudget]);

  // Intelligent Budget Distribution (AI Optimizer)
  const handleOptimizeBudget = () => {
    if (availableBudget <= 0) {
      showToast('No available budget to distribute.', 'error');
      return;
    }

    const updated = itemsList.map(item => ({ ...item }));
    const selected = updated.filter(it => it.selected);
    if (selected.length === 0) return;

    let currentTotal = selected.reduce((sum, it) => sum + it.suggestedQty * it.costPrice, 0);
    if (currentTotal <= availableBudget) {
      showToast('Buy List already fits within available budget!', 'success');
      return;
    }

    // AI Budget Optimizer logic:
    // Scale down quantities proportionately to Priority Score, keeping high priority items active.
    let iterations = 0;
    while (currentTotal > availableBudget && iterations < 30) {
      iterations++;
      let reducedAny = false;

      // Sort selected by priority ascending to reduce lower priority items first
      const sortedSelected = [...selected].sort((a, b) => a.priorityScore - b.priorityScore);

      for (const item of sortedSelected) {
        const matchingItem = updated.find(it => it.id === item.id);
        if (matchingItem && matchingItem.suggestedQty > 1) {
          // Reduce quantity
          const reductionStep = Math.max(1, Math.floor(matchingItem.suggestedQty * 0.15));
          matchingItem.suggestedQty -= reductionStep;
          reducedAny = true;
          
          // Re-calculate total
          currentTotal = updated.filter(it => it.selected).reduce((sum, it) => sum + it.suggestedQty * it.costPrice, 0);
          if (currentTotal <= availableBudget) break;
        }
      }

      // If we couldn't reduce any quantities further (all at 1 qty), deselect the lowest priority item
      if (!reducedAny) {
        const lowestPriority = sortedSelected.find(it => it.selected);
        if (lowestPriority) {
          const matchingItem = updated.find(it => it.id === lowestPriority.id);
          if (matchingItem) {
            matchingItem.selected = false;
          }
          currentTotal = updated.filter(it => it.selected).reduce((sum, it) => sum + it.suggestedQty * it.costPrice, 0);
        }
      }
    }

    setItemsList(updated);
    showToast('Buy List optimized automatically to fit your cash budget!', 'success');
  };

  // Add manually created item
  const handleAddManualProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductCost || !newProductPrice || !newProductQty) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    const newItem: BuyListItem = {
      id: `manual-${Math.random().toString(36).slice(2, 6)}`,
      name: newProductName.trim(),
      category: newProductCategory,
      currentStock: 0,
      suggestedQty: parseFloat(newProductQty),
      costPrice: parseFloat(newProductCost),
      sellingPrice: parseFloat(newProductPrice),
      priorityScore: 30, // medium priority for manual add
      reason: 'Manually added to Buy List.',
      supplier: newProductSupplier,
      selected: true
    };

    setItemsList(prev => [newItem, ...prev]);
    setNewProductName('');
    setNewProductCost('');
    setNewProductPrice('');
    setNewProductQty('');
    setShowAddNewForm(false);
    showToast('Product added to Buy List!');
  };

  // Live item inputs updates
  const handleUpdateQty = (id: string, qty: number) => {
    setItemsList(prev => prev.map(it => it.id === id ? { ...it, suggestedQty: Math.max(1, qty) } : it));
  };

  const handleUpdateCost = (id: string, cost: number) => {
    setItemsList(prev => prev.map(it => it.id === id ? { ...it, costPrice: Math.max(0, cost) } : it));
  };

  const handleUpdateSupplier = (id: string, supplier: string) => {
    setItemsList(prev => prev.map(it => it.id === id ? { ...it, supplier } : it));
  };

  const toggleSelectItem = (id: string) => {
    setItemsList(prev => prev.map(it => it.id === id ? { ...it, selected: !it.selected } : it));
  };

  // Confirm/receive restock
  const handleReceiveBuyList = () => {
    const selectedItems = itemsList.filter(it => it.selected);
    if (selectedItems.length === 0) return;

    if (totals.totalCost > availableBudget) {
      showToast('Cannot purchase: total cost exceeds available budget!', 'error');
      return;
    }

    // Split items into existing products and new products
    let nextStore = store;

    // 1. Add new products first to catalog
    const newItems = selectedItems.filter(it => it.isNewProduct);
    const existingItems = selectedItems.filter(it => !it.isNewProduct);

    newItems.forEach(it => {
      // Add product
      const newP: Product = {
        id: Math.random().toString(36).slice(2, 9),
        name: it.name,
        category: it.category === 'New Request' ? 'Groceries' : it.category,
        costPrice: it.costPrice,
        sellingPrice: it.sellingPrice,
        quantity: 0,
        addedAt: new Date().toISOString()
      };
      nextStore = {
        ...nextStore,
        products: [newP, ...nextStore.products]
      };
      // Map this item to reference the newly added product ID
      it.id = newP.id;
    });

    // 2. Receive stock using our receiveStock core function
    const entries = selectedItems.map(it => ({
      productId: it.id,
      quantity: it.suggestedQty,
      costPrice: it.costPrice
    }));

    // Perform restock
    const updatedStore = receiveStock(nextStore, entries, 'balance');
    
    // 3. Learning System logs (Save accepted buy list metadata to activity log)
    const logs = updatedStore.activityLogs || [];
    const newLog = {
      id: Math.random().toString(36).slice(2, 9),
      store_id: store.accessCode,
      action: 'Accepted Buy List',
      description: `Accepted AI Buy List with ${selectedItems.length} items (Total: ₦${totals.totalCost.toLocaleString()})`,
      created_at: new Date().toISOString()
    };

    onUpdate({
      ...updatedStore,
      activityLogs: [newLog as any, ...logs]
    });

    showToast('✓ Buy List items received & added to inventory!', 'success');
    onClose();
  };

  // Live Suggestions pane
  const suggestions = useMemo(() => {
    const list: string[] = [];
    const selected = itemsList.filter(it => it.selected);
    
    if (totals.remaining < 5000 && totals.remaining >= 0 && totals.totalCost > 0) {
      list.push(`Only ₦${totals.remaining.toLocaleString()} remains in your budget.`);
    }
    if (totals.totalCost > availableBudget) {
      list.push(`Selected items exceed budget by ₦${(totals.totalCost - availableBudget).toLocaleString()}. Click "Optimize Buy List" to fix.`);
    }
    if (totals.totalCost > 0) {
      list.push(`This purchase is expected to increase monthly profit by approximately ₦${totals.estProfit.toLocaleString()}.`);
    }

    const rice = itemsList.find(it => it.name.toLowerCase().includes('rice'));
    if (rice && rice.selected && rice.priorityScore >= 60) {
      list.push(`Demand is very high for ${rice.name}. Keep quantity optimized.`);
    }

    const newReqs = itemsList.filter(it => it.isNewProduct && it.selected);
    newReqs.slice(0, 2).forEach(it => {
      list.push(`Customers requested "${it.name}" ${it.requestsCount} times this week. Highly recommended.`);
    });

    return list.slice(0, 4);
  }, [itemsList, totals, availableBudget]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-card border border-border/50 rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 animate-scale-in text-left flex flex-col no-scrollbar">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-border pb-3">
          <div>
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500 animate-pulse" /> StoreFlow AI Smart Restock Engine
            </h2>
            <p className="text-xs text-muted-foreground">Intelligent, cash-budget constrained inventory purchasing advice.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* Dashboard Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Available Budget</span>
            <p className="font-display font-bold text-lg text-success mt-0.5">₦{availableBudget.toLocaleString()}</p>
            {availableBudget <= 0 && <span className="text-[9px] text-destructive font-semibold">No restocking cash available</span>}
          </div>
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Required Investment</span>
            <p className="font-display font-bold text-lg text-primary mt-0.5">₦{totals.totalCost.toLocaleString()}</p>
            <span className="text-[9px] text-muted-foreground">{totals.count} products selected</span>
          </div>
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Remaining Budget</span>
            <p className={`font-display font-bold text-lg mt-0.5 ${totals.remaining >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              ₦{totals.remaining.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Est. Future Revenue</span>
            <p className="font-display font-bold text-lg text-yellow-500 mt-0.5">₦{totals.estRevenue.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Est. Future Profit</span>
            <p className="font-display font-bold text-lg text-success mt-0.5">₦{totals.estProfit.toLocaleString()}</p>
          </div>
        </div>

        {/* Budget indicators & Optimization Warning */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-semibold">Budget Utilization</span>
            <span className="font-mono font-bold text-foreground">{totals.budgetUsedPct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden border border-border/20">
            <div 
              className={`h-full transition-all duration-300 ${
                totals.totalCost > availableBudget ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${totals.budgetUsedPct}%` }}
            />
          </div>

          {totals.totalCost > availableBudget && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Selected items exceed available purchasing budget by ₦{(totals.totalCost - availableBudget).toLocaleString()}.
              </span>
              <button 
                onClick={handleOptimizeBudget}
                className="px-3 py-1.5 bg-destructive text-white hover:bg-destructive-hover font-display font-bold text-[11px] rounded-lg transition-all cursor-pointer"
              >
                🪄 Optimize Buy List
              </button>
            </div>
          )}
        </div>

        {/* Live suggestions & forms row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* AI Suggestions */}
          <div className="bg-surface-2/40 border border-border/40 rounded-xl p-4 space-y-2.5 md:col-span-2">
            <h3 className="font-display font-bold text-xs text-primary flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-500 animate-bounce" /> Live AI Engine Suggestions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {suggestions.map((sug, i) => (
                <div key={i} className="p-2 rounded-lg bg-surface-3/50 border border-border/20 text-foreground/95 flex gap-1.5 items-start">
                  <span className="text-primary font-bold">✦</span>
                  <p>{sug}</p>
                </div>
              ))}
              {suggestions.length === 0 && (
                <p className="text-muted-foreground text-[11px] py-1.5 sm:col-span-2">AI is evaluating your manual updates in real-time...</p>
              )}
            </div>
          </div>

          {/* Add custom item manually */}
          <div className="bg-surface-2/40 border border-border/40 rounded-xl p-3.5 flex flex-col justify-center">
            {!showAddNewForm ? (
              <button 
                onClick={() => setShowAddNewForm(true)}
                className="w-full p-2.5 rounded-lg bg-surface-3 border border-border/50 text-xs font-display font-bold hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-primary" /> Add Custom Product
              </button>
            ) : (
              <form onSubmit={handleAddManualProduct} className="space-y-2 text-xs">
                <input 
                  type="text"
                  required
                  placeholder="Product Name"
                  value={newProductName}
                  onChange={e => setNewProductName(e.target.value)}
                  className="w-full p-2 rounded bg-card border border-border focus:outline-none"
                />
                <div className="grid grid-cols-3 gap-1">
                  <input 
                    type="number"
                    required
                    placeholder="Cost ₦"
                    value={newProductCost}
                    onChange={e => setNewProductCost(e.target.value)}
                    className="p-2 rounded bg-card border border-border focus:outline-none"
                  />
                  <input 
                    type="number"
                    required
                    placeholder="Sell ₦"
                    value={newProductPrice}
                    onChange={e => setNewProductPrice(e.target.value)}
                    className="p-2 rounded bg-card border border-border focus:outline-none"
                  />
                  <input 
                    type="number"
                    required
                    placeholder="Qty"
                    value={newProductQty}
                    onChange={e => setNewProductQty(e.target.value)}
                    className="p-2 rounded bg-card border border-border focus:outline-none"
                  />
                </div>
                <div className="flex gap-1.5">
                  <button type="submit" className="flex-1 py-1.5 bg-primary text-primary-foreground font-display font-bold rounded">Add</button>
                  <button type="button" onClick={() => setShowAddNewForm(false)} className="flex-1 py-1.5 bg-surface-3 border border-border rounded">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Buy List Table */}
        <div className="border border-border/60 rounded-xl overflow-hidden bg-card flex-1 min-h-[250px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border/80 text-muted-foreground uppercase font-bold text-[10px]">
                <th className="p-3 w-8"></th>
                <th className="p-3">Product Name</th>
                <th className="p-3 w-28">Supplier</th>
                <th className="p-3 w-20 text-center">Stock</th>
                <th className="p-3 w-24 text-center">Restock Qty</th>
                <th className="p-3 w-24 text-right">Cost Price</th>
                <th className="p-3 w-24 text-right">Total Cost</th>
                <th className="p-3 w-16 text-center">Score</th>
                <th className="p-3 w-40">AI Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {itemsList.map(it => (
                <tr 
                  key={it.id} 
                  className={`hover:bg-surface-2/40 transition-colors ${
                    it.selected ? 'bg-primary/5' : 'opacity-60'
                  } ${
                    availableBudget <= 0 && it.selected ? 'border-l-2 border-destructive' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <button 
                      onClick={() => toggleSelectItem(it.id)}
                      className="text-primary hover:scale-105"
                    >
                      {it.selected ? (
                        <CheckSquare className="w-4 h-4 text-primary fill-primary/10" />
                      ) : (
                        <div className="w-4 h-4 rounded border border-muted-foreground/60" />
                      )}
                    </button>
                  </td>
                  <td className="p-3 font-semibold text-foreground flex items-center gap-1.5">
                    {it.isNewProduct && (
                      <span className="px-1.5 py-0.5 rounded bg-success/20 text-success text-[9px] font-bold uppercase tracking-wider">🆕 OPPORTUNITY</span>
                    )}
                    {it.name}
                  </td>
                  <td className="p-3">
                    <select 
                      value={it.supplier}
                      onChange={e => handleUpdateSupplier(it.id, e.target.value)}
                      className="p-1 rounded bg-surface-2 border border-border text-[11px] focus:outline-none"
                    >
                      {suppliers.length > 0 ? (
                        suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)
                      ) : (
                        <option value="Default Supplier">Default Supplier</option>
                      )}
                    </select>
                  </td>
                  <td className="p-3 text-center font-mono font-bold">{it.currentStock}</td>
                  <td className="p-3 text-center">
                    <input 
                      type="number"
                      value={it.suggestedQty}
                      onChange={e => handleUpdateQty(it.id, parseFloat(e.target.value) || 1)}
                      className="w-16 p-1 rounded bg-surface-2 border border-border text-center font-mono focus:outline-none"
                    />
                  </td>
                  <td className="p-3 text-right font-mono">
                    <input 
                      type="number"
                      value={it.costPrice}
                      onChange={e => handleUpdateCost(it.id, parseFloat(e.target.value) || 0)}
                      className="w-20 p-1 rounded bg-surface-2 border border-border text-right font-mono focus:outline-none"
                    />
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-foreground">
                    ₦{(it.suggestedQty * it.costPrice).toLocaleString()}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      it.priorityScore >= 75 ? 'bg-destructive/15 text-destructive' : it.priorityScore >= 45 ? 'bg-yellow-500/10 text-yellow-500' : 'bg-success/15 text-success'
                    }`}>
                      {it.priorityScore}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-[11px] leading-snug">{it.reason}</td>
                </tr>
              ))}
              {itemsList.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground text-xs">
                    Generating restock recommendations...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            {availableBudget <= 0 ? (
              <span className="text-destructive font-semibold">⚠️ No available funds for restocking. Recommendations marked as Pending.</span>
            ) : (
              <span>Remaining budget after this purchase: <strong>₦{totals.remaining.toLocaleString()}</strong></span>
            )}
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:bg-surface-3 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              onClick={handleReceiveBuyList}
              disabled={totals.count === 0 || totals.totalCost > availableBudget}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-primary text-primary-foreground disabled:opacity-40 font-display font-bold text-xs rounded-xl shadow-md cursor-pointer hover:opacity-95"
            >
              📥 Approve & Receive Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
