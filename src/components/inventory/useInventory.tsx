import { useState, useMemo, useEffect, useRef } from 'react';
import { Product, SimilarProductReview } from '@/types/store';
import {
  addProduct,
  updateProduct,
  deleteProduct,
  importProducts,
  receiveStock,
  RestockFunding,
  saveStore,
  importPurchaseOrderByCode,
  sumOperatingExpenses,
} from '@/lib/store-data';
import { getLowStockThreshold } from '@/lib/settings';
import { showToast } from '@/components/Toast';
import { playProductAddedSound } from '@/lib/sound-effects';
import { interpretProductName } from '@/lib/import-intel';
import { getSimilarity, extractCoreProduct } from '@/lib/similarity';
import { InventoryProps, ShoppingListItem, MassEditItem } from './model';

/**
 * Everything the Inventory screen knows and does: the product list as
 * filtered, the open sheets and their drafts, scanning, counting, buy lists
 * and the handlers that save to the store.
 *
 * Inventory lays the screen out; the parts beside it in this folder draw
 * the pieces, each reading what it needs from the object this returns.
 */
export function useInventory(props: InventoryProps) {
  const { store, onUpdate, filterLowStock, onClearFilter, currentUser, autoOpenRestock, onAutoOpenRestockHandled, focusProduct, onFocusProductHandled } = props;
  // Show Product Profit, from Settings. Defaults on: a shop that has never
  // opened the switch is the one that wants to see what it makes.
  const showProfit = store.managerSettings?.showProductProfit !== false;
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  /** A set of products Flow sent the merchant here to look at, and why. */
  const [focusGroup, setFocusGroup] = useState<{ ids: string[]; label: string } | null>(null);
  const [search, setSearch] = useState('');
  const [performancePeriod, setPerformancePeriod] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [detailTab, setDetailTab] = useState<'overview' | 'performance' | 'history'>('overview');
  const [pendingBackorderClear, setPendingBackorderClear] = useState<Product | null>(null);
  const [pendingMassEditDelete, setPendingMassEditDelete] = useState<MassEditItem | null>(null);
  // ---------- Product Performance Calculations ----------
  //
  // The same ten-line if/else chain deciding where the period starts was
  // written out four separate times, once per statistic. Four copies of a date
  // boundary is four chances for them to disagree about what "this week" means.
  const periodStart = useMemo(() => {
    const now = new Date();
    if (performancePeriod === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    if (performancePeriod === 'week') {
      // Back to Sunday, by calendar date rather than by subtracting fixed
      // 24-hour blocks, so the boundary lands on local midnight.
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      return start.getTime();
    }
    if (performancePeriod === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }
    return 0;
  }, [performancePeriod]);
  const filteredSales = useMemo(() => {
    if (!selectedDetailProduct) return [];
    return store.sales.filter(s =>
      s.productId === selectedDetailProduct.id && new Date(s.date).getTime() >= periodStart
    );
  }, [store.sales, selectedDetailProduct, periodStart]);
  const storeTotalProfit = useMemo(
    () => (store.sales || [])
      .filter(s => new Date(s.date).getTime() >= periodStart)
      .reduce((sum, s) => sum + s.profit, 0),
    [store.sales, periodStart],
  );
  const unitsSold = useMemo(() => filteredSales.reduce((sum, s) => sum + s.quantity, 0), [filteredSales]);
  const totalRevenue = useMemo(() => filteredSales.reduce((sum, s) => sum + s.total, 0), [filteredSales]);
  const totalProfit = useMemo(() => filteredSales.reduce((sum, s) => sum + s.profit, 0), [filteredSales]);
  const contributionPct = useMemo(() => {
    if (storeTotalProfit <= 0) return 0;
    return Math.round((totalProfit / storeTotalProfit) * 1000) / 10;
  }, [totalProfit, storeTotalProfit]);
  const flowInsights = useMemo(() => {
    if (!selectedDetailProduct) return { list: [], badge: 'Standard' };
    const list: string[] = [];

    const salesAll = store.sales.filter(s => s.productId === selectedDetailProduct.id);
    const profitAll = salesAll.reduce((sum, s) => sum + s.profit, 0);
    const storeProfitAll = store.sales.reduce((sum, s) => sum + s.profit, 0);
    const contribAll = storeProfitAll > 0 ? (profitAll / storeProfitAll) * 100 : 0;

    let isTopPerformer = false;
    if (contribAll >= 10) {
      list.push(`🔥 This product generated ${contribAll.toFixed(0)}% of your total store profit.`);
      isTopPerformer = true;
    }

    const now = new Date();
    const last30Start = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const prev30Start = now.getTime() - 60 * 24 * 60 * 60 * 1000;

    const last30Sales = salesAll.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= last30Start;
    }).reduce((sum, s) => sum + s.quantity, 0);

    const prev30Sales = salesAll.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= prev30Start && t < last30Start;
    }).reduce((sum, s) => sum + s.quantity, 0);

    if (last30Sales > prev30Sales && prev30Sales > 0) {
      const inc = ((last30Sales - prev30Sales) / prev30Sales) * 100;
      list.push(`📈 Sales increased ${inc.toFixed(0)}% compared to last month.`);
    } else if (last30Sales < prev30Sales && prev30Sales > 0) {
      const dec = ((prev30Sales - last30Sales) / prev30Sales) * 100;
      list.push(`🐢 Sales have slowed ${dec.toFixed(0)}% compared to last month.`);
    } else if (salesAll.length > 0 && last30Sales === 0) {
      list.push(`🐢 Sales have slowed compared to previous weeks.`);
    }

    const daysSinceFirst = selectedDetailProduct.first_sale_at
      ? (now.getTime() - new Date(selectedDetailProduct.first_sale_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const speed = daysSinceFirst > 0 ? (salesAll.reduce((sum, s) => sum + s.quantity, 0) / daysSinceFirst) : 0;

    let isLowStockWarning = false;
    if (selectedDetailProduct.quantity <= 0) {
      list.push(`⚠️ Out of stock! Customers cannot purchase this item.`);
      isLowStockWarning = true;
    } else if (speed > 0) {
      const daysToRunOut = selectedDetailProduct.quantity / speed;
      if (daysToRunOut <= 14) {
        list.push(`⚠️ Stock will likely run out in ${Math.ceil(daysToRunOut)} days based on current sales.`);
        isLowStockWarning = true;
      }
    }

    const allSpeeds = store.products.map(p => {
      const pSales = store.sales.filter(s => s.productId === p.id);
      const firstSale = p.first_sale_at;
      const days = firstSale ? (now.getTime() - new Date(firstSale).getTime()) / (1000 * 60 * 60 * 24) : 0;
      return days > 0 ? (pSales.reduce((sum, s) => sum + s.quantity, 0) / days) : 0;
    }).sort((a, b) => b - a);

    const pSpeedIdx = allSpeeds.indexOf(speed);
    const speedRankPct = allSpeeds.length > 0 ? (pSpeedIdx / allSpeeds.length) * 100 : 100;

    let isFastMoving = false;
    if (speed > 0.5 && speedRankPct <= 15) {
      list.push(`💡 This is one of your fastest-moving products. Consider restocking soon.`);
      isFastMoving = true;
    }

    if (list.length === 0) {
      list.push(`📊 This product has stable inventory and is performing normally.`);
    }

    let badge = 'Standard';
    if (isLowStockWarning) badge = 'Stock Warning';
    else if (isTopPerformer) badge = 'Top Performer';
    else if (isFastMoving) badge = 'Fast Moving';
    else if (salesAll.length === 0) badge = 'New Item';
    else badge = 'Healthy Product';

    return { list, badge };
  }, [selectedDetailProduct, store.sales, store.products]);
  const formatRelativeDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) return 'Just now';

    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) {
      if (date.getDate() === now.getDate()) {
        return `Today ${timeString}`;
      } else {
        return `Yesterday`;
      }
    }
    if (diffDays === 1) {
      return `Yesterday`;
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };
  // ------------------------------------------------------

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showSelectedDeleteModal, setShowSelectedDeleteModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    costPrice: string;
    sellingPrice: string;
    quantity: string;
    category: string;
    image?: string;
    description?: string;
    barcode?: string;
    isCartonSingleEnabled: boolean;
    singlesPerCarton: string;
    singleSellingPrice: string;
    sellAsSinglesByDefault: boolean;
  } | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<{ name: string; costPrice: string; sellingPrice: string; quantity: string; category: string; singlesPerCarton?: string }[] | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    costPrice: '',
    sellingPrice: '',
    quantity: '',
    category: '',
    unit: 'pcs' as 'pcs' | 'kg' | 'liter' | 'load',
    // The form has always had a barcode field; the state never declared it,
    // so the value went in and the save never looked for it. See
    // handleActualAdd.
    barcode: '',
    isCartonSingleEnabled: false,
    singlesPerCarton: '12',
    singleSellingPrice: '',
    sellAsSinglesByDefault: false
  });
  const [customCategoryActive, setCustomCategoryActive] = useState(false);
  const [customCategoryVal, setCustomCategoryVal] = useState('');
  const [editCustomCategoryActive, setEditCustomCategoryActive] = useState(false);
  const [editCustomCategoryVal, setEditCustomCategoryVal] = useState('');
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'image' | 'code'>('text');
  const [purchaseCodeInput, setPurchaseCodeInput] = useState('');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);
  // Similar product deduplication states & logic (V3)
  const [highConfidencePair, setHighConfidencePair] = useState<{ p1: Product; p2: Product; score: number } | null>(null);
  const [mediumConfidencePairs, setMediumConfidencePairs] = useState<{ p1: Product; p2: Product; score: number }[]>([]);
  const [showMediumReviews, setShowMediumReviews] = useState(false);
  const [localReviewedPairs, setLocalReviewedPairs] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<Product | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const calculateSimilarityScore = (p1: Product, p2: Product): number => {
    // 1. Barcode support
    if (p1.barcode && p2.barcode) {
      return p1.barcode === p2.barcode ? 100 : 0;
    }

    const { core: c1, attributes: a1 } = extractCoreProduct(p1.name);
    const { core: c2, attributes: a2 } = extractCoreProduct(p2.name);

    const c1Lower = c1.toLowerCase();
    const c2Lower = c2.toLowerCase();

    // STEP 2: Compare Core Product
    const nameSim = getSimilarity(c1Lower, c2Lower);
    // The substring shortcut ("Milk" inside "Milk Powder Deluxe") is only safe
    // when the shorter name is a substantial chunk of the longer one — otherwise
    // short generic words (Milk, Pen, Bag) end up "matching" almost anything
    // that happens to contain them.
    const shorter = c1Lower.length <= c2Lower.length ? c1Lower : c2Lower;
    const longer = c1Lower.length <= c2Lower.length ? c2Lower : c1Lower;
    const substringMatch = shorter.length >= 4 && shorter.length / longer.length >= 0.5 && longer.includes(shorter);
    const isFamilyMatch = nameSim >= 0.75 || substringMatch;

    if (!isFamilyMatch) {
      return 0; // STOP immediately - Different Core Products
    }

    // STEP 3: Compare Attributes
    // Start with a high base confidence since we confirmed they have the same core product
    let confidence = 75; // baseline confidence for same core product family

    // 1. Name match weight
    confidence += Math.round(nameSim * 15); // max +15 pts

    // 2. Same category is a mild positive signal, different categories a mild
    // negative one — real duplicates almost never live in different categories.
    if (p1.category && p2.category) {
      confidence += p1.category === p2.category ? 3 : -20;
    }

    // 2. Compare Sizes
    if (a1.size && a2.size) {
      if (a1.size === a2.size) confidence += 5;
      else confidence -= 15; // penalty for different size attributes
    } else if (a1.size || a2.size) {
      confidence -= 5; // one has size attribute, the other doesn't
    }

    // 3. Compare Containers
    if (a1.container && a2.container) {
      if (a1.container === a2.container) confidence += 5;
      else confidence -= 10; // penalty for different container attributes
    } else if (a1.container || a2.container) {
      confidence -= 5; // one has container attribute, the other doesn't
    }

    // 4. Compare Packages
    if (a1.package && a2.package) {
      if (a1.package === a2.package) confidence += 5;
      else confidence -= 10;
    } else if (a1.package || a2.package) {
      confidence -= 5; // one has package attribute, the other doesn't
    }

    // 5. Same Qty per Purchase Unit (singlesPerCarton)
    if (p1.singlesPerCarton !== undefined && p2.singlesPerCarton !== undefined) {
      if (p1.singlesPerCarton === p2.singlesPerCarton) {
        confidence += 5;
      } else {
        confidence -= 10;
      }
    }

    // 6. Similar Purchase Cost
    if (p1.costPrice > 0 && p2.costPrice > 0) {
      const diff = Math.abs(p1.costPrice - p2.costPrice) / Math.max(p1.costPrice, p2.costPrice);
      if (diff <= 0.15) {
        confidence += 5;
      } else {
        confidence -= 10;
      }
    }

    // 7. Similar Selling Price
    if (p1.sellingPrice > 0 && p2.sellingPrice > 0) {
      const diff = Math.abs(p1.sellingPrice - p2.sellingPrice) / Math.max(p1.sellingPrice, p2.sellingPrice);
      if (diff <= 0.15) {
        confidence += 5;
      } else {
        confidence -= 10;
      }
    }

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, confidence));
  };
  useEffect(() => {
    if (store.products.length < 2) {
      setMediumConfidencePairs([]);
      return;
    }

    const reviewedKeys = [
      ...(store.dismissedSimilarPairs || []),
      ...localReviewedPairs
    ];

    const foundMedium: { p1: Product; p2: Product; score: number }[] = [];
    let activeHigh: { p1: Product; p2: Product; score: number } | null = null;

    for (let i = 0; i < store.products.length; i++) {
      const p1 = store.products[i];
      if (p1.discontinued) continue;

      for (let j = i + 1; j < store.products.length; j++) {
        const p2 = store.products[j];
        if (p2.discontinued) continue;

        const key1 = `${p1.id}-${p2.id}`;
        const key2 = `${p2.id}-${p1.id}`;
        const sortedNames = [p1.name, p2.name].map(n => n.toLowerCase().trim()).sort();
        const nameKey = `name:${sortedNames[0]}~${sortedNames[1]}`;

        if (
          reviewedKeys.includes(key1) ||
          reviewedKeys.includes(key2) ||
          reviewedKeys.includes(nameKey)
        ) continue;

        const score = calculateSimilarityScore(p1, p2);

        if (score >= 95) {
          if (!activeHigh) {
            activeHigh = { p1, p2, score };
          }
        } else if (score >= 80) {
          foundMedium.push({ p1, p2, score });
        }
      }
    }

    setHighConfidencePair(activeHigh);
    setMediumConfidencePairs(foundMedium);
  }, [store.products, store.dismissedSimilarPairs, localReviewedPairs]);
  const handleResolveSimilarPair = (
    p1: Product,
    p2: Product,
    action: 'merge' | 'separate' | 'rename',
    customName?: string
  ) => {
    const key = `${p1.id}-${p2.id}`;
    let updatedStore = { ...store };

    if (action === 'merge') {
      const mergedQty = p1.quantity + p2.quantity;
      const mergedPriceHistory = [
        ...(p1.priceHistory || []),
        ...(p2.priceHistory || [])
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      updatedStore = {
        ...updatedStore,
        products: updatedStore.products.map(p => {
          if (p.id === p1.id) {
            return {
              ...p,
              quantity: mergedQty,
              priceHistory: mergedPriceHistory,
              costPrice: Math.max(p1.costPrice, p2.costPrice),
              sellingPrice: Math.max(p1.sellingPrice, p2.sellingPrice)
            };
          }
          return p;
        }).filter(p => p.id !== p2.id)
      };

      // Record memory review
      const reviews = updatedStore.similarProductReviews || [];
      const newReview: SimilarProductReview = {
        id1: p1.id,
        id2: p2.id,
        name1: p1.name,
        name2: p2.name,
        decision: 'merged',
        reviewedAt: new Date().toISOString()
      };
      updatedStore.similarProductReviews = [...reviews, newReview];

      setLocalReviewedPairs(prev => [...prev, key]);
      showToast(`Merged ${p2.name} into ${p1.name}. Total stock: ${mergedQty}`, 'success');

    } else if (action === 'separate') {
      // Record memory review
      const reviews = updatedStore.similarProductReviews || [];
      const newReview: SimilarProductReview = {
        id1: p1.id,
        id2: p2.id,
        name1: p1.name,
        name2: p2.name,
        decision: 'separate',
        reviewedAt: new Date().toISOString()
      };
      updatedStore.similarProductReviews = [...reviews, newReview];

      const sortedNames = [p1.name, p2.name].map(n => n.toLowerCase().trim()).sort();
      const nameKey = `name:${sortedNames[0]}~${sortedNames[1]}`;

      setLocalReviewedPairs(prev => [...prev, key, nameKey]);

      const dismissed = updatedStore.dismissedSimilarPairs || [];
      updatedStore = {
        ...updatedStore,
        dismissedSimilarPairs: [...dismissed, key, nameKey]
      };
      showToast('Dismissed similar product suggestion');

    } else if (action === 'rename' && customName) {
      updatedStore = {
        ...updatedStore,
        products: updatedStore.products.map(p => {
          if (p.id === p2.id) {
            return { ...p, name: customName };
          }
          return p;
        })
      };

      // Record memory review
      const reviews = updatedStore.similarProductReviews || [];
      const newReview: SimilarProductReview = {
        id1: p1.id,
        id2: p2.id,
        name1: p1.name,
        name2: customName,
        decision: 'renamed',
        reviewedAt: new Date().toISOString()
      };
      updatedStore.similarProductReviews = [...reviews, newReview];

      showToast(`Renamed product to: ${customName}`, 'success');
      setRenameTarget(null);
    }

    saveStore(updatedStore);
    onUpdate(updatedStore);
  };
  const existingCategories = useMemo(() => {
    const cats = new Set(['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others']);
    store.products.forEach(p => {
      if (p.category && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [store.products]);
  const autoCategory = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('soap') || n.includes('detto') || n.includes('lux') || n.includes('premier') || n.includes('handwash')) return 'Soap';
    if (n.includes('detergent') || n.includes('omo') || n.includes('ariel') || n.includes('soclin') || n.includes('wash') || n.includes('bleach') || n.includes('hypo')) return 'Detergents';
    if (n.includes('milk') || n.includes('drink') || n.includes('water') || n.includes('beverage') || n.includes('soda') || n.includes('milo') || n.includes('coke') || n.includes('mineral') || n.includes('juice') || n.includes('fanta') || n.includes('sprite') || n.includes('pepsi') || n.includes('tea') || n.includes('coffee')) return 'Beverages';
    if (n.includes('rice') || n.includes('beans') || n.includes('garri') || n.includes('yam') || n.includes('food') || n.includes('grocery') || n.includes('spaghetti') || n.includes('indomie') || n.includes('bread') || n.includes('semovita') || n.includes('oil') || n.includes('sugar') || n.includes('salt') || n.includes('flour') || n.includes('semolina')) return 'Groceries';
    return 'Others';
  };
  const autoDetectCartonSingle = (name: string, sellingPrice: number) => {
    const n = name.toLowerCase();
    const cartonWords = ['carton', 'ctn', 'pack', 'box', 'case', 'crate', 'bundle', 'dozen', 'roll', 'rolls'];
    const matchesCarton = cartonWords.some(w => n.includes(w));

    if (matchesCarton) {
      const rx = /(?:x|qty|size|of|pack|ctn|carton|roll|\b)\s*(\d+)\b/i;
      const matches = n.match(rx);
      let singles = n.includes('roll') ? 10 : 12; // default 10 for roll, 12 for carton
      if (matches && matches[1]) {
        const val = parseInt(matches[1]);
        if (val > 1 && val <= 200) {
          singles = val;
        }
      }
      const singlePrice = singles > 0 ? Math.round(sellingPrice / singles) : 0;
      return {
        isCartonSingleEnabled: true,
        singlesPerCarton: singles,
        singleSellingPrice: singlePrice,
        sellAsSinglesByDefault: true
      };
    }
    return {
      isCartonSingleEnabled: false,
      singlesPerCarton: 12,
      singleSellingPrice: 0,
      sellAsSinglesByDefault: false
    };
  };
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showBuyLists, setShowBuyLists] = useState(false);
  const productPhotoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoOpenRestock) {
      setShowShoppingList(true);
      onAutoOpenRestockHandled?.();
    }
  }, [autoOpenRestock, onAutoOpenRestockHandled]);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveData, setReceiveData] = useState<Record<string, { qty: string; cost: string }>>({});
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [receiveMode]);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [scanForProduct, setScanForProduct] = useState<Product | null>(null);
  const [funding, setFunding] = useState<RestockFunding>('balance');
  const [singleRestockFunding, setSingleRestockFunding] = useState<RestockFunding>('balance');
  const [showMassDeleteModal, setShowMassDeleteModal] = useState(false);
  const [massDeleteStep, setMassDeleteStep] = useState(1);
 // 1 = Quiz, 2 = Confirm
  const [quizAnswers, setQuizAnswers] = useState({ q1: '', q2: '', q3: '' });
  const [quizError, setQuizError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [countMode, setCountMode] = useState(false);
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [showRestockConfirm, setShowRestockConfirm] = useState(false);
  const [showPlannedRestocks, setShowPlannedRestocks] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Product | null>(null);
  const [globalScannerOpen, setGlobalScannerOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [scanForNewProduct, setScanForNewProduct] = useState(false);
  const [scanForEditProduct, setScanForEditProduct] = useState(false);
  const [selectedTransferProduct, setSelectedTransferProduct] = useState<Product | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferDestCode, setTransferDestCode] = useState('');
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const [massEditItems, setMassEditItems] = useState<MassEditItem[] | null>(null);
  const [batchBuy, setBatchBuy] = useState('');
  const [batchSell, setBatchSell] = useState('');
  const [batchContains, setBatchContains] = useState('');
  const lowThreshold = getLowStockThreshold();
  const products = store.products
    .filter(p => (showDiscontinued ? p.discontinued : !p.discontinued))
    .filter(p => !filterLowStock || p.quantity <= lowThreshold)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    // Advice that named several products filters the list to exactly those, so
    // "2 products need restocking" lands on those two rather than on everything.
    .filter(p => !focusGroup || focusGroup.ids.includes(p.id));
  // Opening a product's editor, in one place. The row's pencil button and the
  // "Open" on a piece of advice must land on the same form in the same state;
  // duplicating these four assignments is how they drift apart.
  const KNOWN_CATEGORIES = ['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'];
  const openEditFor = (p: Product) => {
    setEditProduct({ ...p });
    // The whole draft, including the carton/singles fields. The inline version
    // this replaces supplied only the first five, so those four were left at
    // whatever the previous edit had put there.
    setEditDraft({
      name: p.name,
      costPrice: String(p.costPrice),
      sellingPrice: String(p.sellingPrice),
      quantity: String(p.quantity),
      category: p.category,
      image: p.image,
      description: p.description,
      barcode: p.barcode,
      isCartonSingleEnabled: p.isCartonSingleEnabled === true,
      singlesPerCarton: p.singlesPerCarton != null ? String(p.singlesPerCarton) : '',
      singleSellingPrice: p.singleSellingPrice != null ? String(p.singleSellingPrice) : '',
      sellAsSinglesByDefault: p.sellAsSinglesByDefault === true,
    });
    setEditCustomCategoryActive(!KNOWN_CATEGORIES.includes(p.category));
    setEditCustomCategoryVal(p.category);
  };
  // Advice that named one product opens that product.
  //
  // "Raise price on Mineral" used to send the merchant to the Inventory tab
  // and leave them there: scroll or search for Mineral, find the edit control,
  // then find the price field — all of it already known when the advice was
  // written. Filters are cleared first, because a product is easy to send
  // someone to and then hide behind a search term or a low-stock filter they
  // had left switched on.
  useEffect(() => {
    if (!focusProduct) return;
    const target = store.products.find(p => p.id === focusProduct.productId);
    if (!target) {
      showToast(`${focusProduct.productName || 'That product'} is no longer in your inventory`, 'error');
      onFocusProductHandled?.();
      return;
    }

    setSearch('');
    setShowDiscontinued(!!target.discontinued);
    if (filterLowStock) onClearFilter?.();

    // Several products: show just those, named, rather than opening one of
    // them and leaving the rest for the merchant to hunt down.
    if (focusProduct.productIds && focusProduct.productIds.length > 1) {
      setFocusGroup({
        ids: focusProduct.productIds,
        label: focusProduct.groupLabel || `${focusProduct.productIds.length} products from Flow`,
      });
      onFocusProductHandled?.();
      return;
    }

    setFocusGroup(null);
    if (focusProduct.intent === 'edit') {
      openEditFor(target);
    } else {
      setSelectedDetailProduct(target);
    }

    onFocusProductHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProduct, store.products]);
  const smartSuggestions = useMemo(() => {
    const threshold = store.managerSettings?.minStockThreshold ?? lowThreshold;

    // Calculate velocity
    const salesCount: Record<string, number> = {};
    store.sales.forEach(sale => {
      salesCount[sale.productId] = (salesCount[sale.productId] || 0) + sale.quantity;
    });

    // Filter needy products (not discontinued, stock <= threshold, and not in shoppingList)
    const needy = store.products
      .filter(p => !p.discontinued && p.quantity <= threshold && !shoppingList.some(item => item.productId === p.id));

    if (needy.length === 0) return [];

    // Calculate Net Income budget to allocate
    const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = sumOperatingExpenses(store);
    const savingsSaved = store.savingsGoal?.saved || 0;
    const netIncome = totalRevenue - totalExpenses - savingsSaved;
    const availableBudget = Math.max(25000, netIncome); // Baseline minimum budget of 25k to suggest items

    // Calculate priority scores
    const needyWithScores = needy.map(p => {
      const velocity = salesCount[p.id] || 0;
      const scarcity = Math.max(0, threshold - p.quantity);
      // Score combined based on performance (sales) and stock scarcity
      const score = velocity * 1.5 + scarcity + 1;
      return { product: p, velocity, score };
    });

    // Sort needy items by priority score descending
    needyWithScores.sort((a, b) => b.score - a.score);

    // Pick top 8 needy items to distribute the budget
    const topNeedy = needyWithScores.slice(0, 8);
    const totalScore = topNeedy.reduce((sum, x) => sum + x.score, 0);

    const suggestions: { product: Product; velocity: number; suggestedQty: number; totalCost: number }[] = [];

    if (totalScore > 0) {
      topNeedy.forEach(item => {
        const share = item.score / totalScore;
        const allocatedBudget = availableBudget * share;

        let suggestedQty = Math.floor(allocatedBudget / (item.product.costPrice || 1));
        const defaultQty = store.managerSettings?.defaultRestockQty ?? 50;

        // Clamp quantity between 1 and defaultQty
        suggestedQty = Math.min(defaultQty, Math.max(1, suggestedQty));
        const totalCost = suggestedQty * item.product.costPrice;

        suggestions.push({
          product: item.product,
          velocity: item.velocity,
          suggestedQty,
          totalCost
        });
      });
    }

    return suggestions;
  }, [store.products, store.sales, store.expenses, store.savingsGoal, store.managerSettings, lowThreshold, shoppingList]);
  const handleAdd = () => {
    if (!newProduct.name || !newProduct.costPrice || !newProduct.sellingPrice || !newProduct.quantity) {
      return showToast('Fill all required fields', 'error');
    }
    let singlesPerCartonVal: number | undefined;
    let singlePriceVal: number | undefined;
    if (newProduct.isCartonSingleEnabled) {
      singlesPerCartonVal = Number(newProduct.singlesPerCarton);
      if (isNaN(singlesPerCartonVal) || singlesPerCartonVal <= 0) {
        return showToast('Please enter a valid quantity of singles per carton', 'error');
      }
      singlePriceVal = newProduct.singleSellingPrice ? Number(newProduct.singleSellingPrice) : undefined;
      if (singlePriceVal !== undefined && (isNaN(singlePriceVal) || singlePriceVal <= 0)) {
        return showToast('Please enter a valid single selling price', 'error');
      }
    }
    setShowAddConfirm(true);
  };
  const handleActualAdd = () => {
    const singlesPerCartonVal = newProduct.isCartonSingleEnabled ? Number(newProduct.singlesPerCarton) : undefined;
    const singlePriceVal = (newProduct.isCartonSingleEnabled && newProduct.singleSellingPrice) ? Number(newProduct.singleSellingPrice) : undefined;

    const updated = addProduct(store, {
      name: newProduct.name,
      costPrice: Number(newProduct.costPrice),
      sellingPrice: Number(newProduct.sellingPrice),
      quantity: Number(newProduct.quantity),
      category: newProduct.category || 'General',
      unit: newProduct.unit,
      isCartonSingleEnabled: newProduct.isCartonSingleEnabled,
      singlesPerCarton: singlesPerCartonVal,
      singleSellingPrice: singlePriceVal,
      sellAsSinglesByDefault: newProduct.sellAsSinglesByDefault,
      /*
       * The barcode was typed and then dropped here.
       *
       * That hurt most in the flow built for it: scanning a code that is not
       * recognised offers to add it as a new product and pre-fills the code,
       * and the save discarded it - so scanning the same tin again still
       * found nothing, and the shop learned not to bother.
       */
      barcode: newProduct.barcode.trim() || undefined,
    }, currentUser?.name, currentUser?.role);
    onUpdate(updated);
    setNewProduct({
      name: '',
      costPrice: '',
      sellingPrice: '',
      quantity: '',
      category: '',
      unit: 'pcs',
      barcode: '',
      isCartonSingleEnabled: false,
      singlesPerCarton: '12',
      singleSellingPrice: '',
      sellAsSinglesByDefault: false
    });
    setShowAddConfirm(false);
    setShowAddModal(false);
    playProductAddedSound();
    showToast('Product added');
  };
  const openImportModal = () => {
    setImportText('');
    setImportPreview(null);
    setImportMode('text');
    setOcrError(null);
    setIsOcrLoading(false);
    setShowImportModal(true);
  };
  const parseReceiptText = (rawText: string) => {
    const lines = rawText.split('\n');
    const itemsList: { name: string; costPrice: string; sellingPrice: string; quantity: string; category: string }[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      const lower = line.toLowerCase();
      if (lower.includes('total') || lower.includes('subtotal') || lower.includes('payment') || lower.includes('receipt') || lower.includes('date') || lower.includes('tel') || lower.includes('welcome') || lower.includes('customer') || lower.includes('cashier')) {
        continue;
      }

      const numberMatches = line.match(/\d+([.,]\d+)?/g);
      if (!numberMatches || numberMatches.length === 0) continue;

      const wordsOnly = line.replace(/[\d.,x₦\-=*#]/g, ' ').trim().replace(/\s+/g, ' ');
      if (wordsOnly.length < 3) continue;

      let qty = 1;
      let price = 0;

      const parsedNumbers = numberMatches.map(n => Number(n.replace(',', '')));

      if (parsedNumbers.length === 1) {
        price = parsedNumbers[0];
      } else if (parsedNumbers.length >= 2) {
        const sorted = [...parsedNumbers].sort((a,b) => a - b);
        if (sorted[0] < 50) {
          qty = sorted[0];
          price = sorted[1];
        } else {
          price = sorted[1];
        }
      }

      if (price > 0) {
        const costPrice = Math.round(price * 0.75);
        itemsList.push({
          name: wordsOnly,
          costPrice: String(costPrice),
          sellingPrice: String(price),
          quantity: String(qty),
          category: autoCategory(wordsOnly)
        });
      }
    }

    return itemsList;
  };
  const handleOcrScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setOcrError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        try {
          const text = await runOfflineOCR(dataUrl);
          const parsed = parseReceiptText(text);
          if (parsed.length === 0) {
            setOcrError("No products could be parsed. Check receipt layout or try Text Import.");
            showToast("No products found", "error");
          } else {
            setImportPreview(parsed);
            showToast(`✓ Extracted ${parsed.length} items from receipt`);
          }
        } catch (err: any) {
          console.error("OCR parse failed:", err);
          setOcrError(`Offline OCR failed: ${err.message || 'Error processing image'}. Please try Text Import.`);
          showToast("OCR Scan failed", "error");
        } finally {
          setIsOcrLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setOcrError("Failed to read image file.");
      setIsOcrLoading(false);
    }
  };
  const runOfflineOCR = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const win = window as any;
      if (win.Tesseract) {
        doTesseractRecognize(dataUrl, resolve, reject);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/tesseract.js@4.0.2/dist/tesseract.min.js';
      script.onload = () => {
        if (win.Tesseract) {
          doTesseractRecognize(dataUrl, resolve, reject);
        } else {
          reject(new Error("OCR engine failed to initialize"));
        }
      };
      script.onerror = () => {
        reject(new Error("Failed to download OCR engine (offline)"));
      };
      document.body.appendChild(script);
    });
  };
  const doTesseractRecognize = (dataUrl: string, resolve: any, reject: any) => {
    const win = window as any;
    win.Tesseract.recognize(
      dataUrl,
      'eng',
      { logger: (m: any) => console.log("OCR Progress:", m) }
    ).then(({ data: { text } }: any) => {
      resolve(text);
    }).catch((err: any) => {
      reject(err);
    });
  };
  const handleEdit = () => {
    if (!editProduct || !editDraft) return;
    let singlesPerCartonVal: number | undefined;
    let singlePriceVal: number | undefined;
    if (editDraft.isCartonSingleEnabled) {
      singlesPerCartonVal = Number(editDraft.singlesPerCarton);
      if (isNaN(singlesPerCartonVal) || singlesPerCartonVal <= 0) {
        return showToast('Please enter a valid quantity of singles per carton', 'error');
      }
      singlePriceVal = editDraft.singleSellingPrice ? Number(editDraft.singleSellingPrice) : undefined;
      if (singlePriceVal !== undefined && (isNaN(singlePriceVal) || singlePriceVal <= 0)) {
        return showToast('Please enter a valid single selling price', 'error');
      }
    }
    const updates: Partial<Product> = {
      name: editDraft.name,
      costPrice: Number(editDraft.costPrice) || 0,
      sellingPrice: Number(editDraft.sellingPrice) || 0,
      quantity: Number(editDraft.quantity) || 0,
      category: editDraft.category,
      image: editDraft.image,
      description: editDraft.description,
      barcode: editDraft.barcode?.trim() || undefined,
      isCartonSingleEnabled: editDraft.isCartonSingleEnabled,
      singlesPerCarton: singlesPerCartonVal,
      singleSellingPrice: singlePriceVal,
      sellAsSinglesByDefault: editDraft.sellAsSinglesByDefault,
    };
    const updated = updateProduct(store, editProduct.id, updates, currentUser?.name, currentUser?.role);
    onUpdate(updated);
    setEditProduct(null); setEditDraft(null);
    showToast('Product updated — inventory value recalculated');
  };
  const handleDelete = (p: Product) => {
    setConfirmDelete(p);
  };
  const doDelete = () => {
    if (!confirmDelete) return;
    onUpdate(deleteProduct(store, confirmDelete.id, currentUser?.name, currentUser?.role));
    setConfirmDelete(null);
    showToast('Product archived — sales history kept');
  };
  const handleDeleteSelected = () => {
    const updatedProducts = store.products.map(p => selectedProductIds.includes(p.id) ? { ...p, discontinued: true } : p);
    const updatedStore = {
      ...store,
      products: updatedProducts
    };
    onUpdate(updatedStore);
    saveStore(updatedStore);
    setSelectedProductIds([]);
    setShowSelectedDeleteModal(false);
    showToast(`Archived ${selectedProductIds.length} selected product(s)`);
  };
  const handleRestock = () => {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (qty <= 0) return showToast('Enter a quantity', 'error');
    setShowRestockConfirm(true);
  };
  const handleActualRestock = () => {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (qty <= 0) return showToast('Enter a quantity', 'error');
    const updated = receiveStock(
      store,
      [{ productId: restockProduct.id, quantity: qty, costPrice: restockProduct.costPrice }],
      singleRestockFunding,
      'Restock Button',
      currentUser?.name,
      currentUser?.role
    );
    onUpdate(updated);
    setRestockProduct(null);
    setRestockQty('');
    setSingleRestockFunding('balance');
    setShowRestockConfirm(false);
    showToast(singleRestockFunding === 'new_money' ? 'Stock added (new money)' : 'Stock added (from balance)');
  };
  const handleSavePlannedRestock = () => {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (qty <= 0) return showToast('Enter a quantity', 'error');

    const plannedItem = {
      id: Math.random().toString(36).substring(2, 9),
      productId: restockProduct.id,
      productName: restockProduct.name,
      quantity: qty,
      costPrice: restockProduct.costPrice,
      funding: singleRestockFunding,
      date: new Date().toISOString()
    };

    const updated = {
      ...store,
      plannedRestocks: [plannedItem, ...(store.plannedRestocks || [])]
    };

    onUpdate(updated);
    setRestockProduct(null);
    setRestockQty('');
    setSingleRestockFunding('balance');
    setShowRestockConfirm(false);
    showToast('Restock saved as Planned (not added to inventory yet)');
  };
  const handleImportParse = () => {
    try {
      const lines = importText.trim().split('\n').filter(Boolean);
      const parsed: { name: string; costPrice: string; sellingPrice: string; quantity: string; category: string; singlesPerCarton?: string }[] = [];
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 4) continue;

        const interpreted = interpretProductName(parts[0]);
        const qtyVal = Number(parts[3]) || 0;
        const finalQty = String(qtyVal * interpreted.qtyMultiplier);

        parsed.push({
          name: interpreted.officialName,
          costPrice: parts[1] || '0',
          sellingPrice: parts[2] || '0',
          quantity: finalQty,
          category: parts[4] || autoCategory(interpreted.officialName),
        });
      }
      if (parsed.length === 0) return showToast('No valid products found', 'error');
      setImportPreview(parsed);
    } catch {
      showToast('Import failed — check format', 'error');
    }
  };
  const handleImportApprove = () => {
    if (!importPreview) return;
    const cleaned = importPreview
      .filter(p => p.name.trim())
      .map(p => {
        const name = p.name.trim();
        const sellingPrice = Number(p.sellingPrice) || 0;
        const autoCtn = autoDetectCartonSingle(name, sellingPrice);
        const isCtn = p.singlesPerCarton ? true : autoCtn.isCartonSingleEnabled;
        const singlesVal = p.singlesPerCarton ? (Number(p.singlesPerCarton) || 12) : autoCtn.singlesPerCarton;
        return {
          name,
          costPrice: Number(p.costPrice) || 0,
          sellingPrice,
          quantity: Number(p.quantity) || 0,
          category: p.category.trim() || 'General',
          isCartonSingleEnabled: isCtn,
          singlesPerCarton: isCtn ? singlesVal : undefined,
          singleSellingPrice: isCtn ? (singlesVal > 0 ? Math.round(sellingPrice / singlesVal) : 0) : undefined,
          sellAsSinglesByDefault: isCtn ? true : undefined,
        };
      });
    if (cleaned.length === 0) return showToast('No items to import', 'error');
    onUpdate(importProducts(store, cleaned));
    setShowImportModal(false);
    setImportText('');
    setImportPreview(null);
    showToast(`${cleaned.length} products imported`);
  };
  const handlePurchaseCodeImport = () => {
    const result = importPurchaseOrderByCode(store, purchaseCodeInput);
    if (result.success) {
      onUpdate(result.store);
      showToast(result.message, 'success');
      setPurchaseCodeInput('');
      setShowImportModal(false);
    } else {
      showToast(result.message, 'error');
    }
  };
  const handleSaveMassEdit = () => {
    if (!massEditItems) return;

    const updatedProducts: Product[] = store.products.map(p => {
      const edit = massEditItems.find(item => item.id === p.id);
      if (edit) {
        const isCtn = edit.unitsPerPurchase > 1;
        const cp = isCtn ? (edit.purchasePrice / edit.unitsPerPurchase) : edit.purchasePrice;

        return {
          ...p,
          name: edit.name.trim(),
          costPrice: cp,
          sellingPrice: isCtn ? edit.purchaseSellingPrice : edit.sellingPrice,
          category: edit.category.trim() || 'General',
          isCartonSingleEnabled: isCtn,
          singlesPerCarton: isCtn ? edit.unitsPerPurchase : undefined,
          singleSellingPrice: isCtn ? edit.sellingPrice : undefined,
          sellAsSinglesByDefault: isCtn ? true : undefined
        };
      }
      return p;
    });

    const deletedIds = store.products
      .filter(p => !massEditItems.some(edit => edit.id === p.id))
      .map(p => p.id);

    const finalProducts = updatedProducts.filter(p => !deletedIds.includes(p.id));

    // Save configurations to learned memory
    const nextLearned = [...(store.learnedProducts || [])];
    massEditItems.forEach(edit => {
      const existingIdx = nextLearned.findIndex(
        lp => lp.id === edit.id || lp.name.toLowerCase() === edit.name.toLowerCase()
      );
      const learnedEntry = {
        id: edit.id,
        name: edit.name.trim(),
        purchaseUnit: edit.purchaseUnit,
        sellingUnit: edit.sellingUnit,
        unitsPerPurchase: edit.unitsPerPurchase,
        suggestedSellingPrice: edit.sellingPrice,
        markup: 20,
        lastPurchasePrice: edit.purchasePrice,
        averagePurchasePrice: edit.purchasePrice,
        dateLearned: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        nextLearned[existingIdx] = { ...nextLearned[existingIdx], ...learnedEntry };
      } else {
        nextLearned.push(learnedEntry);
      }
    });

    const updatedStore = {
      ...store,
      products: finalProducts,
      learnedProducts: nextLearned
    };

    onUpdate(updatedStore);
    saveStore(updatedStore);
    setMassEditItems(null);
    showToast('Inventory mass edited successfully!', 'success');
  };
  const addToShoppingList = (p: Product) => {
    const existing = shoppingList.find(i => i.productId === p.id);
    if (existing) {
      setShoppingList(shoppingList.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      showToast(`${p.name} qty +1`);
    } else {
      setShoppingList([...shoppingList, { productId: p.id, name: p.name, quantity: 1, category: p.category }]);
      showToast(`${p.name} added to list`);
    }
  };
  const updateListQty = (productId: string, qty: number) => {
    const clamped = Math.max(0, qty);
    setShoppingList(shoppingList.map(i => i.productId === productId ? { ...i, quantity: clamped } : i));
  };
  const removeFromList = (productId: string) => {
    setShoppingList(shoppingList.filter(i => i.productId !== productId));
  };
  const clearList = () => {
    setShoppingList([]);
    showToast('List cleared');
  };
  const generateBuyList = () => {
    // Opening Buy List is manual/simple mode. Do not auto-copy low-stock items.
    // Smart Restock is the explicit path for automatic recommendations.
    setShowShoppingList(true);
  };
  const generateListText = () => {
    const storeName = store.storeName || 'Store';
    const date = new Date().toLocaleDateString('en-GB');
    let text = `🛒 *SHOPPING LIST*\n${storeName}\n${date}\n\n`;
    shoppingList.forEach((item, idx) => {
      const product = store.products.find(p => p.id === item.productId);
      const currentStock = product ? product.quantity : 0;
      text += `${idx + 1}. ${item.name} — Restock: *${item.quantity}* (Current Stock: ${currentStock}) ${item.category ? `[${item.category}]` : ''}\n`;
    });
    text += `\n_Total items: ${shoppingList.length}_`;
    return text;
  };
  const handleCopyList = async () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    try {
      await navigator.clipboard.writeText(generateListText());
      showToast('List copied to clipboard');
    } catch {
      showToast('Copy failed', 'error');
    }
  };
  const handleShareWhatsApp = () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    const text = encodeURIComponent(generateListText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };
  const handleShareSystem = async () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    const text = generateListText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Shopping List', text });
      } catch {
        // user cancelled
      }
    } else {
      handleCopyList();
    }
  };
  const handleStartReceive = () => {
    const initial: Record<string, { qty: string; cost: string }> = {};
    shoppingList.forEach(item => {
      const product = store.products.find(p => p.id === item.productId);
      initial[item.productId] = {
        qty: String(item.quantity),
        cost: String(product?.costPrice ?? ''),
      };
    });
    setReceiveData(initial);
    setReceiveMode(true);
  };
  const handleConfirmReceive = () => {
    const entries = shoppingList
      .map(item => {
        const data = receiveData[item.productId];
        if (!data) return null;
        const qty = Number(data.qty);
        const cost = Number(data.cost);
        if (!qty || qty <= 0) return null;
        return { productId: item.productId, quantity: qty, costPrice: cost > 0 ? cost : 0 };
      })
      .filter((e): e is { productId: string; quantity: number; costPrice: number } => e !== null);

    if (entries.length === 0) return showToast('Add quantities to confirm', 'error');

    const updated = receiveStock(store, entries, funding, 'Purchase Order Receiving', currentUser?.name, currentUser?.role);
    onUpdate(updated);
    setShoppingList([]);
    setReceiveData({});
    setReceiveMode(false);
    setShowShoppingList(false);
    setFunding('balance');
    showToast(`Restocked ${entries.length} item${entries.length > 1 ? 's' : ''} ${funding === 'new_money' ? '(new money)' : '(from balance)'}`);
  };
  const handlePrintBarcode = (product: Product) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return showToast('Popup blocker is active', 'error');

    const svgElement = document.getElementById(`barcode-svg-${product.id}`);
    if (!svgElement) return showToast('Barcode element not found', 'error');

    const svgHtml = svgElement.outerHTML;
    printWindow.document.write(`
      <html>
        <head>
          <title>Barcode Label - ${product.name}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: monospace;
              padding: 20px;
              margin: 0;
              background-color: white;
            }
            .title {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
              text-align: center;
              color: black;
            }
            .code {
              font-size: 12px;
              margin-top: 5px;
              letter-spacing: 3px;
              font-weight: bold;
              color: black;
            }
            svg {
              max-width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="title">${product.name}</div>
          ${svgHtml}
          <div class="code">${product.barcode}</div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const handleAutoGenerateBarcode = (product: Product) => {
    const code = `SF${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = store.products.find(p => p.barcode === code);
    if (existing) {
      return handleAutoGenerateBarcode(product); // retry
    }
    const updated = updateProduct(store, product.id, { barcode: code });
    onUpdate(updated);
    setSelectedBarcodeProduct(updated.products.find(p => p.id === product.id) || null);
    showToast('✓ Saved auto-generated barcode');
  };
  const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm";

  return {
    store,
    onUpdate,
    filterLowStock,
    onClearFilter,
    currentUser,
    autoOpenRestock,
    onAutoOpenRestockHandled,
    focusProduct,
    onFocusProductHandled,
    showProfit,
    selectedDetailProduct,
    setSelectedDetailProduct,
    focusGroup,
    setFocusGroup,
    search,
    setSearch,
    performancePeriod,
    setPerformancePeriod,
    detailTab,
    setDetailTab,
    pendingBackorderClear,
    setPendingBackorderClear,
    pendingMassEditDelete,
    setPendingMassEditDelete,
    periodStart,
    filteredSales,
    storeTotalProfit,
    unitsSold,
    totalRevenue,
    totalProfit,
    contributionPct,
    flowInsights,
    formatRelativeDate,
    selectedProductIds,
    setSelectedProductIds,
    showSelectedDeleteModal,
    setShowSelectedDeleteModal,
    showAddModal,
    setShowAddModal,
    editProduct,
    setEditProduct,
    editDraft,
    setEditDraft,
    restockProduct,
    setRestockProduct,
    restockQty,
    setRestockQty,
    showImportModal,
    setShowImportModal,
    importText,
    setImportText,
    importPreview,
    setImportPreview,
    newProduct,
    setNewProduct,
    customCategoryActive,
    setCustomCategoryActive,
    customCategoryVal,
    setCustomCategoryVal,
    editCustomCategoryActive,
    setEditCustomCategoryActive,
    editCustomCategoryVal,
    setEditCustomCategoryVal,
    showAddConfirm,
    setShowAddConfirm,
    importMode,
    setImportMode,
    purchaseCodeInput,
    setPurchaseCodeInput,
    isOcrLoading,
    setIsOcrLoading,
    ocrError,
    setOcrError,
    ocrFileRef,
    highConfidencePair,
    setHighConfidencePair,
    mediumConfidencePairs,
    setMediumConfidencePairs,
    showMediumReviews,
    setShowMediumReviews,
    localReviewedPairs,
    setLocalReviewedPairs,
    renameTarget,
    setRenameTarget,
    renameVal,
    setRenameVal,
    isRenaming,
    setIsRenaming,
    calculateSimilarityScore,
    handleResolveSimilarPair,
    existingCategories,
    autoCategory,
    autoDetectCartonSingle,
    shoppingList,
    setShoppingList,
    showShoppingList,
    setShowShoppingList,
    showBuyLists,
    setShowBuyLists,
    productPhotoRef,
    receiveMode,
    setReceiveMode,
    receiveData,
    setReceiveData,
    confirmDelete,
    setConfirmDelete,
    scanForProduct,
    setScanForProduct,
    funding,
    setFunding,
    singleRestockFunding,
    setSingleRestockFunding,
    showMassDeleteModal,
    setShowMassDeleteModal,
    massDeleteStep,
    setMassDeleteStep,
    quizAnswers,
    setQuizAnswers,
    quizError,
    setQuizError,
    confirmText,
    setConfirmText,
    countMode,
    setCountMode,
    auditCounts,
    setAuditCounts,
    showAuditHistory,
    setShowAuditHistory,
    showRestockConfirm,
    setShowRestockConfirm,
    showPlannedRestocks,
    setShowPlannedRestocks,
    selectedBarcodeProduct,
    setSelectedBarcodeProduct,
    globalScannerOpen,
    setGlobalScannerOpen,
    notFoundBarcode,
    setNotFoundBarcode,
    scanForNewProduct,
    setScanForNewProduct,
    scanForEditProduct,
    setScanForEditProduct,
    selectedTransferProduct,
    setSelectedTransferProduct,
    transferQty,
    setTransferQty,
    transferDestCode,
    setTransferDestCode,
    showDiscontinued,
    setShowDiscontinued,
    massEditItems,
    setMassEditItems,
    batchBuy,
    setBatchBuy,
    batchSell,
    setBatchSell,
    batchContains,
    setBatchContains,
    lowThreshold,
    products,
    KNOWN_CATEGORIES,
    openEditFor,
    smartSuggestions,
    handleAdd,
    handleActualAdd,
    openImportModal,
    parseReceiptText,
    handleOcrScan,
    runOfflineOCR,
    doTesseractRecognize,
    handleEdit,
    handleDelete,
    doDelete,
    handleDeleteSelected,
    handleRestock,
    handleActualRestock,
    handleSavePlannedRestock,
    handleImportParse,
    handleImportApprove,
    handlePurchaseCodeImport,
    handleSaveMassEdit,
    addToShoppingList,
    updateListQty,
    removeFromList,
    clearList,
    generateBuyList,
    generateListText,
    handleCopyList,
    handleShareWhatsApp,
    handleShareSystem,
    handleStartReceive,
    handleConfirmReceive,
    handlePrintBarcode,
    handleAutoGenerateBarcode,
    inputClass,
  };
}

export type InventoryState = ReturnType<typeof useInventory>;
