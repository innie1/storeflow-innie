import { useState, useMemo, useEffect, useRef } from 'react';
import { StoreData, Product, CustomerRequest, PlannedRestock } from '@/types/store';
import { receiveStock, addPurchaseOrder, sumOperatingExpenses } from '@/lib/store-data';
import { getLowStockThreshold } from '@/lib/settings';
import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';
import {
  TrendingUp, AlertTriangle, Coins, Sparkles, CheckCircle,
  Trash2, Plus, Info, Lightbulb, CheckSquare, Square
} from 'lucide-react';

/**
 * Does this customer request mention this product by name?
 *
 * Matched on word boundaries. text.includes(name) counted "Ginger" as a
 * request for "Gin", inflating the request score of any product whose name
 * is a fragment of a longer word.
 */
function matchesProductName(requestText: string, productName: string): boolean {
  const name = productName.trim().toLowerCase();
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(requestText.toLowerCase());
}

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
  idealQty?: number;
  costPrice: number;
  sellingPrice: number;
  priorityScore: number;
  priorityLabel: '🔴 High' | '🟡 Medium' | '🟢 Low';
  reason: string;
  supplier: string;
  isNewProduct?: boolean;
  requestsCount?: number;
  selected: boolean;
}

export default function SmartRestockEngine({ store, onUpdate, onClose }: SmartRestockEngineProps) {
  // Available budget = Net Income (exact dashboard stats)
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = sumOperatingExpenses(store);
  const savingsSaved = store.savingsGoal?.saved || 0;
  const netIncome = totalRevenue - totalExpenses - savingsSaved;
  const availableBudget = Math.max(0, netIncome);

  // Buy List settings
  const [coverageDays, setCoverageDays] = useState(14);
  const [buyOnlyToMin, setBuyOnlyToMin] = useState(false);
  const [itemsList, setItemsList] = useState<BuyListItem[]>([]);
  // Simple = pick items, edit quantity freely, see a running total, approve & share.
  // Smart Budget = the AI proportional-allocation engine (existing behaviour), for
  // merchants who specifically want quantities auto-fitted to their available balance.
  const [mode, setMode] = useState<'simple' | 'smart'>('simple');
  const [showAddNewForm, setShowAddNewForm] = useState(false);
  /** Set once a list is approved, so the result can be shown rather than toasted away. */
  const [approved, setApproved] = useState<{
    importCode: string | null;
    itemCount: number;
    plannedCount: number;
    total: number;
  } | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCost, setNewProductCost] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductQty, setNewProductQty] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Groceries');
  const [newProductSupplier, setNewProductSupplier] = useState('Default Supplier');

  const suppliers = useMemo(() => store.suppliers || [], [store.suppliers]);
  const sales = useMemo(() => store.sales || [], [store.sales]);
  const requests = useMemo(() => store.customerRequests || [], [store.customerRequests]);
  const restockHistory = useMemo(() => store.restocks || [], [store.restocks]);
  const [searchQuery, setSearchQuery] = useState('');

  const lowStockThreshold = getLowStockThreshold();

  // How many days of history this store actually has, capped at the 30-day
  // window, so a young store is not reported as selling a fraction of what it
  // does.
  const observedDays = useMemo(() => {
    const opened = store.createdAt ? new Date(store.createdAt).getTime() : Date.now();
    const days = (Date.now() - opened) / (24 * 60 * 60 * 1000);
    return Math.min(30, Math.max(1, Math.round(days)));
  }, [store.createdAt]);

  // 1. Run the Restock recommendation engine
  const generatedRecommendations = useMemo(() => {
    const list: BuyListItem[] = [];

    // Map existing products
    store.products.filter(p => !p.discontinued).forEach(p => {
      const isOutOfStock = p.quantity <= 0;

      // The restock point. This used to read p.minimumStock, which does not
      // exist on Product and never has — so it was `undefined || 5` for every
      // product in every store, and the "minimum stock level" the UI talks
      // about was a hardcoded 5 no merchant could change. reorderLevel is the
      // real field: the owner sets it, and Flow's "set a reorder level" Auto
      // Fix sets it to roughly a week of stock.
      const reorderPoint = p.reorderLevel ?? lowStockThreshold;
      const isBelowMin = p.quantity < reorderPoint;

      // Sales velocity. Dividing by a flat 30 understated every product in a
      // store younger than a month — a shop open a week looked like it sold a
      // quarter of what it does.
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const pSales = sales.filter(s => s.productId === p.id);
      const recentSales = pSales.filter(s => new Date(s.date).getTime() >= thirtyDaysAgo);
      const totalQtySold = recentSales.reduce((sum, s) => sum + s.quantity, 0);
      const avgDailySales = totalQtySold / observedDays;

      // 1. Stock urgency (up to 40%)
      let stockScore = 0;
      if (isOutOfStock) {
        stockScore = 40;
      } else {
        stockScore = Math.max(0, 40 * (1 - p.quantity / Math.max(1, reorderPoint)));
      }

      // 2. Sales velocity (up to 30%)
      let velocityScore = 5;
      if (avgDailySales >= 5) velocityScore = 30;
      else if (avgDailySales >= 2) velocityScore = 20;
      else if (avgDailySales >= 0.5) velocityScore = 10;

      // 3. Days since last sale (up to 10%)
      const lastSaleDate = pSales.length > 0 ? new Date(pSales[0].date).getTime() : 0;
      const daysSinceLastSale = lastSaleDate > 0 ? (Date.now() - lastSaleDate) / (24 * 60 * 60 * 1000) : 999;
      let scoreLastSale = 0;
      if (daysSinceLastSale <= 3) scoreLastSale = 10;
      else if (daysSinceLastSale <= 10) scoreLastSale = 5;

      // 4. Profit margin (up to 10%)
      const marginPct = p.costPrice > 0 ? (p.sellingPrice - p.costPrice) / p.sellingPrice : 0;
      let scoreMargin = 2;
      if (marginPct >= 0.4) scoreMargin = 10;
      else if (marginPct >= 0.2) scoreMargin = 5;

      // 5. Customer Requests (up to 10%)
      // Whole-word match. A plain substring counted every request for
      // "Ginger" as a request for a product called "Gin".
      const reqCount = requests.filter(r => matchesProductName(r.text, p.name)).length;
      let scoreRequests = 0;
      if (reqCount >= 5) scoreRequests = 10;
      else if (reqCount >= 1) scoreRequests = 5;

      // Calculate priority score (0 - 100)
      const priorityScore = Math.min(100, Math.round(stockScore + velocityScore + scoreLastSale + scoreMargin + scoreRequests));

      // Priority labels
      let priorityLabel: '🔴 High' | '🟡 Medium' | '🟢 Low' = '🟢 Low';
      if (isOutOfStock || isBelowMin) {
        priorityLabel = '🔴 High';
      } else if (p.quantity <= reorderPoint * 1.5) {
        priorityLabel = '🟡 Medium';
      }

      // How much to buy.
      //
      // This was `p.maximumStock || minStock * 2`. Neither field exists on
      // Product, so every product in every store resolved to the same target of
      // 10 units — one selling fifty a day and one that has never sold got the
      // same suggestion. The five-factor priority score above only ever
      // affected the ordering and the colour of the label; it never reached the
      // quantity. That is what made Smart Restock not smart.
      //
      // The target is now what the product actually sells over the coverage
      // window, floored at its reorder point so a slow mover is still brought
      // back to a sensible shelf level and never below it.
      const demandTarget = Math.ceil(avgDailySales * coverageDays);
      const targetStock = buyOnlyToMin
        ? reorderPoint
        : Math.max(reorderPoint, demandTarget);

      // Never suggest buying products already at or above target stock
      if (p.quantity >= targetStock) {
        return;
      }

      const suggestedQty = Math.max(1, targetStock - p.quantity);

      // "How you usually buy it" — blend the stock-gap number with what this
      // merchant has actually ordered for this product in the past, so the
      // suggestion isn't just a mechanical target-minus-current-stock number.
      const pastOrders = restockHistory
        .filter(r => r.productId === p.id)
        .slice(-3)
        .map(r => r.quantity)
        .filter(q => q > 0);
      const usualOrderQty = pastOrders.length > 0
        ? Math.round(pastOrders.reduce((a, b) => a + b, 0) / pastOrders.length)
        : null;
      const finalQty = usualOrderQty
        ? Math.max(1, Math.round((suggestedQty + usualOrderQty) / 2))
        : suggestedQty;

      // Explanation reason
      let reason = `Brings stock back to its reorder level of ${reorderPoint}.`;
      if (p.quantity <= 0) reason = 'Product is completely out of stock.';
      else if (reqCount >= 5) reason = `Frequently requested by ${reqCount} customers this month.`;
      else if (demandTarget > reorderPoint && avgDailySales > 0) {
        reason = `Sells about ${avgDailySales.toFixed(1)} a day — ${coverageDays} days of cover is ${demandTarget}.`;
      }
      else if (isBelowMin) reason = `Below its reorder level of ${reorderPoint}.`;
      if (usualOrderQty) reason += ` You've typically ordered ~${usualOrderQty} at a time.`;

      list.push({
        id: p.id,
        name: p.name,
        category: p.category || 'General',
        currentStock: p.quantity,
        suggestedQty: finalQty,
        idealQty: finalQty,
        costPrice: p.costPrice || 100,
        sellingPrice: p.sellingPrice || 150,
        priorityScore,
        priorityLabel,
        reason,
        supplier: suppliers[0]?.name || 'Default Supplier',
        selected: false
      });
    });

    // 2. New Product Opportunities
    const productNames = store.products.map(p => p.name.toLowerCase());
    const unmatchedRequests = requests.filter(r => !productNames.some(name => r.text.toLowerCase().includes(name)));

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
        const priorityScore = Math.min(100, count * 10 + 15);
        list.push({
          id: `new-${Math.random().toString(36).slice(2, 6)}`,
          name: keyword,
          category: 'New Request',
          currentStock: 0,
          suggestedQty: count * 10,
          idealQty: count * 10,
          costPrice: 250,
          sellingPrice: 350,
          priorityScore,
          priorityLabel: '🟡 Medium',
          reason: `Requested by ${count} customers. Potential monthly profit: ₦${potentialProfit.toLocaleString()}`,
          supplier: suppliers[0]?.name || 'Default Supplier',
          isNewProduct: true,
          requestsCount: count,
          selected: false
        });
      }
    });

    // Sort by Priority Score descending
    return list.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [store.products, sales, requests, suppliers, buyOnlyToMin, restockHistory, coverageDays, lowStockThreshold, observedDays]);

  // Intelligent Proportionate Budget Distribution (AI Optimizer - Step 5 & 6)
  const allocateBudgetProportionally = (list: BuyListItem[], budget: number): BuyListItem[] => {
    if (list.length === 0) return list;

    if (budget <= 0) {
      // No available cash doesn't mean no useful information. Instead of
      // zeroing every item out (which used to leave the merchant with zero
      // guidance exactly when they most need to know what's critical),
      // show the full priority-ranked list with the quantity that would
      // ideally be restocked — nothing is pre-selected since there's no
      // balance to fund it automatically, but the merchant can still see
      // what's most urgent and choose to fund specific items with new
      // money (a loan, personal top-up, etc.) rather than getting nothing.
      return list.map(item => ({
        ...item,
        suggestedQty: item.idealQty || 1,
        selected: false,
      }));
    }

    const updated = list.map(item => ({
      ...item,
      suggestedQty: 0,
      selected: false
    }));

    // Split items into High and Medium/Low lists
    const highItems = updated.filter(item => item.priorityLabel === '🔴 High');
    const mediumLowItems = updated.filter(item => item.priorityLabel === '🟡 Medium' || item.priorityLabel === '🟢 Low');

    // If we only have one category, allocate 100% budget to it proportionately
    if (highItems.length === 0 || mediumLowItems.length === 0) {
      return runProportionateAllocation(updated, budget);
    }

    // Two-Pool Budget Splitter: 60% High, 40% Medium/Low
    const highPool = budget * 0.60;
    let mediumPool = budget * 0.40;

    // 1. Allocate High Priority Pool (60%)
    let highRemaining = highPool;

    // Assign baseline of 1 unit to each high item first
    highItems.forEach(item => {
      const costForOne = Math.min(item.idealQty || 1, 1) * item.costPrice;
      if (highRemaining >= costForOne) {
        item.suggestedQty = Math.min(item.idealQty || 1, 1);
        item.selected = true;
        highRemaining -= costForOne;
      }
    });

    // Distribute remaining high pool proportionately to scores
    const growableHigh = highItems.filter(item => item.selected && (item.idealQty || 1) > item.suggestedQty);
    const sumHighScores = growableHigh.reduce((sum, item) => sum + item.priorityScore, 0);

    if (sumHighScores > 0 && highRemaining > 0) {
      growableHigh.forEach(item => {
        const share = highRemaining * (item.priorityScore / sumHighScores);
        const maxAdditional = (item.idealQty || 1) - item.suggestedQty;
        let additionalQty = Math.floor(share / item.costPrice);
        additionalQty = Math.max(0, Math.min(maxAdditional, additionalQty));

        item.suggestedQty += additionalQty;
        highRemaining -= additionalQty * item.costPrice;
      });
    }

    // Add any leftover high pool cash to the medium pool
    mediumPool += highRemaining;

    // 2. Allocate Medium/Low Priority Pool (40% + leftover)
    let mediumRemaining = mediumPool;

    // Assign baseline of 1 unit to each medium/low item first
    mediumLowItems.forEach(item => {
      const costForOne = Math.min(item.idealQty || 1, 1) * item.costPrice;
      if (mediumRemaining >= costForOne) {
        item.suggestedQty = Math.min(item.idealQty || 1, 1);
        item.selected = true;
        mediumRemaining -= costForOne;
      }
    });

    // Distribute remaining medium pool equally
    const growableMedium = mediumLowItems.filter(item => item.selected && (item.idealQty || 1) > item.suggestedQty);

    if (growableMedium.length > 0 && mediumRemaining > 0) {
      let activeGrowable = [...growableMedium];
      let cashToDistribute = mediumRemaining;

      // Loop to distribute equally, capping at idealQty
      let progress = true;
      while (cashToDistribute > 0 && activeGrowable.length > 0 && progress) {
        progress = false;
        const equalShare = cashToDistribute / activeGrowable.length;
        const nextGrowable: typeof activeGrowable = [];

        for (const item of activeGrowable) {
          const maxAdditional = (item.idealQty || 1) - item.suggestedQty;
          if (maxAdditional <= 0) continue;

          let additionalQty = Math.floor(equalShare / item.costPrice);
          additionalQty = Math.max(0, Math.min(maxAdditional, additionalQty));

          if (additionalQty > 0) {
            item.suggestedQty += additionalQty;
            cashToDistribute -= additionalQty * item.costPrice;
            progress = true;
          }

          if (item.suggestedQty < (item.idealQty || 1)) {
            nextGrowable.push(item);
          }
        }
        activeGrowable = nextGrowable;
      }
      mediumRemaining = cashToDistribute;
    }

    // 3. Final Leftover Pass (Greedy round-robin to fully optimize remaining budget)
    let totalRemaining = mediumRemaining;
    if (totalRemaining > 0) {
      const allGrowable = updated
        .filter(item => item.selected && item.suggestedQty < (item.idealQty || 1))
        .sort((a, b) => b.priorityScore - a.priorityScore);

      let progress = true;
      while (totalRemaining > 0 && progress) {
        progress = false;
        for (const item of allGrowable) {
          if (totalRemaining >= item.costPrice && item.suggestedQty < (item.idealQty || 1)) {
            item.suggestedQty += 1;
            totalRemaining -= item.costPrice;
            progress = true;
          }
        }
      }
    }

    // Map labels and clean up
    const finalList = updated.map(item => {
      if (item.suggestedQty <= 0) {
        return {
          ...item,
          selected: false,
          reason: item.reason + ' (Pending until funds become available)'
        };
      }

      const scaledDiff = (item.idealQty || 1) - item.suggestedQty;
      if (scaledDiff > 0) {
        return {
          ...item,
          reason: item.reason + ` (Scaled to fit budget split: 60% High / 40% Med)`
        };
      }

      return item;
    });

    // A positive budget can still be too small to afford even ONE unit of
    // the cheapest priority item — every item would silently end up at 0
    // quantity above with no real explanation, which looks identical to
    // "the engine is broken" from the merchant's side. If literally
    // nothing could be afforded, fall back to the same triage treatment
    // used when there's no budget at all: show what's needed, unselected,
    // so there's always a visible, honest answer instead of a wall of
    // zeros.
    if (finalList.every(item => item.suggestedQty <= 0)) {
      return list.map(item => ({ ...item, suggestedQty: item.idealQty || 1, selected: false }));
    }

    return finalList;
  };

  // Helper for single category fallback
  const runProportionateAllocation = (list: BuyListItem[], budget: number): BuyListItem[] => {
    const updated = list.map(it => ({ ...it, suggestedQty: 0, selected: false }));
    const baselineCost = updated.reduce((sum, item) => sum + Math.min(item.idealQty || 1, 1) * item.costPrice, 0);

    if (baselineCost > budget) {
      let remainingCash = budget;
      const sorted = [...updated].sort((a, b) => b.priorityScore - a.priorityScore);
      const allocated = sorted.map(item => {
        const costForOne = Math.min(item.idealQty || 1, 1) * item.costPrice;
        if (remainingCash >= costForOne && costForOne > 0) {
          remainingCash -= costForOne;
          return {
            ...item,
            suggestedQty: Math.min(item.idealQty || 1, 1),
            selected: true,
            reason: item.reason + ' (Restocked with 1 unit due to critical budget constraints)'
          };
        } else {
          return {
            ...item,
            suggestedQty: 0,
            selected: false,
            reason: item.reason + ' (Pending until funds become available)'
          };
        }
      });
      // Budget too small to afford even the single cheapest item: same
      // triage fallback as the two-pool allocator above, rather than a
      // silent wall of zeros that looks like the engine is broken.
      if (allocated.every(item => item.suggestedQty <= 0)) {
        return list.map(item => ({ ...item, suggestedQty: item.idealQty || 1, selected: false }));
      }
      return allocated.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    updated.forEach(item => {
      item.suggestedQty = Math.min(item.idealQty || 1, 1);
      item.selected = true;
    });

    let remainingCash = budget - baselineCost;
    const growable = updated.filter(item => (item.idealQty || 1) > 1);
    const sumScores = growable.reduce((sum, item) => sum + item.priorityScore, 0);

    if (sumScores > 0 && remainingCash > 0) {
      growable.forEach(item => {
        const share = remainingCash * (item.priorityScore / sumScores);
        const maxAdditional = (item.idealQty || 1) - 1;
        let additionalQty = Math.floor(share / item.costPrice);
        additionalQty = Math.max(0, Math.min(maxAdditional, additionalQty));
        item.suggestedQty += additionalQty;
        remainingCash -= additionalQty * item.costPrice;
      });
    }

    return updated.map(item => {
      if (item.suggestedQty <= 0) return { ...item, selected: false };
      return item;
    });
  };

  // Sync recommendation engine list on load only. Previously this re-ran
  // (and silently wiped any manual quantity/cost/selection edits the
  // merchant had made) every time `store` changed identity — which happens
  // on background realtime sync from another device, not just when the
  // merchant themselves changes something. Now it only auto-populates once
  // when the engine opens.
  //
  // Default population is the item's real restocking need (idealQty),
  // NOTHING selected by default. Two problems this fixes at once:
  // 1) Squashing quantities around a ₦0 balance on open used to look like
  //    the list itself was broken instead of just "pick what you want."
  // 2) Opening with every item pre-checked at a flat default meant the
  //    merchant had to manually deselect things they didn't want, rather
  //    than opting in to what they do. Selection now only happens by the
  //    merchant tapping items themselves, or tapping "Smart Pick" to have
  //    the priority engine choose for them.
  // Budget-fitted quantities remain opt-in via "Optimize Buy List" in
  // Smart Budget mode.
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    setItemsList(generatedRecommendations.map(item => ({
      ...item,
      suggestedQty: item.idealQty || 1,
      selected: false,
    })));
  }, [generatedRecommendations]);

  // Smart Pick — auto-selects items using the same priority scoring as the
  // table (stock urgency, sales velocity, recency, margin, customer
  // requests) plus each item's blended "usual order size". Doesn't touch
  // anything the merchant has already hand-picked or hand-edited; only
  // fills in a sensible starting selection.
  const handleSmartPick = () => {
    setItemsList(prev => {
      const picked = prev.map(it => {
        const shouldPick = it.priorityLabel === '🔴 High' || it.priorityLabel === '🟡 Medium' || it.priorityScore >= 55;
        return shouldPick ? { ...it, selected: true, suggestedQty: it.idealQty || it.suggestedQty || 1 } : it;
      });
      const pickedCount = picked.filter(it => it.selected).length;
      showToast(pickedCount > 0 ? `Smart Pick selected ${pickedCount} item${pickedCount === 1 ? '' : 's'}` : 'Nothing urgent right now — everything looks well stocked.', 'success');
      return picked;
    });
  };

  const handleClearList = () => {
    setItemsList(prev => prev.map(it => ({ ...it, selected: false })));
  };

  const filteredItemsList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return itemsList;
    return itemsList.filter(it => it.name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q));
  }, [itemsList, searchQuery]);

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
    const optimized = allocateBudgetProportionally(itemsList, availableBudget);
    setItemsList(optimized);
    showToast(
      availableBudget <= 0
        ? 'No cash available right now — showing what\u2019s most critical to restock when you can.'
        : 'Buy List optimized proportionately to fit your budget!',
      availableBudget <= 0 ? 'info' : 'success'
    );
  };

  // Add manually created item
  const handleAddManualProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductCost || !newProductPrice || !newProductQty) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    const qty = parseFloat(newProductQty);
    const newItem: BuyListItem = {
      id: `manual-${Math.random().toString(36).slice(2, 6)}`,
      name: newProductName.trim(),
      category: newProductCategory,
      currentStock: 0,
      suggestedQty: qty,
      idealQty: qty,
      costPrice: parseFloat(newProductCost),
      sellingPrice: parseFloat(newProductPrice),
      priorityScore: 30, // medium priority for manual add
      priorityLabel: '🟡 Medium',
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

  // Format and share buy list via system share sheet or clipboard
  const handleShareBuyList = async () => {
    const selectedItems = itemsList.filter(it => it.selected);
    if (selectedItems.length === 0) return;

    // Selected cost exceeding available balance-funded budget is no longer
    // a hard block: it usually means the merchant is knowingly funding
    // critical restocks with new money (a loan, personal top-up) rather
    // than balance, which is a legitimate real scenario — not an error.
    // Just make sure they know before it goes out.
    if (mode === 'smart' && totals.totalCost > availableBudget) {
      showToast(`Heads up: this list costs ₦${(totals.totalCost - Math.max(0, availableBudget)).toLocaleString()} more than your available balance — you'll need new money to cover it.`, 'info');
    }

    // Create a Purchase Order record for this list — this is what gives it
    // a Purchase Import Code. Existing products only: brand-new product
    // opportunities and manually-typed items don't have a real productId
    // yet, so a code covering them would fail to import cleanly. They still
    // appear in the shared text, just aren't part of the redeemable code.
    const codableItems = selectedItems.filter(it => !it.isNewProduct && !it.id.startsWith('manual-'));
    let importCode: string | null = null;
    let storeAfterPO = store;
    if (codableItems.length > 0) {
      storeAfterPO = addPurchaseOrder(store, {
        items: codableItems.map(it => ({ productId: it.id, name: it.name, qty: it.suggestedQty, costPrice: it.costPrice })),
        totalCost: codableItems.reduce((sum, it) => sum + it.suggestedQty * it.costPrice, 0),
        status: 'ordered',
        // Which mode built this. It was always 'manual', so a list Flow had
        // sized was indistinguishable from one the merchant typed by hand.
        source: mode === 'smart' ? 'smart_budget' : 'manual',
      });
      importCode = storeAfterPO.purchaseOrders?.[0]?.importCode || null;
    }

    // Format list details
    let text = `📋 StoreFlow Restock Buy List — ${store.storeName}\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    if (importCode) {
      text += `🔑 Purchase Import Code: ${importCode}\n`;
      text += `   (After buying, enter this code in Inventory > Import to add these items to stock)\n`;
    }
    text += `==========================\n\n`;

    selectedItems.forEach((it, idx) => {
      text += `${idx + 1}. ${it.name}\n`;
      text += `   • Qty to Buy: ${it.suggestedQty}\n`;
      text += `   • Unit Cost: ₦${it.costPrice.toLocaleString()}\n`;
      text += `   • Total Cost: ₦${(it.suggestedQty * it.costPrice).toLocaleString()}\n`;
      text += `   • Supplier: ${it.supplier}\n\n`;
    });

    text += `==========================\n`;
    text += `🧾 Total Items: ${selectedItems.length}\n`;
    text += `📦 Total Quantity: ${totals.qty}\n`;
    text += `📉 Total Cost: ₦${totals.totalCost.toLocaleString()}\n`;
    text += `📈 Expected Revenue: ₦${totals.estRevenue.toLocaleString()}\n`;
    text += `💎 Expected Profit: ₦${totals.estProfit.toLocaleString()}\n`;
    if (availableBudget > 0) {
      text += `💰 Business Balance: ₦${availableBudget.toLocaleString()}\n`;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Buy List - ${store.storeName}`,
          text: text
        });
        showToast(importCode ? `✓ Shared! Import code: ${importCode}` : '✓ Buy List shared successfully!', 'success');
      } catch (err) {
        // user aborted or sharing failed
        navigator.clipboard.writeText(text);
        showToast('✓ Copied to clipboard!', 'success');
      }
    } else {
      navigator.clipboard.writeText(text);
      showToast(importCode ? `✓ Copied! Import code: ${importCode}` : '✓ Copied to clipboard! Share via WhatsApp or Messenger.', 'success');
    }

    // Push approved items for existing products into Planned Restocks so
    // they show up under Inventory > Planned Restocks and can be received
    // in one tap once the goods arrive — instead of the approval just
    // sharing a text list with no record kept in the app itself. Brand-new
    // product opportunities and manually-typed items don't have a real
    // product yet, so they're excluded here (add the product first, then
    // it'll flow through this the next time).
    const plannableItems = selectedItems.filter(it => !it.isNewProduct && !it.id.startsWith('manual-'));
    const newPlannedRestocks = plannableItems.map(it => ({
      id: Math.random().toString(36).substring(2, 9),
      productId: it.id,
      productName: it.name,
      quantity: it.suggestedQty,
      costPrice: it.costPrice,
      funding: 'balance' as const,
      date: new Date().toISOString()
    }));

    // Log the approval and share action in the activity logs
    const logs = store.activityLogs || [];
    const newLog = {
      id: Math.random().toString(36).slice(2, 9),
      store_id: store.accessCode,
      action: 'Approved & Shared Buy List',
      description: `Approved & Shared Buy List with ${selectedItems.length} items (Total: ₦${totals.totalCost.toLocaleString()})${importCode ? ` — code ${importCode}` : ''}`,
      created_at: new Date().toISOString()
    };

    onUpdate({
      ...storeAfterPO,
      activityLogs: [newLog as any, ...logs],
      plannedRestocks: [...newPlannedRestocks, ...(store.plannedRestocks || [])]
    });

    // Approving used to fire a toast naming two places the list had gone and
    // then close, leaving the merchant on the inventory grid with no way to see
    // what they had just made. It now says what was created and where it lives,
    // and stays until they choose.
    setApproved({
      importCode,
      itemCount: selectedItems.length,
      plannedCount: newPlannedRestocks.length,
      total: totals.totalCost,
    });
  };

  // Live Suggestions pane
  const suggestions = useMemo(() => {
    const list: string[] = [];

    // Sum up ideal cost (cost of all items at idealQty before budget limits)
    const idealTotalCost = itemsList.reduce((sum, it) => sum + (it.idealQty || it.suggestedQty) * it.costPrice, 0);
    const additionalCash = Math.max(0, idealTotalCost - availableBudget);

    if (additionalCash > 0) {
      list.push(`With your current cash, I recommend buying your fastest-selling products first (prioritized above).`);
      list.push(`You need an additional ₦${additionalCash.toLocaleString()} to fully restock to target levels.`);
    } else if (totals.totalCost > 0) {
      list.push(`All recommended restocks fully funded! Expected profit: ₦${totals.estProfit.toLocaleString()}.`);
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

  // What was created, and where to find it. Approving used to close the modal
  // behind a toast, so the list the merchant had just built vanished with no
  // trail — the single most common "where did it go?" moment in the app.
  if (approved) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
        <ScrollLock />
        <div className="w-full max-w-sm bg-card border border-border/50 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-in text-center" onClick={e => e.stopPropagation()}>
          <div className="w-12 h-12 rounded-2xl bg-success/15 text-success flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base">Buy list saved</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {approved.itemCount} item{approved.itemCount === 1 ? '' : 's'} · ₦{Math.round(approved.total).toLocaleString()}
            </p>
          </div>

          {approved.importCode && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Purchase import code</p>
              <p className="font-mono font-bold text-primary text-base tracking-wider mt-0.5">{approved.importCode}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter this in Stock → Import once the goods arrive and everything is added back for you.
              </p>
            </div>
          )}

          <div className="text-left text-[11px] text-muted-foreground space-y-1">
            <p>• Find it any time under <b className="text-foreground">Stock → My Buy Lists</b>.</p>
            {approved.plannedCount > 0 && (
              <p>• {approved.plannedCount} item{approved.plannedCount === 1 ? '' : 's'} also queued under <b className="text-foreground">Planned Restocks</b>.</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <ScrollLock />
      <div className="w-full max-w-5xl bg-card border border-border/50 rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 animate-scale-in text-left flex flex-col no-scrollbar" onClick={e => e.stopPropagation()}>
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

        {/* Simple / Smart Budget mode switch */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2/60 border border-border/40 rounded-xl w-full sm:w-fit">
          <button
            onClick={() => setMode('simple')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-display font-bold transition ${
              mode === 'simple' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            ✋ Hand-pick
          </button>
          <button
            onClick={() => setMode('smart')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-display font-bold transition ${
              mode === 'smart' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            ✨ Smart
          </button>
        </div>
        {/* The two modes decide who picks the quantities, which is the whole
            difference between them and was not what the old labels said. The
            list keeps that answer afterwards, and shows it as a badge. */}
        <p className="text-[11px] text-muted-foreground -mt-2">
          {mode === 'simple'
            ? 'You choose the items and the quantities. Saved as a Hand-picked list.'
            : `Flow sizes each order from what the product sells and fits the total to your balance. Saved as a Smart list.`}
        </p>

        {mode === 'smart' && (
          <>
            {/* Mode Toggle Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-border/40 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground font-semibold">Buy Only to Minimum Stock</span>
                <button
                  onClick={() => setBuyOnlyToMin(!buyOnlyToMin)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-outline-none ${
                    buyOnlyToMin ? 'bg-success' : 'bg-surface-3 border-border'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      buyOnlyToMin ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleOptimizeBudget}
                  className="px-3.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary font-display font-bold text-xs rounded-xl transition border border-primary/20 cursor-pointer"
                >
                  🪄 Optimize Buy List
                </button>
                {/* The window the suggested quantities are sized for. This
                    setting existed in state from the beginning but was never
                    read by the engine and never shown, so "how long should this
                    order last" had no answer and no control. */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Cover for</span>
                  <select
                    value={coverageDays}
                    onChange={e => setCoverageDays(Number(e.target.value))}
                    aria-label="Days of stock each order should cover"
                    className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs font-bold text-foreground"
                  >
                    {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                  <span className="hidden sm:inline">
                    · {buyOnlyToMin ? 'topping up to reorder level only' : 'sized to what each item sells'}
                  </span>
                </div>
              </div>
            </div>

            {availableBudget <= 0 && (
              <div className="p-3.5 bg-warning/10 border border-warning/25 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
                <div className="text-xs text-foreground leading-snug">
                  <p className="font-display font-bold text-warning">Business Balance is at or below zero</p>
                  <p className="text-muted-foreground mt-0.5">
                    "Optimize Buy List" won't be able to auto-fund anything until your balance recovers. You can still tick items and set quantities yourself — that always works regardless of balance.
                  </p>
                </div>
              </div>
            )}

            {/* Dashboard Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Available Budget</span>
            <p className="font-display font-bold text-lg text-success mt-0.5">₦{availableBudget.toLocaleString()}</p>
            {availableBudget <= 0 && <span className="text-[9px] text-destructive font-semibold">No restocking cash available</span>}
          </div>          <div className="p-3 bg-surface-2/40 border border-border/40 rounded-xl">
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
          </>
        )}

        {/* Running total — visible in both modes, this is the "how many, how much" summary */}
        <div className="flex items-center justify-between gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Items Selected</span>
              <span className="font-display font-bold text-base text-foreground">{totals.count}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Quantity</span>
              <span className="font-display font-bold text-base text-foreground">{totals.qty}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Amount</span>
            <span className="font-display font-bold text-lg text-primary">₦{totals.totalCost.toLocaleString()}</span>
          </div>
        </div>

        {/* Search + Smart Pick + Clear List */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Search products..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2/60 border border-border text-xs focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleSmartPick}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary font-display font-bold text-xs transition"
            >
              🧠 Smart Pick
            </button>
            <button
              onClick={handleClearList}
              disabled={totals.count === 0}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-surface-2/60 hover:bg-surface-3 border border-border text-muted-foreground disabled:opacity-40 font-display font-bold text-xs transition"
            >
              ✕ Clear List
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Smart Pick considers what's low or out of stock, what's actually selling, what customers have asked for, and how much you usually order — it won't touch anything you've already picked by hand.
        </p>

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

        {/* Buy List — Simple mode: mobile-friendly cards. Smart mode: full table. */}
        {mode === 'simple' ? (
          <div className="flex-1 min-h-[250px] overflow-y-auto space-y-2">
            {itemsList.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-xs border border-border/60 rounded-xl">
                Generating restock recommendations...
              </div>
            )}
            {itemsList.length > 0 && filteredItemsList.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-xs border border-border/60 rounded-xl">
                No products match "{searchQuery}".
              </div>
            )}
            {filteredItemsList.map(it => (
              <div
                key={it.id}
                className={`border rounded-xl p-3 flex items-center gap-3 transition-colors ${
                  it.selected ? 'bg-primary/5 border-primary/25' : 'bg-surface-2/30 border-border/40 opacity-60'
                }`}
              >
                <button onClick={() => toggleSelectItem(it.id)} className="shrink-0 text-primary">
                  {it.selected ? (
                    <CheckSquare className="w-5 h-5 text-primary fill-primary/10" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground/60" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {it.isNewProduct && (
                      <span className="px-1.5 py-0.5 rounded bg-success/20 text-success text-[9px] font-bold uppercase tracking-wider">🆕 New</span>
                    )}
                    <span className="font-display font-bold text-sm text-foreground truncate">{it.name}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    In stock: {it.currentStock} · ₦{it.costPrice.toLocaleString()} each
                  </div>
                  {/* Why this quantity. Simple mode showed a number with no
                      reasoning behind it — the explanation existed but was
                      rendered only in the Smart Budget table, which is not the
                      default view. */}
                  {it.reason && (
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">{it.reason}</div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleUpdateQty(it.id, it.suggestedQty - 1)}
                    className="w-7 h-7 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-muted-foreground hover:bg-surface-2"
                  >
                    –
                  </button>
                  <input
                    type="number"
                    value={it.suggestedQty}
                    onChange={e => handleUpdateQty(it.id, parseFloat(e.target.value) || 1)}
                    className="w-12 h-7 rounded-lg bg-surface-2 border border-border text-center font-mono text-xs focus:outline-none"
                  />
                  <button
                    onClick={() => handleUpdateQty(it.id, it.suggestedQty + 1)}
                    className="w-7 h-7 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-muted-foreground hover:bg-surface-2"
                  >
                    +
                  </button>
                </div>

                <div className="text-right shrink-0 w-20">
                  <span className="font-display font-bold text-sm text-foreground">₦{(it.suggestedQty * it.costPrice).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
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
              {filteredItemsList.map(it => (
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
                  <td className="p-3 text-center min-w-[70px]">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] block mb-1 whitespace-nowrap ${
                      it.priorityLabel === '🔴 High' ? 'bg-destructive/15 text-destructive' : it.priorityLabel === '🟡 Medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-success/15 text-success'
                    }`}>
                      {it.priorityLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono font-bold">{it.priorityScore} pts</span>
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
              {itemsList.length > 0 && filteredItemsList.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground text-xs">
                    No products match "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            {mode === 'smart' && availableBudget <= 0 ? (
              <span className="text-warning font-semibold">⚠️ Balance is at ₦0 — quantities above are your real restocking need, not budget-fitted.</span>
            ) : mode === 'smart' ? (
              <span>Remaining budget after this purchase: <strong>₦{totals.remaining.toLocaleString()}</strong></span>
            ) : (
              <span>{totals.count} item{totals.count === 1 ? '' : 's'} · {totals.qty} unit{totals.qty === 1 ? '' : 's'} total</span>
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
              onClick={handleShareBuyList}
              disabled={totals.count === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-primary text-primary-foreground disabled:opacity-40 font-display font-bold text-xs rounded-xl shadow-md cursor-pointer hover:opacity-95"
            >
              📤 Approve & Share List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
