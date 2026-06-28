import { useState, useMemo, useEffect, useRef } from 'react';
import { StoreData, Product, SimilarProductReview } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, importProducts, receiveStock, RestockFunding, clearInventory, recordStockCountAudit, transferStock, getStoreIndex, loadStore } from '@/lib/store-data';
import { getLowStockThreshold } from '@/lib/settings';
import { showToast } from '@/components/Toast';
import { interpretProductName } from '@/lib/import-intel';
import { getSimilarity, extractCoreProduct } from '@/lib/similarity';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import BarcodeScanner from '@/components/BarcodeScanner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SmartRestockEngine from '@/components/SmartRestockEngine';

const CODE39_MAP: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001',
  'E': '100011000', 'F': '001011000', 'G': '000001101', 'H': '100001100',
  'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001',
  'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

interface InventoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  filterLowStock?: boolean;
  onClearFilter?: () => void;
}

interface ShoppingListItem {
  productId: string;
  name: string;
  quantity: number;
  category: string;
}

export interface MassEditItem {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  sellingUnit: string;
  unitsPerPurchase: number;
  purchasePrice: number;
  unitCostPrice: number;
  sellingPrice: number;
  purchaseSellingPrice: number;
  pricingMode: 'auto_purchase' | 'auto_sell' | 'manual';
  selected?: boolean;
}

export default function Inventory({ store, onUpdate, filterLowStock, onClearFilter }: InventoryProps) {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    costPrice: string;
    sellingPrice: string;
    quantity: string;
    category: string;
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
  const [importMode, setImportMode] = useState<'text' | 'image'>('text');
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
    const isFamilyMatch = nameSim >= 0.75 || c1Lower.includes(c2Lower) || c2Lower.includes(c1Lower);

    if (!isFamilyMatch) {
      return 0; // STOP immediately - Different Core Products
    }

    // STEP 3: Compare Attributes
    // Start with a high base confidence since we confirmed they have the same core product
    let confidence = 75; // baseline confidence for same core product family

    // 1. Name match weight
    confidence += Math.round(nameSim * 15); // max +15 pts

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
        if (reviewedKeys.includes(key1) || reviewedKeys.includes(key2)) continue;

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

      setLocalReviewedPairs(prev => [...prev, key]);
      
      const dismissed = updatedStore.dismissedSimilarPairs || [];
      updatedStore = {
        ...updatedStore,
        dismissedSimilarPairs: [...dismissed, key]
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
  const [massDeleteStep, setMassDeleteStep] = useState(1); // 1 = Quiz, 2 = Confirm
  const [quizAnswers, setQuizAnswers] = useState({ q1: '', q2: '', q3: '' });
  const [quizError, setQuizError] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const [countMode, setCountMode] = useState(false);
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [showRestockConfirm, setShowRestockConfirm] = useState(false);
  const [showPlannedRestocks, setShowPlannedRestocks] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Product | null>(null);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [selectedTransferProduct, setSelectedTransferProduct] = useState<Product | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferDestCode, setTransferDestCode] = useState('');
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const [massEditItems, setMassEditItems] = useState<MassEditItem[] | null>(null);
  const [batchBuy, setBatchBuy] = useState('');
  const [batchSell, setBatchSell] = useState('');
  const [batchContains, setBatchContains] = useState('');

  const lowThreshold = getLowStockThreshold();
  let products = store.products;
  if (showDiscontinued) {
    products = products.filter(p => p.discontinued);
  } else {
    products = products.filter(p => !p.discontinued);
  }
  if (filterLowStock) products = products.filter(p => p.quantity <= lowThreshold);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

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
    const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
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
    let singlesPerCartonVal = newProduct.isCartonSingleEnabled ? Number(newProduct.singlesPerCarton) : undefined;
    let singlePriceVal = (newProduct.isCartonSingleEnabled && newProduct.singleSellingPrice) ? Number(newProduct.singleSellingPrice) : undefined;
    
    const updated = addProduct(store, {
      name: newProduct.name,
      costPrice: Number(newProduct.costPrice),
      sellingPrice: Number(newProduct.sellingPrice),
      quantity: Number(newProduct.quantity),
      category: newProduct.category || 'General',
      isCartonSingleEnabled: newProduct.isCartonSingleEnabled,
      singlesPerCarton: singlesPerCartonVal,
      singleSellingPrice: singlePriceVal,
      sellAsSinglesByDefault: newProduct.sellAsSinglesByDefault,
    });
    onUpdate(updated);
    setNewProduct({
      name: '',
      costPrice: '',
      sellingPrice: '',
      quantity: '',
      category: '',
      isCartonSingleEnabled: false,
      singlesPerCarton: '12',
      singleSellingPrice: '',
      sellAsSinglesByDefault: false
    });
    setShowAddConfirm(false);
    setShowAddModal(false);
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
      isCartonSingleEnabled: editDraft.isCartonSingleEnabled,
      singlesPerCarton: singlesPerCartonVal,
      singleSellingPrice: singlePriceVal,
      sellAsSinglesByDefault: editDraft.sellAsSinglesByDefault,
    };
    const updated = updateProduct(store, editProduct.id, updates);
    onUpdate(updated);
    setEditProduct(null); setEditDraft(null);
    showToast('Product updated — inventory value recalculated');
  };


  const handleDelete = (p: Product) => {
    setConfirmDelete(p);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    onUpdate(deleteProduct(store, confirmDelete.id));
    setConfirmDelete(null);
    showToast('Product deleted');
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
    // Items needing restock: out of stock first, then low stock, sorted by quantity ascending
    const needing = store.products
      .filter(p => p.quantity <= lowThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    if (needing.length === 0) {
      showToast('No items below threshold', 'error');
      return;
    }
    const items: ShoppingListItem[] = needing.map(p => {
      const target = Math.max(lowThreshold * 4, 10);
      const suggested = Math.max(1, target - p.quantity);
      return { productId: p.id, name: p.name, quantity: suggested, category: p.category };
    });
    // Merge with any existing list (replace duplicates with suggested qty)
    const existingIds = new Set(items.map(i => i.productId));
    const merged = [...items, ...shoppingList.filter(i => !existingIds.has(i.productId))];
    setShoppingList(merged);
    setShowShoppingList(true);
    showToast(`${items.length} items added to buy list`);
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

    const updated = receiveStock(store, entries, funding);
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

  return (
    <div className="animate-fade-in">
      {mediumConfidencePairs.length > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs rounded-xl shadow-sm mb-4">
          <span className="font-semibold flex items-center gap-1.5">
            <span>🔍</span> {mediumConfidencePairs.length} similar products found for review.
          </span>
          <button
            onClick={() => setShowMediumReviews(true)}
            className="px-3 py-1 bg-yellow-500 text-black font-display font-bold text-[10px] rounded-lg hover:brightness-110 transition cursor-pointer"
          >
            Review Now
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products..."
          className="flex-1 min-w-[200px] p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="button"
          onClick={() => setShowDiscontinued(!showDiscontinued)}
          className={`px-4 py-2.5 rounded-lg text-sm font-display font-semibold border transition-colors cursor-pointer ${
            showDiscontinued 
              ? 'bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/20 shadow-sm' 
              : 'bg-secondary text-secondary-foreground hover:bg-surface-3 border border-border'
          }`}
        >
          Discontinued
        </button>
        <button onClick={() => { setShowAddModal(true); setShowAddConfirm(false); setNewProduct({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: 'Groceries', isCartonSingleEnabled: false, singlesPerCarton: '12', singleSellingPrice: '', sellAsSinglesByDefault: false }); setCustomCategoryActive(false); setCustomCategoryVal(''); }} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
          + Add
        </button>
        <button onClick={openImportModal} className="px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3 border border-border">
          Import
        </button>
        <button
          onClick={() => {
            const nextItems: MassEditItem[] = store.products.map(p => {
              const learned = (store.learnedProducts || []).find(
                lp => lp.id === p.id || lp.name.toLowerCase() === p.name.toLowerCase()
              );
              
              const purchaseUnit = learned?.purchaseUnit || (p.isCartonSingleEnabled ? 'Carton' : 'Piece');
              const sellingUnit = learned?.sellingUnit || (p.isCartonSingleEnabled ? 'Bottle' : 'Piece');
              const unitsPerPurchase = learned?.unitsPerPurchase || p.singlesPerCarton || 1;
              const purchasePrice = p.costPrice * unitsPerPurchase;
              const unitCostPrice = p.costPrice;
              const purchaseSellingPrice = p.sellingPrice;
              const sellingPrice = p.isCartonSingleEnabled ? (p.singleSellingPrice || Math.round(p.sellingPrice / unitsPerPurchase)) : p.sellingPrice;
              
              return {
                id: p.id,
                name: p.name,
                category: p.category || 'General',
                purchaseUnit,
                sellingUnit,
                unitsPerPurchase,
                purchasePrice,
                unitCostPrice,
                sellingPrice,
                purchaseSellingPrice,
                pricingMode: 'auto_purchase',
                selected: false
              };
            });
            setMassEditItems(nextItems);
          }}
          className="px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3 border border-border flex items-center gap-1 cursor-pointer"
        >
          ✏️ Mass Edit
        </button>
        <button
          onClick={() => {
            setShowMassDeleteModal(true);
            setMassDeleteStep(1);
            setQuizAnswers({ q1: '', q2: '', q3: '' });
            setQuizError('');
            setConfirmText('');
          }}
          className="px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-display font-semibold hover:bg-destructive/20"
          title="Delete all products from inventory"
        >
          🗑 Mass Delete
        </button>
        <button
          onClick={() => { generateBuyList(); }}
          className="px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm font-display font-semibold hover:bg-warning/20"
          title="Auto-generate buy list from low/out-of-stock items"
        >
          📝 Buy List
        </button>
        <button
          onClick={() => setShowPlannedRestocks(true)}
          className="px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-display font-semibold hover:bg-primary/20 relative"
          title="View planned restocks that are not yet received"
        >
          📅 Planned Restocks
          {(store.plannedRestocks || []).length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 animate-pulse">
              {(store.plannedRestocks || []).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setCountMode(true)}
          className="px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm font-display font-semibold hover:bg-warning/20"
          title="Audit product stock counts and adjust inventory"
        >
          📋 Count Audit
        </button>
      </div>

      {countMode && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 mb-4 flex flex-wrap items-center justify-between gap-3 text-left">
          <div>
            <h3 className="font-display font-bold text-warning text-sm flex items-center gap-1.5">
              📋 Stock Count Mode Active
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the physical quantities found on store shelves. Audits will adjust stock and log variances.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAuditHistory(true)}
              className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-foreground hover:bg-surface-3 text-xs font-semibold animate-pulse"
            >
              📜 Audit History
            </button>
            <button
              onClick={() => {
                let updated = store;
                Object.entries(auditCounts).forEach(([pId, act]) => {
                  const prod = store.products.find(p => p.id === pId);
                  if (prod) {
                    updated = recordStockCountAudit(updated, pId, prod.name, prod.quantity, act);
                  }
                });
                onUpdate(updated);
                setAuditCounts({});
                setCountMode(false);
                showToast('✓ Stock counts reconciled');
              }}
              disabled={Object.keys(auditCounts).length === 0}
              className="px-3.5 py-2 rounded-lg bg-warning text-slate-950 hover:opacity-90 disabled:opacity-50 text-xs font-bold"
            >
              ✓ Reconcile Audits ({Object.keys(auditCounts).length})
            </button>
            <button
              onClick={() => {
                setCountMode(false);
                setAuditCounts({});
              }}
              className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {filterLowStock && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-warning text-sm">⚠ Showing low stock items only</span>
          <button onClick={onClearFilter} className="text-primary text-sm underline">Show all</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {products.map(p => {
          const inList = shoppingList.find(i => i.productId === p.id);
          return (
            <div
              key={p.id}
              onClick={() => { if (!countMode) setSelectedDetailProduct(p); }}
              className={`p-3 rounded-lg bg-card border flex items-center gap-3 transition-colors cursor-pointer hover:bg-surface-2/30 ${
                p.discontinued
                  ? 'opacity-60 border-dashed border-destructive/40 bg-surface-1/40'
                  : p.barcode ? 'border-success/40 ring-1 ring-success/20' : 'border-border hover:border-primary/20'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`font-display font-semibold text-sm truncate ${p.discontinued ? 'text-muted-foreground line-through' : ''}`}>{p.name}</p>
                  {p.discontinued && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-bold">Discontinued</span>
                  )}
                  {p.addedAt && !p.discontinued && (Date.now() - new Date(p.addedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">New</span>
                  )}
                  {p.barcode && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold" title={`Barcode: ${p.barcode}`}>✓</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate text-left">
                  {p.category}
                  {p.addedAt && <span className="ml-1.5">• {new Date(p.addedAt).toLocaleDateString()}</span>}
                </p>
              </div>

              {countMode ? (
                <div className="flex items-center gap-3 bg-surface-2/45 p-2 rounded-lg border border-border/40 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Expected</p>
                    <p className="font-bold text-sm text-foreground">{p.quantity}</p>
                  </div>
                  <div className="w-16">
                    <p className="text-[10px] text-muted-foreground">Actual</p>
                    <input
                      type="number"
                      value={auditCounts[p.id] ?? ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '') {
                          const next = { ...auditCounts };
                          delete next[p.id];
                          setAuditCounts(next);
                        } else {
                          setAuditCounts({ ...auditCounts, [p.id]: Number(val) });
                        }
                      }}
                      placeholder="--"
                      className="w-full p-1 text-center text-xs font-semibold rounded bg-surface-3 border border-border text-foreground focus:outline-none focus:border-warning"
                    />
                  </div>
                  <div className="text-center min-w-[48px]">
                    <p className="text-[10px] text-muted-foreground">Variance</p>
                    {auditCounts[p.id] !== undefined ? (
                      (() => {
                        const expected = p.quantity;
                        const actual = auditCounts[p.id];
                        const diff = actual - expected;
                        const color = diff === 0 ? 'text-success' : diff > 0 ? 'text-blue-400' : 'text-destructive';
                        const sign = diff > 0 ? '+' : '';
                        return <p className={`font-bold text-xs ${color}`}>{sign}{diff}</p>;
                      })()
                    ) : (
                      <p className="text-xs text-muted-foreground font-semibold">--</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-20 shrink-0 text-right text-xs space-y-0.5">
                    <p className="text-muted-foreground">₦{p.costPrice.toLocaleString()}</p>
                    <p className="text-primary">₦{p.sellingPrice.toLocaleString()}</p>
                    {(() => {
                      const margin = p.sellingPrice - p.costPrice;
                      const pct = p.costPrice > 0 ? (margin / p.costPrice) * 100 : 0;
                      const cls = margin > 0 ? 'text-success' : margin < 0 ? 'text-destructive' : 'text-muted-foreground';
                      return <p className={cls}>+{pct.toFixed(0)}%</p>;
                    })()}
                  </div>
                  <div className={`w-12 shrink-0 text-center ${p.quantity <= lowThreshold ? 'text-destructive' : p.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                    <p className="text-lg font-bold leading-none">{p.quantity}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">stock</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setScanForProduct(p)}
                        title={p.barcode ? 'Re-scan barcode' : 'Scan barcode to save'}
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center ${p.barcode ? 'bg-success/20 text-success' : 'bg-surface-3 text-foreground'}`}
                      >
                        📷
                      </button>
                      <button
                        onClick={() => setSelectedBarcodeProduct(p)}
                        title="View / Generate barcode labels"
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center ${p.barcode ? 'bg-primary/20 text-primary animate-pulse' : 'bg-surface-3 text-foreground'}`}
                      >
                        📊
                      </button>
                      <button
                        onClick={() => addToShoppingList(p)}
                        title="Add to shopping list"
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center relative ${inList ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-foreground'}`}
                      >
                        🛒
                        {inList && (
                          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                            {inList.quantity}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setRestockProduct(p); setRestockQty(''); setSingleRestockFunding('balance'); setShowRestockConfirm(false); }} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-success flex items-center justify-center" title="Restock">↑</button>
                      <button onClick={() => { setSelectedTransferProduct(p); setTransferQty(''); setTransferDestCode(''); }} title="Transfer stock to sister store" className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-warning flex items-center justify-center">🚚</button>
                      <button onClick={() => { setEditProduct({ ...p }); setEditDraft({ name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), quantity: String(p.quantity), category: p.category }); setEditCustomCategoryActive(p.category !== 'Groceries' && p.category !== 'Beverages' && p.category !== 'Detergents' && p.category !== 'Soap' && p.category !== 'Others' && !['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(p.category)); setEditCustomCategoryVal(p.category); }} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-primary flex items-center justify-center" title="Edit">✎</button>
                      <button onClick={() => handleDelete(p)} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-destructive flex items-center justify-center" title="Delete">✕</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No products found</p>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (() => {
        const settings = store.managerSettings;
        const showSmartPricing = !settings || settings.smartPricing;
        const cost = Number(newProduct.costPrice) || 0;
        const margins = [20, 30, 40, 50];
        const defaultMargin = settings?.defaultMargin ?? 30;
        return (
        <Modal title={showAddConfirm ? "Confirm Product Addition" : "Add Product"} onClose={() => { setShowAddModal(false); setShowAddConfirm(false); }}>
          {showAddConfirm ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm text-center font-display font-bold">
                ⚠️ Confirm Action
              </div>
              <p className="text-sm text-foreground leading-snug text-center">
                Are you sure you want to add this product to your inventory?
              </p>
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border space-y-1.5 text-xs text-left">
                <p><span className="text-muted-foreground">Product Name:</span> <strong className="text-foreground">{newProduct.name}</strong></p>
                <p><span className="text-muted-foreground">Cost Price:</span> <strong className="text-foreground">₦{Number(newProduct.costPrice).toLocaleString()}</strong></p>
                <p><span className="text-muted-foreground">Selling Price:</span> <strong className="text-foreground">₦{Number(newProduct.sellingPrice).toLocaleString()}</strong></p>
                <p><span className="text-muted-foreground">Quantity:</span> <strong className="text-foreground">{newProduct.quantity} units</strong></p>
                <p><span className="text-muted-foreground">Category:</span> <strong className="text-foreground">{newProduct.category}</strong></p>
                {newProduct.isCartonSingleEnabled && (
                  <>
                    <p><span className="text-muted-foreground">Carton & Single:</span> <strong className="text-foreground">Enabled</strong></p>
                    <p><span className="text-muted-foreground">Singles per Carton:</span> <strong className="text-foreground">{newProduct.singlesPerCarton}</strong></p>
                    <p><span className="text-muted-foreground">Single Price:</span> <strong className="text-foreground">₦{Number(newProduct.singleSellingPrice || 0).toLocaleString()}</strong></p>
                  </>
                )}
              </div>
              
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleActualAdd}
                  className="w-full p-3 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Yes, add product
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddConfirm(false)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  No / Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                value={newProduct.name}
                onChange={e => {
                  const name = e.target.value;
                  const guessed = autoCategory(name);
                  const autoCtn = autoDetectCartonSingle(name, Number(newProduct.sellingPrice) || 0);
                  setNewProduct(prev => ({
                    ...prev,
                    name,
                    category: guessed,
                    isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
                    singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
                    singleSellingPrice: autoCtn.isCartonSingleEnabled ? String(autoCtn.singleSellingPrice) : prev.singleSellingPrice,
                    sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
                  }));
                  if (guessed === 'Others') {
                    setCustomCategoryActive(true);
                    setCustomCategoryVal('');
                  } else {
                    setCustomCategoryActive(false);
                  }
                }}
                placeholder="Product name"
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <input value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="Cost price (₦)" type="number" className={inputClass} />
                <input
                  value={newProduct.sellingPrice}
                  onChange={e => {
                    const val = e.target.value;
                    const numCarton = Number(val) || 0;
                    const autoCtn = autoDetectCartonSingle(newProduct.name, numCarton);
                    const numSingles = autoCtn.isCartonSingleEnabled ? autoCtn.singlesPerCarton : (Number(newProduct.singlesPerCarton) || 12);
                    const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                    setNewProduct(prev => ({
                      ...prev,
                      sellingPrice: val,
                      isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
                      singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
                      singleSellingPrice: prev.isCartonSingleEnabled || autoCtn.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice,
                      sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
                    }));
                  }}
                  placeholder="Selling price (₦)"
                  type="number"
                  className={inputClass}
                />
              </div>
              {showSmartPricing && cost > 0 && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing <span className="text-muted-foreground font-normal">(Recommended)</span></p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Based on your {defaultMargin}% default profit margin</p>
                  <div className="space-y-1.5">
                    {margins.map(m => {
                      const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
                      const profit = price - cost;
                      const isDefault = m === defaultMargin;
                      const isSelected = Number(newProduct.sellingPrice) === price;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            const priceStr = String(price);
                            const numCarton = price;
                            const numSingles = Number(newProduct.singlesPerCarton) || 12;
                            const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                            setNewProduct(prev => ({
                              ...prev,
                              sellingPrice: priceStr,
                              singleSellingPrice: prev.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice
                            }));
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs font-display font-semibold transition-colors ${
                            isSelected || (isDefault && !newProduct.sellingPrice)
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-surface-2 border-border text-foreground hover:border-primary/30'
                          }`}
                        >
                          <span>{m}% Margin</span>
                          <span>₦{price.toLocaleString()}</span>
                          <span className="text-success">Profit: ₦{profit.toLocaleString()}{isSelected ? ' ✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Carton & Single Sales Configuration */}
              <div className="p-3 rounded-xl bg-surface-2 border border-border/40 space-y-2 text-left">
                <label className="flex items-center gap-2 text-xs font-display font-semibold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newProduct.isCartonSingleEnabled}
                    onChange={e => setNewProduct(prev => ({ ...prev, isCartonSingleEnabled: e.target.checked }))}
                    className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                  />
                  📦 Enable Carton & Single sales
                </label>

                {newProduct.isCartonSingleEnabled && (
                  <div className="space-y-3 pt-2 border-t border-border/20">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-muted-foreground">Singles per Carton</label>
                        <input
                          type="number"
                          value={newProduct.singlesPerCarton}
                          onChange={e => {
                            const val = e.target.value;
                            const numCarton = Number(newProduct.sellingPrice) || 0;
                            const numSingles = Number(val) || 12;
                            const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                            setNewProduct(prev => ({ ...prev, singlesPerCarton: val, singleSellingPrice: calculatedSingle }));
                          }}
                          placeholder="e.g. 12"
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-muted-foreground">Single Selling Price (₦)</label>
                        <input
                          type="number"
                          value={newProduct.singleSellingPrice}
                          onChange={e => setNewProduct(prev => ({ ...prev, singleSellingPrice: e.target.value }))}
                          placeholder="Auto-calculated"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newProduct.sellAsSinglesByDefault}
                        onChange={e => setNewProduct(prev => ({ ...prev, sellAsSinglesByDefault: e.target.checked }))}
                        className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                      />
                      Sell as singles by default at checkout
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input value={newProduct.quantity} onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })} placeholder="Quantity" type="number" className={inputClass} />
                <div className="space-y-2 text-left">
                  <select
                    value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(newProduct.category) ? newProduct.category : 'Others'}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'Others') {
                        setCustomCategoryActive(true);
                        setNewProduct({ ...newProduct, category: customCategoryVal || 'Others' });
                      } else {
                        setCustomCategoryActive(false);
                        setNewProduct({ ...newProduct, category: val });
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Detergents">Detergents</option>
                    <option value="Soap">Soap</option>
                    <option value="Others">Others / Custom</option>
                  </select>
                  {customCategoryActive && (
                    <input
                      value={customCategoryVal}
                      onChange={e => {
                        setCustomCategoryVal(e.target.value);
                        setNewProduct({ ...newProduct, category: e.target.value });
                      }}
                      placeholder="Enter custom category..."
                      className={inputClass}
                    />
                  )}
                </div>
              </div>
              <button onClick={handleAdd} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Item</button>
            </div>
          )}
        </Modal>
        );
      })()}



      {/* Edit Modal */}
      {editProduct && editDraft && (() => {
        const cost = Number(editDraft.costPrice) || 0;
        const settings = store.managerSettings;
        const showSmart = !settings || settings.smartPricing;
        const margins = [20, 30, 40, 50];
        const defaultMargin = settings?.defaultMargin ?? 30;
        return (
        <Modal title="Edit Product" onClose={() => { setEditProduct(null); setEditDraft(null); }}>
          <div className="space-y-3">
            <input 
              value={editDraft.name} 
              onChange={e => {
                const name = e.target.value;
                const autoCtn = autoDetectCartonSingle(name, Number(editDraft.sellingPrice) || 0);
                setEditDraft(prev => prev ? ({
                  ...prev,
                  name,
                  isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
                  singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
                  singleSellingPrice: autoCtn.isCartonSingleEnabled ? String(autoCtn.singleSellingPrice) : prev.singleSellingPrice,
                  sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
                }) : null);
              }} 
              className={inputClass} 
            />
            <div className="grid grid-cols-2 gap-3">
              <input value={editDraft.costPrice} onChange={e => setEditDraft({ ...editDraft, costPrice: e.target.value })} type="number" placeholder="Cost (₦)" className={inputClass} />
              <input
                value={editDraft.sellingPrice}
                onChange={e => {
                  const val = e.target.value;
                  const numCarton = Number(val) || 0;
                  const autoCtn = autoDetectCartonSingle(editDraft.name, numCarton);
                  const numSingles = autoCtn.isCartonSingleEnabled ? autoCtn.singlesPerCarton : (Number(editDraft.singlesPerCarton) || 12);
                  const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                  setEditDraft(prev => prev ? ({
                    ...prev,
                    sellingPrice: val,
                    isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
                    singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
                    singleSellingPrice: prev.isCartonSingleEnabled || autoCtn.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice,
                    sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
                  }) : null);
                }}
                type="number"
                placeholder="Selling (₦)"
                className={inputClass}
              />
            </div>
            {showSmart && cost > 0 && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {margins.map(m => {
                    const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
                    const selected = Number(editDraft.sellingPrice) === price;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          const priceStr = String(price);
                          const numCarton = price;
                          const numSingles = Number(editDraft.singlesPerCarton) || 12;
                          const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                          setEditDraft(prev => prev ? ({
                            ...prev,
                            sellingPrice: priceStr,
                            singleSellingPrice: prev.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice
                          }) : null);
                        }}
                        className={`p-2 rounded-lg border text-xs font-display font-semibold ${
                          selected || m === defaultMargin && !editDraft.sellingPrice
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-surface-2 border-border text-foreground hover:border-primary/30'
                        }`}
                      >
                        {m}% → ₦{price.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Carton & Single Sales Configuration */}
            <div className="p-3 rounded-xl bg-surface-2 border border-border/40 space-y-2 text-left">
              <label className="flex items-center gap-2 text-xs font-display font-semibold text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editDraft.isCartonSingleEnabled}
                  onChange={e => setEditDraft(prev => prev ? ({ ...prev, isCartonSingleEnabled: e.target.checked }) : null)}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
                📦 Enable Carton & Single sales
              </label>

              {editDraft.isCartonSingleEnabled && (
                <div className="space-y-3 pt-2 border-t border-border/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-muted-foreground">Singles per Carton</label>
                      <input
                        type="number"
                        value={editDraft.singlesPerCarton}
                        onChange={e => {
                          const val = e.target.value;
                          const numCarton = Number(editDraft.sellingPrice) || 0;
                          const numSingles = Number(val) || 12;
                          const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                          setEditDraft(prev => prev ? ({ ...prev, singlesPerCarton: val, singleSellingPrice: calculatedSingle }) : null);
                        }}
                        placeholder="e.g. 12"
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-muted-foreground">Single Selling Price (₦)</label>
                      <input
                        type="number"
                        value={editDraft.singleSellingPrice}
                        onChange={e => setEditDraft(prev => prev ? ({ ...prev, singleSellingPrice: e.target.value }) : null)}
                        placeholder="Auto-calculated"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editDraft.sellAsSinglesByDefault}
                      onChange={e => setEditDraft(prev => prev ? ({ ...prev, sellAsSinglesByDefault: e.target.checked }) : null)}
                      className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                    />
                    Sell as singles by default at checkout
                  </label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input value={editDraft.quantity} onChange={e => setEditDraft({ ...editDraft, quantity: e.target.value })} type="number" placeholder="Quantity" className={inputClass} />
              <div className="space-y-2 text-left">
                <select
                  value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(editDraft.category) ? editDraft.category : 'Others'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Others') {
                      setEditCustomCategoryActive(true);
                      setEditDraft({ ...editDraft, category: editCustomCategoryVal || 'Others' });
                    } else {
                      setEditCustomCategoryActive(false);
                      setEditDraft({ ...editDraft, category: val });
                    }
                  }}
                  className={inputClass}
                >
                  <option value="Groceries">Groceries</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Detergents">Detergents</option>
                  <option value="Soap">Soap</option>
                  <option value="Others">Others / Custom</option>
                </select>
                {editCustomCategoryActive && (
                  <input
                    value={editCustomCategoryVal}
                    onChange={e => {
                      setEditCustomCategoryVal(e.target.value);
                      setEditDraft({ ...editDraft, category: e.target.value });
                    }}
                    placeholder="Enter custom category..."
                    className={inputClass}
                  />
                )}
              </div>
            </div>
            <button onClick={handleEdit} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Changes</button>

            {/* Price History Section */}
            {(() => {
              const priceHistory = editProduct.priceHistory || [];
              if (priceHistory.length === 0) return null;
              return (
                <div className="pt-3 border-t border-border/60 space-y-2 mt-3 text-left">
                  <p className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                    📈 Cost Price History
                  </p>
                  {priceHistory.length >= 2 && (
                    <div className="h-28 w-full bg-surface-2 p-1.5 rounded-lg border border-border">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(str) => {
                              try {
                                return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              } catch {
                                return '';
                              }
                            }}
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                          />
                          <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '6px', padding: '6px' }}
                            labelStyle={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}
                            itemStyle={{ color: '#f8fafc', fontSize: 9 }}
                            labelFormatter={(lbl) => {
                              try {
                                return new Date(lbl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                              } catch {
                                return String(lbl);
                              }
                            }}
                          />
                          <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={1.5} dot={{ fill: '#d97706', r: 2 }} name="Cost" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10px]">
                    {priceHistory.slice().reverse().map((h, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-surface-2 p-1.5 rounded border border-border">
                        <span className="text-muted-foreground">
                          {new Date(h.date).toLocaleDateString('en-GB')} {new Date(h.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-semibold text-primary">₦{h.costPrice.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
        );
      })()}


      {/* Restock Modal */}
      {restockProduct && (
        <Modal title={showRestockConfirm ? "Confirm Restock" : `Restock: ${restockProduct.name}`} onClose={() => { setRestockProduct(null); setShowRestockConfirm(false); }}>
          {showRestockConfirm ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm text-center font-display font-bold">
                ⚠️ Confirm Action
              </div>
              <p className="text-sm text-foreground leading-snug">
                Are you sure you have this inventory to restock now for this item to restock now before?
              </p>
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border space-y-1.5 text-xs text-left">
                <p><span className="text-muted-foreground">Product:</span> <strong className="text-foreground">{restockProduct.name}</strong></p>
                <p><span className="text-muted-foreground">Restock Qty:</span> <strong className="text-foreground">{restockQty} units</strong></p>
                <p><span className="text-muted-foreground">Funding:</span> <strong className="text-foreground">{singleRestockFunding === 'new_money' ? '💵 New Money' : '🏦 From Balance'}</strong></p>
              </div>
              
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleActualRestock}
                  className="w-full p-3 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Yes, restock now
                </button>
                <button
                  type="button"
                  onClick={handleSavePlannedRestock}
                  className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer border border-primary/20"
                >
                  Not yet (Save as Planned)
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestockConfirm(false)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  No / Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Current stock: <span className="text-foreground">{restockProduct.quantity}</span></p>
              <input value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="Quantity to add" type="number" className={inputClass} />
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Funding</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => setSingleRestockFunding('balance')}
                    className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                      singleRestockFunding === 'balance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                    }`}
                  >
                    💰 From Balance
                  </button>
                  <button
                    onClick={() => setSingleRestockFunding('new_money')}
                    className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                      singleRestockFunding === 'new_money' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                    }`}
                  >
                    💵 New Money
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {singleRestockFunding === 'new_money'
                    ? 'Recorded as expense + new investment (ROI base grows, cash neutral).'
                    : 'Recorded as expense only — net income / available cash drops.'}
                </p>
              </div>
              <button onClick={handleRestock} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Restock</button>
            </div>
          )}
        </Modal>
      )}

      {/* Planned Restocks Modal */}
      {showPlannedRestocks && (
        <Modal title={`Planned Restocks (${(store.plannedRestocks || []).length})`} onClose={() => setShowPlannedRestocks(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              These are planned inventory restocks. Once you have received the items, click "Receive Now" to add them to your active inventory.
            </p>
            
            {(!store.plannedRestocks || store.plannedRestocks.length === 0) ? (
              <p className="text-center py-6 text-xs text-muted-foreground">No planned restocks saved yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {store.plannedRestocks.map(pr => (
                  <div key={pr.id} className="p-3 rounded-xl bg-surface-2 border border-border space-y-2 text-left">
                    <div className="flex justify-between items-baseline gap-2">
                      <h4 className="font-display font-bold text-sm text-foreground">{pr.productName}</h4>
                      <span className="text-[10px] text-muted-foreground">{new Date(pr.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Qty: <strong>{pr.quantity}</strong></span>
                      <span>Unit Cost: ₦{pr.costPrice.toLocaleString()}</span>
                      <span>Total: ₦{(pr.quantity * pr.costPrice).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border/30">
                      <button
                        onClick={() => {
                          const updated = receiveStock(
                            store,
                            [{ productId: pr.productId, quantity: pr.quantity, costPrice: pr.costPrice }],
                            pr.funding
                          );
                          const final = {
                            ...updated,
                            plannedRestocks: (updated.plannedRestocks || []).filter(x => x.id !== pr.id)
                          };
                          onUpdate(final);
                          showToast(`✓ Planned stock received: ${pr.productName}`);
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-success text-white font-display font-bold text-xs hover:opacity-90 cursor-pointer"
                      >
                        📥 Receive Now
                      </button>
                      <button
                        onClick={() => {
                          const final = {
                            ...store,
                            plannedRestocks: (store.plannedRestocks || []).filter(x => x.id !== pr.id)
                          };
                          onUpdate(final);
                          showToast('Planned restock deleted');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button
              onClick={() => setShowPlannedRestocks(false)}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border font-display font-semibold text-xs text-foreground"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <Modal title={importPreview ? `Review (${importPreview.length})` : 'Bulk Import'} onClose={() => { setShowImportModal(false); setImportPreview(null); }}>
          {!importPreview ? (
            <div className="space-y-4">
              {/* Tab Switcher */}
              <div className="flex gap-2 p-1 bg-surface-2 border border-border rounded-xl">
                <button
                  type="button"
                  onClick={() => setImportMode('text')}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                    importMode === 'text' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📝 Text Import (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('image')}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                    importMode === 'image' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📷 Receipt Scan (OCR)
                </button>
              </div>

              {importMode === 'text' ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Format: Name, Cost, Selling Price, Quantity, Category (one per line)</p>
                  <textarea value={importText} onChange={e => setImportText(e.target.value)}
                    placeholder={"Rice 5kg, 3000, 4500, 20, Groceries\nSugar 1kg, 500, 700, 30, Groceries"}
                    rows={6} className={`${inputClass} resize-none`} />
                  <button onClick={handleImportParse} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Preview Items →</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground text-center">
                    Upload or snap a receipt image. Our offline scanner will extract products, prices, and quantities automatically.
                  </p>
                  
                  {isOcrLoading ? (
                    <div className="p-8 text-center bg-surface-2 border border-border rounded-xl space-y-3">
                      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
                      <p className="text-sm font-display font-semibold text-primary">Scanning receipt offline...</p>
                      <p className="text-[10px] text-muted-foreground">Processing receipt text details inside browser</p>
                    </div>
                  ) : (
                    <div
                      onClick={() => ocrFileRef.current?.click()}
                      className="border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-8 text-center cursor-pointer transition-colors space-y-2 bg-surface-2"
                    >
                      <span className="text-4xl block">📷</span>
                      <p className="text-sm font-display font-bold">Upload or Take Photo</p>
                      <p className="text-xs text-muted-foreground">Supports JPG, PNG, HEIC</p>
                    </div>
                  )}
                  
                  <input
                    ref={ocrFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleOcrScan}
                    className="hidden"
                  />
                  
                  {ocrError && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-center leading-normal">
                      {ocrError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-surface-2 p-2.5 rounded-xl border border-border/50">
                <p className="text-xs text-muted-foreground">
                  Review and edit each item before saving.
                </p>
                {/* AA Button (Apply margin to all matching items) */}
                {(() => {
                  const defaultMargin = store.managerSettings?.defaultMargin ?? 20;
                  const hasSamePrice = importPreview.some(it => {
                    const cp = Number(it.costPrice) || 0;
                    const sp = Number(it.sellingPrice) || 0;
                    return cp > 0 && cp === sp;
                  });
                  if (!hasSamePrice) return null;
                  return (
                    <button
                      onClick={() => {
                        const next = importPreview.map(it => {
                          const cp = Number(it.costPrice) || 0;
                          const sp = Number(it.sellingPrice) || 0;
                          if (cp > 0 && cp === sp) {
                            const suggested = Math.round(cp * (1 + defaultMargin / 100));
                            return { ...it, sellingPrice: String(suggested) };
                          }
                          return it;
                        });
                        setImportPreview(next);
                        showToast(`✓ Applied ${defaultMargin}% margin to all same-price items!`, 'success');
                      }}
                      className="px-2.5 py-1 bg-yellow-500 hover:brightness-110 text-black text-[10px] font-display font-bold rounded-lg transition-all cursor-pointer shrink-0"
                    >
                      ⚡ AA (Apply Margin to All)
                    </button>
                  );
                })()}
              </div>

              {/* Items List */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {importPreview.map((it, i) => {
                  const cp = Number(it.costPrice) || 0;
                  const sp = Number(it.sellingPrice) || 0;
                  const isPriceSame = cp > 0 && cp === sp;
                  const defaultMargin = store.managerSettings?.defaultMargin ?? 20;
                  const markupSuggested = cp * (1 + defaultMargin / 100);

                   // Carton detection
                  const n = it.name.toLowerCase();
                  const cartonWords = ['carton', 'ctn', 'pack', 'box', 'case', 'crate', 'bundle', 'dozen', 'roll', 'rolls'];
                  const matchesCarton = cartonWords.some(w => n.includes(w));
                  let singlesCount = n.includes('roll') ? 10 : 12;
                  if (it.singlesPerCarton) {
                    singlesCount = parseInt(it.singlesPerCarton) || (n.includes('roll') ? 10 : 12);
                  } else if (matchesCarton) {
                    const rx = /(?:x|qty|size|of|pack|ctn|carton|roll|\b)\s*(\d+)\b/i;
                    const matches = n.match(rx);
                    if (matches && matches[1]) {
                      const val = parseInt(matches[1]);
                      if (val > 1 && val <= 200) singlesCount = val;
                    }
                  }

                  return (
                    <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-border/85 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={it.name}
                          onChange={e => {
                            const next = [...importPreview];
                            next[i] = { ...it, name: e.target.value };
                            setImportPreview(next);
                          }}
                          placeholder="Product Name"
                          className="flex-1 text-xs font-display font-semibold bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white placeholder:text-muted-foreground"
                        />
                        <button
                          onClick={() => setImportPreview(importPreview.filter((_, k) => k !== i))}
                          className="w-8 h-8 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20 text-xs flex items-center justify-center cursor-pointer transition-colors"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Cost (₦)</label>
                          <input
                            value={it.costPrice}
                            onChange={e => {
                              const n = [...importPreview];
                              n[i] = { ...it, costPrice: e.target.value };
                              setImportPreview(n);
                            }}
                            type="number"
                            placeholder="Cost"
                            className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Selling (₦)</label>
                          <input
                            value={it.sellingPrice}
                            onChange={e => {
                              const n = [...importPreview];
                              n[i] = { ...it, sellingPrice: e.target.value };
                              setImportPreview(n);
                            }}
                            type="number"
                            placeholder="Sell"
                            className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Quantity</label>
                          <input
                            value={it.quantity}
                            onChange={e => {
                              const n = [...importPreview];
                              n[i] = { ...it, quantity: e.target.value };
                              setImportPreview(n);
                            }}
                            type="number"
                            placeholder="Qty"
                            className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                          <input
                            value={it.category}
                            onChange={e => {
                              const n = [...importPreview];
                              n[i] = { ...it, category: e.target.value };
                              setImportPreview(n);
                            }}
                            placeholder="Cat"
                            className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                          />
                        </div>
                      </div>

                      {/* Same Price alert message */}
                      {isPriceSame && (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-500 leading-snug">
                          <span>Apply suggestions (₦{Math.round(markupSuggested)})?</span>
                          <button
                            onClick={() => {
                              const next = [...importPreview];
                              next[i] = { ...it, sellingPrice: String(Math.round(markupSuggested)) };
                              setImportPreview(next);
                              showToast(`Suggested selling price applied!`, 'success');
                            }}
                            className="px-2.5 py-1 bg-yellow-500 text-black text-[10px] font-display font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
                          >
                            OK
                          </button>
                        </div>
                      )}

                      {/* Carton details feedback */}
                      {matchesCarton && (
                        (() => {
                          const isRoll = it.name.toLowerCase().includes('roll');
                          const splitOptions = isRoll ? [10, 8, 12] : [12, 24, 40];
                          return (
                            <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 text-xs text-primary space-y-2.5 font-display font-semibold text-left">
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span>{isRoll ? '🌀 Roll' : '📦 Carton'} Product detected: will auto-split into <strong>{singlesCount}</strong> units.</span>
                              </div>
                              
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mr-1">Split count:</span>
                                {splitOptions.map(val => (
                                  <button
                                    key={val}
                                    onClick={() => {
                                      const next = [...importPreview];
                                      next[i] = { ...it, singlesPerCarton: String(val) };
                                      setImportPreview(next);
                                      showToast(`Auto-split set to ${val} units`, 'success');
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] border transition cursor-pointer font-bold ${
                                      singlesCount === val
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-surface-3 text-foreground hover:bg-surface-2 border-border'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                ))}
                                
                                <div className="flex items-center gap-1 bg-surface-3 rounded border border-border px-1.5 py-0.5">
                                  <span className="text-[9px] text-muted-foreground uppercase font-bold">Edit:</span>
                                  <input
                                    type="number"
                                    value={it.singlesPerCarton || String(singlesCount)}
                                    onChange={e => {
                                      const next = [...importPreview];
                                      next[i] = { ...it, singlesPerCarton: e.target.value };
                                      setImportPreview(next);
                                    }}
                                    className="w-10 bg-transparent text-foreground text-[10px] font-mono font-bold focus:outline-none text-center"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="p-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:bg-surface-3 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={handleImportApprove}
                  className="p-3 rounded-xl bg-success text-white text-xs font-display font-bold hover:opacity-95 shadow-md"
                >
                  ✓ Approve & Save
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Mass Edit Modal */}
      {massEditItems && (
        <Modal title={`Mass Edit Inventory (${massEditItems.length})`} onClose={() => setMassEditItems(null)}>
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground">
              Configure purchase/selling structures, set auto-update rules, quick margins, and batch structure updates.
            </p>

            {/* Batch Editing Panel */}
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={massEditItems.length > 0 && massEditItems.every(it => it.selected)}
                    onChange={e => {
                      const active = e.target.checked;
                      setMassEditItems(massEditItems.map(it => ({ ...it, selected: active })));
                    }}
                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="text-xs font-display font-bold text-foreground">
                    Select All ({massEditItems.filter(it => it.selected).length} selected)
                  </span>
                </div>
                {massEditItems.some(it => it.selected) && (
                  <button
                    onClick={() => {
                      const count = massEditItems.filter(it => it.selected).length;
                      const updated = massEditItems.map(it => {
                        if (it.selected) {
                          const nextContains = Number(batchContains) || it.unitsPerPurchase;
                          const nextBuy = batchBuy || it.purchaseUnit;
                          const nextSell = batchSell || it.sellingUnit;
                          const cp = nextContains > 1 ? (it.purchasePrice / nextContains) : it.purchasePrice;
                          let sp = it.sellingPrice;
                          let psp = it.purchaseSellingPrice;
                          if (it.pricingMode === 'auto_sell') {
                            psp = sp * nextContains;
                          } else if (it.pricingMode === 'auto_purchase') {
                            sp = Math.round(psp / nextContains);
                          }
                          return {
                            ...it,
                            purchaseUnit: nextBuy,
                            sellingUnit: nextSell,
                            unitsPerPurchase: nextContains,
                            unitCostPrice: cp,
                            sellingPrice: sp,
                            purchaseSellingPrice: psp
                          };
                        }
                        return it;
                      });
                      setMassEditItems(updated);
                      showToast(`✓ Applied structure to ${count} products`, 'success');
                    }}
                    className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-display font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    ⚡ Apply to Selected
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Buy As</label>
                  <select
                    value={batchBuy}
                    onChange={e => setBatchBuy(e.target.value)}
                    className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                  >
                    <option value="">-- No Change --</option>
                    {['Carton', 'Pack', 'Roll', 'Bag', 'Crate', 'Dozen', 'Piece', 'Other'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Sell As</label>
                  <select
                    value={batchSell}
                    onChange={e => setBatchSell(e.target.value)}
                    className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                  >
                    <option value="">-- No Change --</option>
                    {['Bottle', 'Sachet', 'Piece', 'Pack', 'Roll', 'Carton', 'Other'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Contains Qty</label>
                  <input
                    value={batchContains}
                    onChange={e => setBatchContains(e.target.value)}
                    type="number"
                    placeholder="e.g. 12"
                    className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                  />
                </div>
              </div>
            </div>

            {/* List of Products */}
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {massEditItems.map((it, i) => {
                const needsSetup = !it.unitsPerPurchase || it.unitsPerPurchase <= 0 || !it.purchasePrice || it.purchasePrice <= 0 || !it.sellingPrice || it.sellingPrice <= 0;
                const profitAmount = it.purchaseSellingPrice - it.purchasePrice;
                const marginPercent = it.purchasePrice > 0 ? (profitAmount / it.purchasePrice) * 100 : 0;
                
                const applyPreset = (presetName: string) => {
                  let pUnit = 'Carton';
                  let sUnit = 'Piece';
                  let containsVal = 12;
                  let catVal = 'Groceries';
                  
                  if (presetName === '🥤 Soft Drink') {
                    pUnit = 'Carton'; sUnit = 'Bottle'; containsVal = 12; catVal = 'Beverages';
                  } else if (presetName === '🍺 Beer') {
                    pUnit = 'Crate'; sUnit = 'Bottle'; containsVal = 12; catVal = 'Beverages';
                  } else if (presetName === '🥛 Sachet Milk') {
                    pUnit = 'Carton'; sUnit = 'Sachet'; containsVal = 40; catVal = 'Beverages';
                  } else if (presetName === '🍜 Noodles') {
                    pUnit = 'Carton'; sUnit = 'Pack'; containsVal = 40; catVal = 'Groceries';
                  } else if (presetName === '🍪 Biscuit') {
                    pUnit = 'Carton'; sUnit = 'Pack'; containsVal = 24; catVal = 'Groceries';
                  } else if (presetName === '🧼 Soap') {
                    pUnit = 'Carton'; sUnit = 'Piece'; containsVal = 12; catVal = 'Soap';
                  } else if (presetName === '🍷 Wine') {
                    pUnit = 'Carton'; sUnit = 'Bottle'; containsVal = 6; catVal = 'Beverages';
                  }
                  
                  const next = [...massEditItems];
                  const cp = containsVal > 1 ? (it.purchasePrice / containsVal) : it.purchasePrice;
                  let sp = it.sellingPrice;
                  let psp = it.purchaseSellingPrice;
                  if (it.pricingMode === 'auto_sell') {
                    psp = sp * containsVal;
                  } else if (it.pricingMode === 'auto_purchase') {
                    sp = Math.round(psp / containsVal);
                  }
                  
                  next[i] = {
                    ...it,
                    purchaseUnit: pUnit,
                    sellingUnit: sUnit,
                    unitsPerPurchase: containsVal,
                    category: catVal,
                    unitCostPrice: cp,
                    sellingPrice: sp,
                    purchaseSellingPrice: psp
                  };
                  setMassEditItems(next);
                  showToast(`✓ Applied preset: ${presetName}`, 'success');
                };

                const applyProfit = (percent: number) => {
                  const next = [...massEditItems];
                  let sp = it.sellingPrice;
                  let psp = it.purchaseSellingPrice;
                  
                  if (it.pricingMode === 'auto_purchase') {
                    psp = Math.round(it.purchasePrice * (1 + percent / 100));
                    sp = it.unitsPerPurchase > 0 ? Math.round(psp / it.unitsPerPurchase) : psp;
                  } else {
                    sp = Math.round(it.unitCostPrice * (1 + percent / 100));
                    psp = sp * it.unitsPerPurchase;
                  }
                  
                  next[i] = {
                    ...it,
                    sellingPrice: sp,
                    purchaseSellingPrice: psp
                  };
                  setMassEditItems(next);
                  showToast(`✓ Applied ${percent}% markup`, 'success');
                };

                return (
                  <div key={it.id} className="p-4 rounded-xl bg-surface-2 border border-border/85 space-y-3.5 relative">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!it.selected}
                        onChange={() => {
                          const next = [...massEditItems];
                          next[i] = { ...it, selected: !it.selected };
                          setMassEditItems(next);
                        }}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                      />
                      <input
                        value={it.name}
                        onChange={e => {
                          const next = [...massEditItems];
                          next[i] = { ...it, name: e.target.value };
                          setMassEditItems(next);
                        }}
                        placeholder="Product Name"
                        className="flex-1 text-xs font-display font-bold bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                      />
                      {needsSetup && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive animate-pulse shrink-0">
                          ⚠️ Needs Setup
                        </span>
                      )}
                      <button
                        onClick={() => setMassEditItems(massEditItems.filter(item => item.id !== it.id))}
                        className="w-8 h-8 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20 text-xs flex items-center justify-center cursor-pointer transition-colors shrink-0"
                        title="Delete Product"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Presets Row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-display font-semibold">Presets:</span>
                      {['🥤 Soft Drink', '🍺 Beer', '🥛 Sachet Milk', '🍜 Noodles', '🍪 Biscuit', '🧼 Soap', '🍷 Wine'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="px-2 py-0.5 rounded bg-surface-3 hover:bg-surface-4 border border-border/70 text-[9px] font-display font-bold transition cursor-pointer text-foreground"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* Structure block */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Buy As</label>
                        <select
                          value={it.purchaseUnit}
                          onChange={e => {
                            const next = [...massEditItems];
                            next[i] = { ...it, purchaseUnit: e.target.value };
                            setMassEditItems(next);
                          }}
                          className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        >
                          {['Carton', 'Pack', 'Roll', 'Bag', 'Crate', 'Dozen', 'Piece', 'Other'].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Sell As</label>
                        <select
                          value={it.sellingUnit}
                          onChange={e => {
                            const next = [...massEditItems];
                            next[i] = { ...it, sellingUnit: e.target.value };
                            setMassEditItems(next);
                          }}
                          className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        >
                          {['Bottle', 'Sachet', 'Piece', 'Pack', 'Roll', 'Carton', 'Other'].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Contains Qty</label>
                        <input
                          value={it.unitsPerPurchase}
                          onChange={e => {
                            const next = [...massEditItems];
                            const val = Math.max(1, Number(e.target.value) || 1);
                            const cp = it.purchasePrice / val;
                            let sp = it.sellingPrice;
                            let psp = it.purchaseSellingPrice;
                            if (it.pricingMode === 'auto_sell') {
                              psp = sp * val;
                            } else if (it.pricingMode === 'auto_purchase') {
                              sp = Math.round(psp / val);
                            }
                            next[i] = {
                              ...it,
                              unitsPerPurchase: val,
                              unitCostPrice: cp,
                              sellingPrice: sp,
                              purchaseSellingPrice: psp
                            };
                            setMassEditItems(next);
                          }}
                          type="number"
                          placeholder="Contains"
                          className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        />
                      </div>
                    </div>

                    {/* Pricing Block */}
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Purchase (₦)</label>
                        <input
                          value={it.purchasePrice}
                          onChange={e => {
                            const next = [...massEditItems];
                            const val = Number(e.target.value) || 0;
                            const cp = it.unitsPerPurchase > 0 ? (val / it.unitsPerPurchase) : val;
                            next[i] = {
                              ...it,
                              purchasePrice: val,
                              unitCostPrice: cp
                            };
                            setMassEditItems(next);
                          }}
                          type="number"
                          placeholder="Purchase"
                          className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Cost/Piece (₦)</label>
                        <input
                          value={Number(it.unitCostPrice.toFixed(2))}
                          readOnly
                          type="number"
                          placeholder="Cost/Piece"
                          className="w-full text-xs font-mono bg-surface-1 border border-border/60 rounded-lg p-2 focus:outline-none text-muted-foreground cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Sell/Piece (₦)</label>
                        <input
                          value={it.sellingPrice}
                          onChange={e => {
                            const next = [...massEditItems];
                            const val = Number(e.target.value) || 0;
                            let psp = it.purchaseSellingPrice;
                            if (it.pricingMode === 'auto_sell') {
                              psp = val * it.unitsPerPurchase;
                            }
                            next[i] = {
                              ...it,
                              sellingPrice: val,
                              purchaseSellingPrice: psp
                            };
                            setMassEditItems(next);
                          }}
                          type="number"
                          placeholder="Sell/Piece"
                          className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Sell/Purchase (₦)</label>
                        <input
                          value={it.purchaseSellingPrice}
                          onChange={e => {
                            const next = [...massEditItems];
                            const val = Number(e.target.value) || 0;
                            let sp = it.sellingPrice;
                            if (it.pricingMode === 'auto_purchase') {
                              sp = it.unitsPerPurchase > 0 ? Math.round(val / it.unitsPerPurchase) : val;
                            }
                            next[i] = {
                              ...it,
                              purchaseSellingPrice: val,
                              sellingPrice: sp
                            };
                            setMassEditItems(next);
                          }}
                          type="number"
                          placeholder="Sell/Purchase"
                          className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        />
                      </div>
                    </div>

                    {/* Auto Update Controls */}
                    <div className="bg-surface-3/50 p-2 rounded-lg border border-border/65 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground font-display font-semibold uppercase">Auto-sync Rule:</span>
                      <div className="flex gap-3 text-[10px] font-display font-bold">
                        <label className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors text-white">
                          <input
                            type="radio"
                            name={`pricingMode-${it.id}`}
                            checked={it.pricingMode === 'auto_purchase'}
                            onChange={() => {
                              const next = [...massEditItems];
                              next[i] = { ...it, pricingMode: 'auto_purchase' };
                              setMassEditItems(next);
                            }}
                            className="text-primary focus:ring-primary w-3 h-3 cursor-pointer"
                          />
                          Unit ➔ Piece
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors text-white">
                          <input
                            type="radio"
                            name={`pricingMode-${it.id}`}
                            checked={it.pricingMode === 'auto_sell'}
                            onChange={() => {
                              const next = [...massEditItems];
                              next[i] = { ...it, pricingMode: 'auto_sell' };
                              setMassEditItems(next);
                            }}
                            className="text-primary focus:ring-primary w-3 h-3 cursor-pointer"
                          />
                          Piece ➔ Unit
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors text-white">
                          <input
                            type="radio"
                            name={`pricingMode-${it.id}`}
                            checked={it.pricingMode === 'manual'}
                            onChange={() => {
                              const next = [...massEditItems];
                              next[i] = { ...it, pricingMode: 'manual' };
                              setMassEditItems(next);
                            }}
                            className="text-primary focus:ring-primary w-3 h-3 cursor-pointer"
                          />
                          Manual Pricing
                        </label>
                      </div>
                    </div>

                    {/* Margin Setup & Quick Profit */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center pt-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-display font-semibold mr-1">Markup:</span>
                        {[10, 15, 20, 25, 30].map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => applyProfit(m)}
                            className="px-2 py-0.5 rounded bg-surface-3 hover:bg-surface-4 border border-border/70 text-[9px] font-display font-bold transition cursor-pointer text-foreground"
                          >
                            {m}%
                          </button>
                        ))}
                      </div>

                      {/* Live Calculation Preview */}
                      <div className="bg-surface-3/50 px-2.5 py-1.5 rounded-lg border border-border/60 text-[10px] flex items-center justify-between leading-snug">
                        <div>
                          <span className="text-muted-foreground">Expected Profit: </span>
                          <strong className="text-success">₦{profitAmount.toLocaleString()}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Margin: </span>
                          <strong className={marginPercent >= 15 ? 'text-success' : marginPercent > 0 ? 'text-yellow-500' : 'text-destructive'}>
                            {marginPercent.toFixed(1)}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Category Dropdown */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                        <select
                          value={it.category}
                          onChange={e => {
                            const next = [...massEditItems];
                            next[i] = { ...it, category: e.target.value };
                            setMassEditItems(next);
                          }}
                          className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        >
                          {['Groceries', 'Beverages', 'Detergents', 'Soap', 'Bread', 'Milk', 'Noodles', 'Biscuit', 'Beer', 'Wine', 'Others'].map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setMassEditItems(null)}
                className="p-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:bg-surface-3 transition cursor-pointer text-center text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMassEdit}
                className="p-3 rounded-xl bg-success text-white text-xs font-display font-bold hover:opacity-95 shadow-md cursor-pointer text-center"
              >
                ✓ Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}


      {/* Shopping List Modal */}
      {showShoppingList && (
        <SmartRestockEngine
          store={store}
          onUpdate={onUpdate}
          onClose={() => setShowShoppingList(false)}
        />
      )}

      {showAuditHistory && (
        <Modal title="Stock Count Audits" onClose={() => setShowAuditHistory(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-left">
              Recent discrepancy adjustments logged from shelf counts.
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(store.stockCountAudits || []).map(audit => (
                <div key={audit.id} className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs flex justify-between items-center">
                  <div className="text-left">
                    <p className="font-semibold text-foreground">{audit.product}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(audit.date).toLocaleString('en-GB')}</p>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-muted-foreground">Exp: {audit.expected} | Act: {audit.actual}</p>
                    <p className={`font-bold ${audit.variance === 0 ? 'text-success' : audit.variance > 0 ? 'text-blue-400' : 'text-destructive'}`}>
                      Var: {audit.variance > 0 ? '+' : ''}{audit.variance}
                    </p>
                  </div>
                </div>
              ))}
              {(!store.stockCountAudits || store.stockCountAudits.length === 0) && (
                <p className="text-center text-muted-foreground py-6 text-xs">No audits logged yet.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {selectedBarcodeProduct && (
        <Modal title="Barcode Label Generator" onClose={() => setSelectedBarcodeProduct(null)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-left">
              Visual representation of the product's barcode for label scanning.
            </p>
            
            {selectedBarcodeProduct.barcode ? (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-lg border border-border" id={`barcode-container-${selectedBarcodeProduct.id}`}>
                  {(() => {
                    const value = selectedBarcodeProduct.barcode || '';
                    const cleanValue = value.toUpperCase().replace(/[^0-9A-Z\-.\s$/+%*]/g, '');
                    const fullText = `*${cleanValue}*`;
                    const narrowWidth = 1.5;
                    const wideWidth = narrowWidth * 3;
                    const interSpace = narrowWidth;
                    const height = 60;
                    
                    let currentX = 0;
                    const bars: JSX.Element[] = [];
                    
                    for (let i = 0; i < fullText.length; i++) {
                      const char = fullText[i];
                      const pattern = CODE39_MAP[char];
                      if (!pattern) continue;
                      
                      for (let j = 0; j < 9; j++) {
                        const isBar = j % 2 === 0;
                        const isWide = pattern[j] === '1';
                        const width = isWide ? wideWidth : narrowWidth;
                        
                        if (isBar) {
                          bars.push(
                            <rect
                              key={`${i}-${j}`}
                              x={currentX}
                              y={0}
                              width={width}
                              height={height}
                              fill="black"
                            />
                          );
                        }
                        currentX += width;
                      }
                      currentX += interSpace;
                    }
                    
                    return (
                      <div className="flex flex-col items-center">
                        <svg
                          id={`barcode-svg-${selectedBarcodeProduct.id}`}
                          width={Math.max(200, currentX)}
                          height={height}
                          viewBox={`0 0 ${currentX} ${height}`}
                        >
                          {bars}
                        </svg>
                        <span className="mt-2 text-xs font-mono font-bold text-black tracking-widest">{value}</span>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePrintBarcode(selectedBarcodeProduct)}
                    className="p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
                  >
                    🖨️ Print Label
                  </button>
                  <button
                    onClick={() => {
                      handleAutoGenerateBarcode(selectedBarcodeProduct);
                    }}
                    className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-surface-2 border border-border text-center text-xs text-muted-foreground">
                  No barcode code linked to this product yet.
                </div>
                <button
                  onClick={() => handleAutoGenerateBarcode(selectedBarcodeProduct)}
                  className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
                >
                  ✨ Auto-Generate Barcode SKU
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {selectedTransferProduct && (
        <Modal title={`Transfer: ${selectedTransferProduct.name}`} onClose={() => setSelectedTransferProduct(null)}>
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground">
              Move stock directly to another store. This adjusts quantities in both stores immediately.
            </p>
            
            <div className="p-3 rounded-lg bg-surface-2 border border-border flex justify-between items-center text-xs">
              <span>Current Stock:</span>
              <span className="font-bold text-primary">{selectedTransferProduct.quantity} units</span>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase">Destination Store</label>
              {(() => {
                const sisterStores = getStoreIndex().filter(s => s.code !== store.accessCode);
                return (
                  <div className="space-y-2">
                    {sisterStores.length > 0 ? (
                      <select
                        value={transferDestCode}
                        onChange={e => setTransferDestCode(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select sister store...</option>
                        {sisterStores.map(s => (
                          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                        <option value="MANUAL">Enter Code Manually...</option>
                      </select>
                    ) : null}
                    
                    {(sisterStores.length === 0 || transferDestCode === 'MANUAL') && (
                      <input
                        value={transferDestCode === 'MANUAL' ? '' : transferDestCode}
                        onChange={e => setTransferDestCode(e.target.value)}
                        placeholder="Enter destination store access code (e.g. ABCXYZ)"
                        className={inputClass}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase">Transfer Quantity</label>
              <input
                type="number"
                min="1"
                max={selectedTransferProduct.quantity}
                value={transferQty}
                onChange={e => setTransferQty(e.target.value)}
                placeholder={`Max: ${selectedTransferProduct.quantity}`}
                className={inputClass}
              />
            </div>
            
            <button
              onClick={() => {
                const qty = Number(transferQty);
                if (!transferDestCode || qty <= 0 || qty > selectedTransferProduct.quantity) {
                  return showToast('Invalid destination store or transfer quantity', 'error');
                }
                let destCode = transferDestCode.trim().toUpperCase();
                if (destCode === 'MANUAL') {
                  return showToast('Please enter store code', 'error');
                }
                if (destCode === store.accessCode) {
                  return showToast('Cannot transfer to current store', 'error');
                }
                
                const targetStore = loadStore(destCode);
                if (!targetStore) {
                  return showToast(`Store code "${destCode}" not found in system`, 'error');
                }
                
                const updated = transferStock(store, selectedTransferProduct.id, qty, destCode);
                onUpdate(updated);
                setSelectedTransferProduct(null);
                setTransferQty('');
                setTransferDestCode('');
                showToast(`✓ Transferred ${qty} unit(s) of ${selectedTransferProduct.name} to store ${destCode}`);
              }}
              className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 text-sm"
            >
              🚚 Complete Transfer
            </button>
          </div>
        </Modal>
      )}

      {selectedDetailProduct && (
        <Modal title={`Product Details: ${selectedDetailProduct.name}`} onClose={() => setSelectedDetailProduct(null)}>
          <div className="space-y-4 text-left">
            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 bg-surface-2 p-3 rounded-xl border border-border text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Category</p>
                <p className="font-bold text-foreground mt-0.5">{selectedDetailProduct.category}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Barcode / SKU</p>
                <p className="font-mono font-bold text-success mt-0.5">{selectedDetailProduct.barcode || 'Not Linked'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Current Stock</p>
                <p className={`font-black mt-0.5 ${selectedDetailProduct.quantity <= lowThreshold ? 'text-destructive' : selectedDetailProduct.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                  {selectedDetailProduct.quantity} units
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Profit Margin</p>
                {(() => {
                  const margin = selectedDetailProduct.sellingPrice - selectedDetailProduct.costPrice;
                  const pct = selectedDetailProduct.costPrice > 0 ? (margin / selectedDetailProduct.costPrice) * 100 : 0;
                  const cls = margin > 0 ? 'text-success' : margin < 0 ? 'text-destructive' : 'text-muted-foreground';
                  return <p className={`font-bold mt-0.5 ${cls}`}>₦{margin.toLocaleString()} (+{pct.toFixed(0)}%)</p>;
                })()}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cost Price</p>
                <p className="font-bold text-muted-foreground mt-0.5">₦{selectedDetailProduct.costPrice.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Selling Price</p>
                <p className="font-bold text-primary mt-0.5">₦{selectedDetailProduct.sellingPrice.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Status</p>
                <p className={`font-bold mt-0.5 ${selectedDetailProduct.discontinued ? 'text-destructive' : 'text-success'}`}>
                  {selectedDetailProduct.discontinued ? '🚫 Discontinued' : '✅ Active'}
                </p>
              </div>
            </div>

            {/* Price History Section */}
            {(() => {
              const priceHistory = selectedDetailProduct.priceHistory || [];
              return (
                <div className="space-y-2 mt-3 pt-3 border-t border-border">
                  <h4 className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                    📈 Cost Price History Chart
                  </h4>
                  {priceHistory.length >= 2 ? (
                    <div className="h-32 w-full bg-surface-2 p-1 rounded-lg border border-border">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(str) => {
                              try {
                                return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              } catch {
                                return '';
                              }
                            }}
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                          />
                          <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '6px', padding: '6px' }}
                            labelStyle={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}
                            itemStyle={{ color: '#f8fafc', fontSize: 9 }}
                            labelFormatter={(lbl) => {
                              try {
                                return new Date(lbl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                              } catch {
                                return String(lbl);
                              }
                            }}
                          />
                          <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={1.5} dot={{ fill: '#d97706', r: 2 }} name="Cost" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic text-center py-1">
                      At least two cost changes are required to render the history trend line.
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Change Log Timeline</p>
                  {priceHistory.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1 text-[9px] no-scrollbar">
                      {priceHistory.slice().reverse().map((h, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-surface-2 p-1 rounded border border-border">
                          <span className="text-muted-foreground">
                            {new Date(h.date).toLocaleDateString('en-GB')} {new Date(h.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-bold text-foreground">₦{h.costPrice.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-surface-2 border border-border text-center text-[10px] text-muted-foreground">
                      Initial Cost Price: ₦{selectedDetailProduct.costPrice.toLocaleString()} (added at creation)
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Actions buttons inside popup */}
            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setRestockProduct(selectedDetailProduct);
                  setRestockQty('');
                  setSingleRestockFunding('balance');
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-success text-white font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer"
              >
                ↑ Restock
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTransferProduct(selectedDetailProduct);
                  setTransferQty('');
                  setTransferDestCode('');
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-warning text-slate-950 font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer"
              >
                🚚 Transfer
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = selectedDetailProduct;
                  setEditProduct({ ...p });
                  setEditDraft({ name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), quantity: String(p.quantity), category: p.category });
                  setEditCustomCategoryActive(p.category !== 'Groceries' && p.category !== 'Beverages' && p.category !== 'Detergents' && p.category !== 'Soap' && p.category !== 'Others' && !['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(p.category));
                  setEditCustomCategoryVal(p.category);
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer"
              >
                ✎ Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  const isDiscontinued = !!selectedDetailProduct.discontinued;
                  const updated = updateProduct(store, selectedDetailProduct.id, { discontinued: !isDiscontinued });
                  onUpdate(updated);
                  setSelectedDetailProduct({ ...selectedDetailProduct, discontinued: !isDiscontinued });
                  showToast(isDiscontinued ? 'Product reactivated' : 'Product discontinued');
                }}
                className={`p-2 rounded-lg font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer ${
                  selectedDetailProduct.discontinued 
                    ? 'bg-success/20 text-success border border-success/30' 
                    : 'bg-destructive/20 text-destructive border border-destructive/30'
                }`}
              >
                {selectedDetailProduct.discontinued ? '🟢 Reactivate' : '🔴 Discontinue'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title={`Delete "${confirmDelete.name}"?`}
          message="Are you sure you want to delete this product? If you delete this product, it will permanently wipe all financial data relating to it (sales, revenue, profit, ROI) so that it is no longer calculated in the app's overall finances. Enter your store access code to confirm."
          confirmLabel="Delete Product"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {scanForProduct && (
        <BarcodeScanner
          title={`Scan barcode for: ${scanForProduct.name}`}
          subtitle="Hold the product's barcode steady inside the frame"
          onClose={() => setScanForProduct(null)}
          onDetected={(code) => {
            const existing = store.products.find(p => p.barcode === code && p.id !== scanForProduct.id);
            if (existing) {
              showToast(`Already linked to ${existing.name}`, 'error');
              setScanForProduct(null);
              return;
            }
            const updated = updateProduct(store, scanForProduct.id, { barcode: code });
            onUpdate(updated);
            showToast(`✓ Saved barcode for ${scanForProduct.name}`);
            setScanForProduct(null);
          }}
        />
      )}

      {showMassDeleteModal && (
        <Modal
          title={massDeleteStep === 1 ? "Security Quiz" : "Delete All Items?"}
          onClose={() => setShowMassDeleteModal(false)}
        >
          {massDeleteStep === 1 ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Answer these security questions correctly to unlock mass deletion:
              </p>

              <div className="space-y-3">
                {/* Question 1 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">1. How many colors does the Nigerian flag have?</p>
                  <div className="flex gap-4">
                    {['3', '2', '4'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q1"
                          value={opt}
                          checked={quizAnswers.q1 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q1: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Question 2 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">2. What color is the sky on a clear day?</p>
                  <div className="flex gap-4">
                    {['Blue', 'Red', 'Green'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q2"
                          value={opt}
                          checked={quizAnswers.q2 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q2: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Question 3 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">3. Which of the following is a primary color?</p>
                  <div className="flex gap-4">
                    {['Red', 'Purple', 'Orange'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q3"
                          value={opt}
                          checked={quizAnswers.q3 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q3: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {quizError && (
                <p className="text-xs text-destructive font-semibold">{quizError}</p>
              )}

              <button
                onClick={() => {
                  if (quizAnswers.q1 === '2' && quizAnswers.q2 === 'Blue' && quizAnswers.q3 === 'Red') {
                    setMassDeleteStep(2);
                    setQuizError('');
                  } else {
                    setQuizError('❌ Incorrect answers. Please try again.');
                  }
                }}
                className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90"
              >
                Next →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed">
                ⚠️ **WARNING:** This will delete **ALL {store.products.length} products** from your inventory. This action cannot be easily undone, though items are archived in the trash history.
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Are you sure you want to delete your inventory?</p>
                <p className="text-xs text-muted-foreground">Type <span className="font-bold text-foreground">YES</span> below to confirm:</p>
                <input
                  type="text"
                  placeholder="Type YES here"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMassDeleteStep(1)}
                  className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    if (confirmText === 'YES') {
                      onUpdate(clearInventory(store));
                      setShowMassDeleteModal(false);
                      showToast('All inventory products deleted');
                    } else {
                      showToast('Type YES to confirm', 'error');
                    }
                  }}
                  disabled={confirmText !== 'YES'}
                  className={`p-2.5 rounded-lg font-display font-semibold text-sm text-white ${
                    confirmText === 'YES' ? 'bg-destructive hover:bg-destructive/95' : 'bg-destructive/40 cursor-not-allowed'
                  }`}
                >
                  Delete Everything
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {highConfidencePair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl animate-scale-in space-y-4 text-left">
            <div className="text-center space-y-2">
              <div className="text-3xl">🔀</div>
              <h3 className="font-display font-bold text-lg text-white">Possible Duplicate Found</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                These products look very similar. What would you like to do?
              </p>
            </div>

            <div className="bg-surface-2/40 border border-border/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Existing Product:</span>
                <span className="font-bold text-white text-right max-w-[150px] truncate">{highConfidencePair.p1.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">New Product:</span>
                <span className="font-bold text-white text-right max-w-[150px] truncate">{highConfidencePair.p2.name}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-2 font-mono">
                <span className="text-muted-foreground font-semibold">Similarity:</span>
                <span className="font-extrabold text-primary">{highConfidencePair.score}%</span>
              </div>
            </div>

            {isRenaming ? (
              <div className="space-y-2 pt-1.5 animate-fade-in">
                <input
                  type="text"
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-surface-2 border border-border text-xs text-white placeholder:text-muted-foreground"
                  placeholder="Enter new product name..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsRenaming(false);
                      setRenameVal('');
                    }}
                    className="flex-1 py-2 rounded-lg bg-surface-3 border border-border text-[11px] font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!renameVal.trim()) return showToast('Please enter a valid name', 'error');
                      handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'rename', renameVal.trim());
                      setIsRenaming(false);
                      setRenameVal('');
                    }}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold"
                  >
                    Confirm Rename
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'merge')}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  🔀 Merge Products
                </button>
                <button
                  onClick={() => {
                    setIsRenaming(true);
                    setRenameVal(highConfidencePair.p2.name);
                  }}
                  className="w-full py-2.5 bg-surface-3 border border-border text-foreground font-display font-semibold text-xs rounded-xl hover:bg-surface-2 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  ✏️ Rename New Product
                </button>
                <button
                  onClick={() => handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'separate')}
                  className="w-full py-2.5 bg-surface-2 border border-border text-muted-foreground font-display font-semibold text-xs rounded-xl hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  📦 Keep Separate
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showMediumReviews && (
        <Modal
          title="Review Similar Products"
          onClose={() => {
            setShowMediumReviews(false);
            setRenameTarget(null);
            setRenameVal('');
          }}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 no-scrollbar text-xs text-left">
            <p className="text-muted-foreground leading-snug">
              StoreFlow flagged the following products as possible duplicates based on similarities in name, units, costs, and selling prices. Review them to keep inventory data clean.
            </p>

            <div className="space-y-3.5">
              {mediumConfidencePairs.map(({ p1, p2, score }) => {
                const key = `${p1.id}-${p2.id}`;
                const isItemRenaming = renameTarget?.id === p2.id;

                return (
                  <div key={key} className="p-3 bg-surface-2/30 border border-border/60 rounded-xl space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-muted-foreground">Possible Match ({score}%)</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-bold uppercase">Medium Confidence</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Product 1:</span>
                        <span className="font-bold text-white truncate max-w-[180px]">{p1.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Product 2:</span>
                        <span className="font-bold text-white truncate max-w-[180px]">{p2.name}</span>
                      </div>
                    </div>

                    {isItemRenaming ? (
                      <div className="space-y-2 pt-1 border-t border-border/40">
                        <input
                          type="text"
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          className="w-full p-2 rounded bg-surface-2 border border-border text-xs text-white"
                          placeholder="Enter new product name..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setRenameTarget(null);
                              setRenameVal('');
                            }}
                            className="flex-1 py-1.5 rounded bg-surface-3 border border-border text-[10px] font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (!renameVal.trim()) return showToast('Please enter a valid name', 'error');
                              handleResolveSimilarPair(p1, p2, 'rename', renameVal.trim());
                              setRenameTarget(null);
                              setRenameVal('');
                            }}
                            className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-[10px] font-bold"
                          >
                            Save Name
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 pt-1 border-t border-border/40">
                        <button
                          onClick={() => handleResolveSimilarPair(p1, p2, 'merge')}
                          className="flex-1 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] rounded-lg transition cursor-pointer"
                        >
                          🔀 Merge
                        </button>
                        <button
                          onClick={() => {
                            setRenameTarget(p2);
                            setRenameVal(p2.name);
                          }}
                          className="flex-1 py-2 bg-surface-3 hover:bg-surface-2 text-foreground font-semibold text-[10px] rounded-lg transition border border-border cursor-pointer"
                        >
                          ✏️ Rename
                        </button>
                        <button
                          onClick={() => handleResolveSimilarPair(p1, p2, 'separate')}
                          className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 text-muted-foreground font-semibold text-[10px] rounded-lg transition border border-border cursor-pointer"
                        >
                          📦 Keep Sep.
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {mediumConfidencePairs.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  ✨ No pending medium confidence matches to review!
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-card z-10 pb-2 border-b border-border/40">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
