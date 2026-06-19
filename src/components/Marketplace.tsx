import { useState, useEffect, useMemo } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface MarketplaceProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

interface Supplier {
  id: string;
  name: string;
  distance: string;
  rating: number;
  productsCount: number;
  verified: boolean;
  phone: string;
  whatsapp: string;
  products: { name: string; price: number; category: string }[];
}

interface TrendingItem {
  id: string;
  name: string;
  demand: number;
  profit: number;
  storesBuying: number;
  averageCost: number;
  averageSelling: number;
  category: string;
}

interface RecommendedItem {
  name: string;
  marketPrice: number;
  expectedProfit: number;
  suppliersCount: number;
  category: string;
  averageCost: number;
}

interface DealItem {
  name: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  supplier: string;
}

interface ExcessListing {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  storeName: string;
  whatsapp: string;
}

// ─── Static Mock Data ──────────────────────────────────────────────────────────
const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-abc',
    name: 'ABC Food Wholesale',
    distance: '2.4km',
    rating: 4.8,
    productsCount: 53,
    verified: true,
    phone: '07025517388',
    whatsapp: 'https://wa.me/2347025517388?text=Hello%20ABC%20Food%20Wholesale,%20I%20want%20to%20place%20an%20order%20for%20some%20supplies%20seen%20on%20StoreFlow.',
    products: [
      { name: 'Rice (50kg)', price: 96000, category: 'Groceries' },
      { name: 'Beans (50kg)', price: 72000, category: 'Groceries' },
      { name: 'Garri White (50kg)', price: 38000, category: 'Groceries' },
      { name: 'Peak Milk Roll (Case)', price: 29000, category: 'Beverages' },
      { name: 'Milo Sachet Pack (Case)', price: 24000, category: 'Beverages' },
      { name: 'Semovita (10kg)', price: 15500, category: 'Groceries' },
    ],
  },
  {
    id: 'sup-tommy',
    name: 'Tommy Wholesale',
    distance: '3.1km',
    rating: 4.4,
    productsCount: 48,
    verified: true,
    phone: '07025517388',
    whatsapp: 'https://wa.me/2347025517388?text=Hello%20Tommy%20Wholesale,%20I%20want%20to%20place%20an%20order%20for%20some%20supplies%20seen%20on%20StoreFlow.',
    products: [
      { name: 'Rice (50kg)', price: 92000, category: 'Groceries' },
      { name: 'Beans (50kg)', price: 70000, category: 'Groceries' },
      { name: 'Garri White (50kg)', price: 39000, category: 'Groceries' },
      { name: 'Peak Milk Roll (Case)', price: 30000, category: 'Beverages' },
      { name: 'Vegetable Oil (25L)', price: 42000, category: 'Groceries' },
    ],
  },
  {
    id: 'sup-innie',
    name: 'Innie Provisions & Co',
    distance: '1.2km',
    rating: 4.9,
    productsCount: 120,
    verified: true,
    phone: '07025517388',
    whatsapp: 'https://wa.me/2347025517388?text=Hello%20Innie%20Provisions,%20I%20want%20to%20place%20an%20order%20for%20some%20supplies%20seen%20on%20StoreFlow.',
    products: [
      { name: 'Rice (50kg)', price: 99000, category: 'Groceries' },
      { name: 'Beans (50kg)', price: 69000, category: 'Groceries' },
      { name: 'Garri White (50kg)', price: 37000, category: 'Groceries' },
      { name: 'Peak Milk Roll (Case)', price: 28000, category: 'Beverages' },
      { name: 'Indomie Crate (Case)', price: 18000, category: 'Groceries' },
    ],
  },
];

const MOCK_TRENDING: TrendingItem[] = [
  { id: 'tr-garri', name: 'Garri (White) Bucket', demand: 94, profit: 450, storesBuying: 127, averageCost: 2050, averageSelling: 2500, category: 'Groceries' },
  { id: 'tr-rice', name: 'Rice (Foreign) Bucket', demand: 89, profit: 1000, storesBuying: 94, averageCost: 7000, averageSelling: 8000, category: 'Groceries' },
  { id: 'tr-beans', name: 'Beans (White) Bucket', demand: 82, profit: 900, storesBuying: 78, averageCost: 6100, averageSelling: 7000, category: 'Groceries' },
  { id: 'tr-milk', name: 'Peak Milk Roll', demand: 78, profit: 400, storesBuying: 150, averageCost: 2100, averageSelling: 2500, category: 'Beverages' },
];

const MOCK_RECOMMENDED: RecommendedItem[] = [
  { name: 'Garri Bucket', marketPrice: 2500, expectedProfit: 450, suppliersCount: 3, category: 'Groceries', averageCost: 2050 },
  { name: 'Rice Bucket', marketPrice: 8000, expectedProfit: 1000, suppliersCount: 3, category: 'Groceries', averageCost: 7000 },
  { name: 'Beans Bucket', marketPrice: 7000, expectedProfit: 900, suppliersCount: 3, category: 'Groceries', averageCost: 6100 },
  { name: 'Peak Milk Roll', marketPrice: 2500, expectedProfit: 400, suppliersCount: 3, category: 'Beverages', averageCost: 2100 },
  { name: 'Bread Loaf', marketPrice: 1200, expectedProfit: 300, suppliersCount: 2, category: 'Groceries', averageCost: 900 },
];

const MOCK_DEALS: DealItem[] = [
  { name: 'Rice (50kg)', originalPrice: 98000, discountedPrice: 92000, discountPercent: 6, supplier: 'Tommy Wholesale' },
  { name: 'Beans (50kg)', originalPrice: 75000, discountedPrice: 69000, discountPercent: 8, supplier: 'Innie Provisions & Co' },
  { name: 'Semovita (10kg)', originalPrice: 18000, discountedPrice: 15000, discountPercent: 16, supplier: 'ABC Food Wholesale' },
  { name: 'Vegetable Oil (25L)', originalPrice: 48000, discountedPrice: 42000, discountPercent: 12, supplier: 'Tommy Wholesale' },
  { name: 'Peak Milk Roll (Case)', originalPrice: 30000, discountedPrice: 28000, discountPercent: 6, supplier: 'Innie Provisions & Co' },
];

const MOCK_EXCESS: ExcessListing[] = [
  { id: 'ex-1', productName: 'Bread (Sweet loaf)', quantity: 20, price: 900, storeName: 'Alaba Grocery Store', whatsapp: 'https://wa.me/2347025517388?text=Hello%20Alaba%20Store,%20I\'m%20interested%20in%20your%20excess%20inventory%20listing.' },
  { id: 'ex-2', productName: 'Spaghetti Case', quantity: 1, price: 8500, storeName: 'Lekki Minimart', whatsapp: 'https://wa.me/2347025517388?text=Hello%20Lekki%20Minimart,%20I\'m%20interested%20in%20your%20excess%20inventory%20listing.' },
];

const CUSTOMER_REQUESTS = [
  { name: 'Garri', count: 43 },
  { name: 'Beans', count: 35 },
  { name: 'Rice', count: 29 },
  { name: 'Peak Milk', count: 22 },
  { name: 'Bread', count: 18 },
];

const REDEEMABLES = [
  { id: 'red-premium', name: 'Premium Access (1 Month)', cost: 500, description: 'Unlock advanced multi-store and automated forecasting.' },
  { id: 'red-merch', name: 'StoreFlow Branded Apron', cost: 1000, description: 'High-quality protective gear for shopkeepers.' },
  { id: 'red-ads', name: '₦5,000 Ad Credits', cost: 300, description: 'Boost your visibility on local customer directories.' },
  { id: 'red-boost', name: 'Marketplace Boost Card', cost: 200, description: 'Pin your excess inventory at the top of local listings for 3 days.' },
];

// Price comparison options
const COMPARISON_PRODUCTS = ['Rice (50kg)', 'Beans (50kg)', 'Garri White (50kg)', 'Peak Milk Roll (Case)'];

export default function Marketplace({ store, onUpdate }: MarketplaceProps) {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return localStorage.getItem('storeflow_marketplace_unlocked') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'suppliers' | 'trending' | 'deals'>('all');
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<{
    name: string;
    costPrice: number;
    sellingPrice: number;
    category: string;
  } | null>(null);

  // Coins rewards
  const coinsBalance = store.coins ?? 350;
  const [showRewardsModal, setShowRewardsModal] = useState(false);

  // Supplier catalog details modal
  const [activeSupplierCatalog, setActiveSupplierCatalog] = useState<Supplier | null>(null);

  // Price comparison selector
  const [comparisonProduct, setComparisonProduct] = useState('Rice (50kg)');

  // Excess Inventory forms
  const [excessProduct, setExcessProduct] = useState('');
  const [excessQty, setExcessQty] = useState('');
  const [excessPrice, setExcessPrice] = useState('');
  const [excessVisibility, setExcessVisibility] = useState(true);

  // Supplier Connect forms
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supLocation, setSupLocation] = useState('');
  const [supOpening, setSupOpening] = useState('08:00');
  const [supClosing, setSupClosing] = useState('18:00');
  const [supDelivery, setSupDelivery] = useState(true);
  const [supSubmitted, setSupSubmitted] = useState(false);

  // Timer simulation
  const [timeLeft, setTimeLeft] = useState({ hours: 14, minutes: 22, seconds: 59 });
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 23, minutes: 59, seconds: 59 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Flow AI Assistant prompts
  const [aiAssistantQuery, setAiAssistantQuery] = useState('');
  const [aiAssistantAnswer, setAiAssistantAnswer] = useState('');
  const [aiAssistantLoading, setAiAssistantLoading] = useState(false);

  // ─── Excess Inventory Listings ─────────────────────────────────────────────
  const localExcessListings = useMemo(() => {
    return [...MOCK_EXCESS, ...(store.marketplaceListings || [])];
  }, [store.marketplaceListings]);

  // ─── Registered Suppliers ──────────────────────────────────────────────────
  const allSuppliers = useMemo(() => {
    return [...MOCK_SUPPLIERS, ...(store.registeredSuppliers || [])];
  }, [store.registeredSuppliers]);

  // ─── Live Stock Tracking for High Demand Opportunity ───────────────────────
  const garriStock = useMemo(() => {
    const item = store.products.find(p => p.name.toLowerCase().includes('garri'));
    return item ? item.quantity : 0;
  }, [store.products]);

  // ─── Search Filtering ──────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;

    const matchedProducts = MOCK_RECOMMENDED.filter(p =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
    const matchedSuppliers = allSuppliers.filter(s =>
      s.name.toLowerCase().includes(q) || s.products.some(p => p.name.toLowerCase().includes(q))
    );

    return { products: matchedProducts, suppliers: matchedSuppliers };
  }, [search, allSuppliers]);

  // ─── Handle actions ────────────────────────────────────────────────────────
  const claimDailyLogin = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (store.lastDailyClaim === todayStr) {
      showToast('You have already claimed today\'s login reward!', 'error');
      return;
    }

    const updated = {
      ...store,
      coins: coinsBalance + 50,
      lastDailyClaim: todayStr,
    };
    onUpdate(updated);
    saveStore(updated);
    showToast('🪙 Claimed Daily login reward! +50 StoreFlow Coins.', 'success');
  };

  const handleRedeem = (item: typeof REDEEMABLES[0]) => {
    if (coinsBalance < item.cost) {
      showToast('Insufficient coins balance!', 'error');
      return;
    }
    const updated = {
      ...store,
      coins: coinsBalance - item.cost,
    };
    onUpdate(updated);
    saveStore(updated);
    showToast(`🎉 Redeemed: ${item.name}! Check your email/notifications for instructions.`, 'success');
  };

  const openAddInventoryModal = (name: string, costPrice: number, category: string) => {
    setSelectedProductToAdd({
      name,
      costPrice,
      sellingPrice: Math.round(costPrice * 1.3 / 50) * 50, // 30% margin rounded
      category,
    });
  };

  const handleSaveProductToInventory = (qty: number, cost: number, sell: number) => {
    if (!selectedProductToAdd) return;
    const updated = addProduct(store, {
      name: selectedProductToAdd.name,
      costPrice: cost,
      sellingPrice: sell,
      quantity: qty,
      category: selectedProductToAdd.category,
    });
    onUpdate(updated);
    saveStore(updated);
    setSelectedProductToAdd(null);
    showToast(`✓ Added ${selectedProductToAdd.name} (${qty} units) to your active inventory.`);
  };

  const handlePostExcessListing = () => {
    if (!excessProduct.trim() || !excessQty || !excessPrice) {
      showToast('Please fill all excess inventory fields', 'error');
      return;
    }
    const newListing = {
      id: `ex-user-${Date.now()}`,
      productName: excessProduct.trim(),
      quantity: Number(excessQty),
      price: Number(excessPrice),
      storeName: store.storeName,
      whatsapp: `https://wa.me/2347025517388?text=Hello,%20I'm%20interested%20in%20your%20excess%20listing%20for%20${excessProduct}.`,
    };

    const updated = {
      ...store,
      marketplaceListings: [...(store.marketplaceListings || []), newListing],
      coins: coinsBalance + 25, // Earn 25 coins for keeping inventory/listings updated
    };
    onUpdate(updated);
    saveStore(updated);

    setExcessProduct('');
    setExcessQty('');
    setExcessPrice('');
    showToast('🚀 Listing posted! You earned 🪙 25 coins for liquidating excess stock.');
  };

  const handleRegisterSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName || !supPhone || !supLocation) {
      showToast('Please fill out all required fields', 'error');
      return;
    }
    const newSupplier: Supplier = {
      id: `sup-user-${Date.now()}`,
      name: supName,
      distance: '0.1km',
      rating: 5.0,
      productsCount: 0,
      verified: false,
      phone: supPhone,
      whatsapp: `https://wa.me/${supPhone.replace(/^0/, '234')}?text=Hello%20${supName},%20I%20found%20your%20profile%20on%20StoreFlow.`,
      products: [],
    };

    const updated = {
      ...store,
      registeredSuppliers: [...(store.registeredSuppliers || []), newSupplier],
      coins: coinsBalance + 100, // Earn 100 coins for adding a supplier
    };
    onUpdate(updated);
    saveStore(updated);

    setSupSubmitted(true);
    showToast('📋 Supplier registration submitted! Earned 🪙 100 coins.');
  };

  const handleAskFlow = (query: string) => {
    setAiAssistantQuery(query);
    setAiAssistantLoading(true);
    setAiAssistantAnswer('');

    setTimeout(() => {
      setAiAssistantLoading(false);
      const q = query.toLowerCase();
      if (q.includes('semovita')) {
        setAiAssistantAnswer('Flow Intelligence says: ABC Food Wholesale is currently the cheapest nearby supplier for Semovita (10kg) at ₦15,500 crate. Buying from them saves you ₦1,200 compared to external wholesale averages.');
      } else if (q.includes('trending')) {
        setAiAssistantAnswer('Flow Intelligence says: Garri (White) Bucket is currently trending at a massive 94% local demand rate. Average store profit is ₦450 per bucket with 127 local retailers buying. Stock up before supply costs rise!');
      } else if (q.includes('minerals') || q.includes('restock')) {
        setAiAssistantAnswer('Flow Intelligence says: You sold 27 Minerals this week. Mineral crate prices are expected to jump 8% due to supplier diesel fuel surcharge. Innie Provisions currently offers crates at ₦28,000. Restock this week to safeguard margins.');
      } else {
        setAiAssistantAnswer('Flow Intelligence says: Comparing prices across 3 nearby suppliers. We recommend prioritizing ABC Food Wholesale for grains, and Innie Provisions for sachet beverage packs to maximize margins.');
      }
    }, 800);
  };

  // Price Comparison Grid Calculation
  const currentComparison = useMemo(() => {
    const prodName = comparisonProduct;
    let sA = 0, sB = 0, sC = 0;
    if (prodName.includes('Rice')) {
      sA = 96000; sB = 92000; sC = 99000;
    } else if (prodName.includes('Beans')) {
      sA = 72000; sB = 70000; sC = 69000;
    } else if (prodName.includes('Garri')) {
      sA = 38000; sB = 39000; sC = 37000;
    } else if (prodName.includes('Milk')) {
      sA = 29000; sB = 30000; sC = 28000;
    }

    const prices = [
      { name: 'Supplier A (ABC Food)', price: sA },
      { name: 'Supplier B (Tommy)', price: sB },
      { name: 'Supplier C (Innie Provisions)', price: sC },
    ];
    const cheapest = [...prices].sort((a, b) => a.price - b.price)[0];
    const highest = [...prices].sort((a, b) => b.price - a.price)[0];
    const savings = highest.price - cheapest.price;

    return { prices, cheapest, savings };
  }, [comparisonProduct]);

  if (!isUnlocked) {
    return (
      <div className="text-white space-y-6 pb-20 animate-fade-in bg-[#0B0B12] rounded-3xl p-6 border border-[#E8C34E]/10 max-w-md mx-auto flex flex-col justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-[#E8C34E]/10 border border-[#E8C34E]/25 flex items-center justify-center text-4xl mx-auto shadow-[0_0_15px_rgba(232,195,78,0.1)]">
            🔒
          </div>
          <h2 className="font-display font-black text-xl text-white">
            Marketplace <span className="text-[#E8C34E]">Private Preview</span>
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The StoreFlow B2B Marketplace is currently locked in private beta mode. Please enter the bypass password to access it.
          </p>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (passwordInput.toLowerCase() === 'fantazia') {
              setIsUnlocked(true);
              localStorage.setItem('storeflow_marketplace_unlocked', 'true');
              showToast('Marketplace Unlocked!', 'success');
            } else {
              setPasswordError('Incorrect bypass password');
            }
          }}
          className="space-y-3 pt-2"
        >
          <input
            type="password"
            placeholder="Enter beta password..."
            value={passwordInput}
            onChange={e => {
              setPasswordInput(e.target.value);
              setPasswordError('');
            }}
            className="w-full p-3 rounded-xl bg-[#16181D] border border-border text-center text-sm focus:outline-none focus:border-[#E8C34E] text-white"
          />
          {passwordError && (
            <p className="text-xs text-destructive text-center font-semibold">{passwordError}</p>
          )}
          <button
            type="submit"
            className="w-full p-3.5 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-sm active:scale-[0.98] transition-transform hover:bg-[#E8C34E]/90"
          >
            Unlock Access
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="text-white space-y-6 pb-20 animate-fade-in bg-[#0B0B12] rounded-3xl p-4 md:p-6 border border-[#E8C34E]/10">
      
      {/* ─── HEADER & COIN SYSTEM ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-[#E8C34E]/10 to-transparent p-5 rounded-2xl border border-[#E8C34E]/20">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white flex items-center gap-2">
            🛒 StoreFlow <span className="text-[#E8C34E] text-glow">Marketplace</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Find products, suppliers and better prices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowRewardsModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-yellow-500/20 to-[#E8C34E]/20 border border-[#E8C34E] text-sm font-display font-black text-[#E8C34E] hover:scale-105 transition-transform shadow-[0_0_10px_rgba(232,195,78,0.15)]"
          >
            🪙 <span className="animate-pulse">{coinsBalance}</span> Coins
          </button>
          
          <button
            onClick={claimDailyLogin}
            className="px-3.5 py-1.5 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-xs hover:bg-[#E8C34E]/90 transition-colors shadow-lg"
          >
            Claim Daily
          </button>
        </div>
      </div>

      {/* ─── SEARCH BAR ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products, suppliers or brands..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#16181D] border border-border text-sm focus:outline-none focus:border-[#E8C34E] text-white placeholder:text-muted-foreground"
          />
          <span className="absolute left-3.5 top-3.5 text-muted-foreground">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-white"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={() => { setSearch(''); showToast('Filters reset'); }}
          className="w-11 h-11 bg-[#16181D] rounded-xl border border-border flex items-center justify-center text-lg active:scale-95 transition-transform"
          aria-label="Filter"
        >
          🎛️
        </button>
      </div>

      {/* ─── SEARCH RESULTS OVERLAY (IF SEARCHING) ─────────────────────────────── */}
      {search && searchResults && (
        <div className="bg-[#16181D]/80 border border-[#E8C34E]/20 rounded-2xl p-4 space-y-4">
          <h3 className="font-display font-bold text-sm text-[#E8C34E] flex items-center gap-1.5">
            🔍 Search Results for "{search}"
          </h3>
          
          {searchResults.products.length === 0 && searchResults.suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No products, suppliers or brands match your search query.</p>
          ) : (
            <div className="space-y-4">
              {searchResults.products.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground px-1 mb-2">Matching Products</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {searchResults.products.map(p => (
                      <div key={p.name} className="flex justify-between items-center bg-[#0B0B12]/80 border border-border p-3 rounded-xl">
                        <div>
                          <p className="font-semibold text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">Market Price: ₦{p.marketPrice.toLocaleString()}</p>
                        </div>
                        <button
                          onClick={() => openAddInventoryModal(p.name, p.averageCost, p.category)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#E8C34E] text-[#0B0B12] text-xs font-bold"
                        >
                          Add Product
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.suppliers.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground px-1 mb-2">Matching Suppliers</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {searchResults.suppliers.map(s => (
                      <div key={s.id} className="flex justify-between items-center bg-[#0B0B12]/80 border border-border p-3 rounded-xl">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm">{s.name}</span>
                            {s.verified && <span className="text-emerald-500 text-xs">✓</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{s.distance} away · ⭐ {s.rating}</p>
                        </div>
                        <button
                          onClick={() => setActiveSupplierCatalog(s)}
                          className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs font-semibold hover:border-[#E8C34E]"
                        >
                          View products
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── DEFAULT VIEW (IF NOT SEARCHING) ───────────────────────────────────── */}
      {!search && (
        <>
          {/* 1. FLOW RECOMMENDS CARD */}
          <div className="relative rounded-2xl bg-gradient-to-br from-[#E8C34E]/15 via-[#E8C34E]/5 to-transparent border border-[#E8C34E]/30 p-5 overflow-hidden shadow-[0_0_20px_rgba(232,195,78,0.06)]">
            <div className="absolute right-0 top-0 text-7xl translate-y-1 -translate-x-3 opacity-10">✨</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-md bg-[#E8C34E]/20 text-[#E8C34E] font-display text-[10px] font-black uppercase tracking-wider">
                Flow Recommends
              </span>
            </div>
            <h3 className="font-display font-black text-lg text-white mt-1 leading-snug">
              You sold 27 Minerals this week.
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">
              Nearby suppliers currently sell Mineral crates at lower prices. Restock early to protect your margin.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 pt-3 border-t border-[#E8C34E]/10">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Potential savings</p>
                <p className="font-display text-xl font-black text-emerald-500">₦4,500</p>
              </div>
              <button 
                onClick={() => {
                  const sup = allSuppliers.find(s => s.products.some(p => p.name.includes('Milk') || p.category.includes('Beverages')));
                  if (sup) {
                    setActiveSupplierCatalog(sup);
                  } else {
                    showToast('Suppliers focused!');
                  }
                }}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-[#E8C34E] to-yellow-500 text-[#0B0B12] font-display font-black text-xs rounded-xl shadow-lg active:scale-95 transition-transform"
              >
                View Suppliers
              </button>
            </div>
          </div>

          {/* 2. QUICK ACTIONS GRID */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Suppliers', sub: 'Browse local catalog', icon: '🏪', onClick: () => {
                const el = document.getElementById('suppliers-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }},
              { label: 'Products', sub: 'Explore B2B list', icon: '📦', onClick: () => {
                setSearch('Bucket');
              }},
              { label: 'Trending', sub: 'High demand items', icon: '📈', onClick: () => {
                const el = document.getElementById('trending-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }},
              { label: 'Rewards', sub: 'Redeem coin prizes', icon: '🎁', onClick: () => setShowRewardsModal(true) },
            ].map(qa => (
              <button
                key={qa.label}
                onClick={qa.onClick}
                className="p-4 rounded-2xl bg-[#16181D] border border-border text-left hover:border-[#E8C34E]/40 active:scale-95 transition-all group shadow-sm hover:shadow-[0_0_15px_rgba(232,195,78,0.05)]"
              >
                <span className="text-2xl group-hover:scale-110 block transition-transform mb-2.5">{qa.icon}</span>
                <p className="font-display font-bold text-sm text-white">{qa.label}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{qa.sub}</p>
              </button>
            ))}
          </div>

          {/* 3. TRENDING PRODUCTS HORIZONTAL ROW */}
          <div id="trending-section" className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-display font-black text-lg text-white flex items-center gap-1.5">
                🔥 Trending Near You
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MOCK_TRENDING.map(trend => (
                <div
                  key={trend.id}
                  className="bg-[#16181D] border border-border rounded-2xl p-4 space-y-3 relative overflow-hidden"
                >
                  <div className="absolute right-0 top-0 text-7xl translate-y-4 translate-x-4 opacity-5 pointer-events-none">📦</div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      Demand: {trend.demand}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">{trend.storesBuying} stores buying</span>
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-sm text-white truncate">{trend.name}</h4>
                    <p className="text-[11px] text-[#E8C34E] font-medium mt-1">Average Profit: ₦{trend.profit.toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => openAddInventoryModal(trend.name, trend.averageCost, trend.category)}
                    className="w-full py-2 bg-gradient-to-r from-surface-2 to-surface-3 hover:from-[#E8C34E] hover:to-yellow-500 hover:text-[#0B0B12] text-white border border-border hover:border-transparent font-display font-bold text-xs rounded-xl transition-all"
                  >
                    Add Product
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 4. RECOMMENDED FOR YOUR STORE */}
          <div className="space-y-3 bg-[#16181D]/30 border border-border p-4 rounded-2xl">
            <h3 className="font-display font-black text-lg text-white flex items-center gap-1.5 px-1">
              ✨ Recommended For Your Store
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {MOCK_RECOMMENDED.map(rec => (
                <div key={rec.name} className="p-3 bg-[#16181D] border border-border rounded-xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-white truncate">{rec.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Est. Price: ₦{rec.marketPrice.toLocaleString()} · Profit: <span className="text-emerald-500">₦{rec.expectedProfit}</span>
                    </p>
                    <p className="text-[9px] text-[#E8C34E] mt-0.5">{rec.suppliersCount} local suppliers available</p>
                  </div>
                  <button
                    onClick={() => openAddInventoryModal(rec.name, rec.averageCost, rec.category)}
                    className="shrink-0 w-8 h-8 rounded-lg bg-[#E8C34E]/10 border border-[#E8C34E]/30 text-[#E8C34E] font-bold text-sm flex items-center justify-center active:scale-90 transition-transform"
                    title="Add to Inventory"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 5. FLOW AI CHAT ASSISTANT */}
          <div className="bg-gradient-to-b from-[#16181D] to-[#0B0B12] border border-[#E8C34E]/20 p-4 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <h4 className="font-display font-bold text-sm text-[#E8C34E]">Flow AI Assistant</h4>
                <p className="text-[10px] text-muted-foreground">Ask Flow for wholesale and market price insights</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
              {[
                'Which supplier is cheapest for Semovita?',
                'What products are trending nearby?',
                'Should I restock Minerals?',
              ].map(p => (
                <button
                  key={p}
                  onClick={() => handleAskFlow(p)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0B12] hover:bg-[#E8C34E]/10 border border-border text-left text-[10px] text-white hover:text-[#E8C34E] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            {aiAssistantQuery && (
              <div className="mt-2.5 p-3 rounded-xl bg-[#0B0B12]/80 border border-border text-xs leading-relaxed space-y-1">
                <p className="text-muted-foreground font-semibold">Q: "{aiAssistantQuery}"</p>
                {aiAssistantLoading ? (
                  <p className="text-amber-500 animate-pulse">Flow is analyzing local supply catalogs...</p>
                ) : (
                  <p className="text-white whitespace-pre-line">{aiAssistantAnswer}</p>
                )}
              </div>
            )}
          </div>

          {/* 6. NEARBY SUPPLIERS */}
          <div id="suppliers-section" className="space-y-3">
            <h3 className="font-display font-black text-lg text-white">
              🏪 Nearby Suppliers
            </h3>
            <div className="space-y-2.5">
              {allSuppliers.map(sup => (
                <div key={sup.id} className="p-4 bg-[#16181D] border border-border rounded-2xl flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-bold text-base text-white">{sup.name}</h4>
                      {sup.verified && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>📍 {sup.distance} away</span>
                      <span>•</span>
                      <span>⭐ {sup.rating} Rating</span>
                      <span>•</span>
                      <span>📦 {sup.productsCount} catalog items</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={sup.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-xs flex items-center gap-1.5"
                    >
                      💬 WhatsApp
                    </a>
                    <a
                      href={`tel:${sup.phone}`}
                      className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-white font-display font-semibold text-xs flex items-center gap-1.5"
                    >
                      📞 Call
                    </a>
                    <button
                      onClick={() => setActiveSupplierCatalog(sup)}
                      className="px-4 py-2 rounded-xl bg-[#E8C34E] hover:bg-[#E8C34E]/90 text-[#0B0B12] font-display font-black text-xs shadow-md"
                    >
                      View Products
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7. BEST PRICES COMPARISON */}
          <div className="p-5 bg-[#16181D] border border-border rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="font-display font-black text-lg text-white">
                  ⚖️ Best Prices Today
                </h3>
                <p className="text-xs text-muted-foreground">Flow automatically matches and compares supplier quotes</p>
              </div>
              
              <select
                value={comparisonProduct}
                onChange={e => setComparisonProduct(e.target.value)}
                className="p-2 rounded-lg bg-[#0B0B12] border border-border text-xs text-[#E8C34E] focus:outline-none"
              >
                {COMPARISON_PRODUCTS.map(cp => (
                  <option key={cp} value={cp}>{cp}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {currentComparison.prices.map((p, idx) => {
                const isCheapest = p.price === currentComparison.cheapest.price;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      isCheapest
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.05)]'
                        : 'bg-[#0B0B12]/60 border-border'
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground truncate">{p.name}</p>
                    <p className={`font-display font-black text-sm mt-1.5 ${isCheapest ? 'text-emerald-400' : 'text-white'}`}>
                      ₦{p.price.toLocaleString()}
                    </p>
                    {isCheapest && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] bg-emerald-500 text-white font-bold uppercase tracking-wider scale-90">
                        Best Price
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-[#E8C34E]/10 border border-[#E8C34E]/20 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span>💡</span>
                <span className="text-[#E8C34E]">
                  You save <strong>₦{currentComparison.savings.toLocaleString()}</strong> by buying from {currentComparison.cheapest.name.split(' ')[0]}.
                </span>
              </div>
              <button
                onClick={() => {
                  const targetSupplier = allSuppliers.find(s => s.name.includes(currentComparison.cheapest.name.split(' ')[2]) || s.id === 'sup-tommy' || s.id === 'sup-innie');
                  if (targetSupplier) {
                    window.open(targetSupplier.whatsapp, '_blank');
                  }
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#E8C34E] text-[#0B0B12] font-display font-bold text-[10px]"
              >
                Order WhatsApp
              </button>
            </div>
          </div>

          {/* 8. HIGH DEMAND & SELL EXCESS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* High Demand Opportunity */}
            <div className="p-5 bg-gradient-to-br from-[#16181D] to-[#0B0B12] border border-border rounded-2xl space-y-4">
              <div>
                <h4 className="font-display font-bold text-sm text-[#E8C34E] uppercase tracking-wider">
                  ⚠️ High Demand Opportunities
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Flow matches items trending in other stores but missing in yours</p>
              </div>

              <div className="p-4 bg-[#16181D]/60 border border-border rounded-xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-display font-bold text-base text-white">Garri (White) Bucket</h5>
                    <p className="text-xs text-amber-500 font-semibold mt-0.5">Current Demand: 95%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Your Stock</p>
                    <p className={`font-display font-black text-sm ${garriStock <= 5 ? 'text-destructive' : 'text-white'}`}>
                      {garriStock} units
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-border/40">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Estimated Monthly Profit</p>
                    <p className="font-display text-base font-black text-emerald-400">₦18,000</p>
                  </div>
                  <button
                    onClick={() => openAddInventoryModal('Garri (White) Bucket', 2050, 'Groceries')}
                    className="px-3.5 py-2 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-xs shadow-md"
                  >
                    Add Product
                  </button>
                </div>
              </div>
            </div>

            {/* Sell Excess Inventory Form */}
            <div className="p-5 bg-[#16181D] border border-border rounded-2xl space-y-4">
              <div>
                <h4 className="font-display font-bold text-sm text-white">
                  📦 Sell Excess Inventory
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">List slow-moving products to local stores</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={excessProduct}
                    onChange={e => setExcessProduct(e.target.value)}
                    className="p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E]"
                  >
                    <option value="">Select Product...</option>
                    {store.products.map(p => (
                      <option key={p.id} value={p.name}>{p.name} (Stock: {p.quantity})</option>
                    ))}
                  </select>

                  <input
                    type="number"
                    value={excessQty}
                    onChange={e => setExcessQty(e.target.value)}
                    placeholder="Qty to sell"
                    className="p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={excessPrice}
                    onChange={e => setExcessPrice(e.target.value)}
                    placeholder="Total price (₦)"
                    className="flex-1 p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E]"
                  />
                  <button
                    onClick={() => setExcessVisibility(!excessVisibility)}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-semibold ${
                      excessVisibility ? 'bg-[#E8C34E]/10 border-[#E8C34E] text-[#E8C34E]' : 'bg-[#0B0B12] border-border text-muted-foreground'
                    }`}
                  >
                    {excessVisibility ? '🌍 Public' : '🔒 Private'}
                  </button>
                </div>

                <button
                  onClick={handlePostExcessListing}
                  className="w-full py-2.5 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-xs shadow-md active:scale-95 transition-transform"
                >
                  Post Listing (+🪙25)
                </button>
              </div>

              {/* Listings display */}
              <div className="pt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Active Listings Nearby</p>
                <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                  {localExcessListings.map((el, index) => (
                    <div key={el.id || index} className="flex justify-between items-center text-xs p-2 rounded-lg bg-[#0B0B12]/80 border border-border">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{el.productName} × {el.quantity}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{el.storeName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#E8C34E]">₦{el.price.toLocaleString()}</span>
                        <a
                          href={el.whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded bg-[#E8C34E]/10 hover:bg-[#E8C34E]/20 text-[#E8C34E] text-[10px]"
                        >
                          Chat
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* 9. MARKETPLACE DEALS & CUSTOMER REQUEST MARKET */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Deals */}
            <div className="p-5 bg-[#16181D] border border-border rounded-2xl space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-display font-bold text-sm text-white">
                    🔥 Daily Deals
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Flash discounts from wholesalers</p>
                </div>
                
                {/* Countdown timer */}
                <div className="flex items-center gap-1 bg-[#0B0B12] px-2.5 py-1.5 rounded-lg border border-border">
                  <span className="text-[10px] text-[#E8C34E] font-display font-bold">⏱️</span>
                  <span className="text-[10px] font-mono text-[#E8C34E]">
                    {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {MOCK_DEALS.map(deal => (
                  <div key={deal.name} className="p-2.5 bg-[#0B0B12]/80 border border-border rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{deal.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{deal.supplier}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-[#E8C34E] font-bold">₦{deal.discountedPrice.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground line-through">₦{deal.originalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                      -{deal.discountPercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Requests */}
            <div className="p-5 bg-[#16181D] border border-border rounded-2xl space-y-4">
              <div>
                <h4 className="font-display font-bold text-sm text-white flex items-center gap-1.5">
                  📋 Customer Request Market
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">What local customers are requesting this month</p>
              </div>

              <div className="space-y-2">
                {CUSTOMER_REQUESTS.map((req, idx) => (
                  <div key={req.name} className="flex justify-between items-center p-2.5 bg-[#0B0B12]/80 border border-border rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-surface-2 border border-border text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold">{req.name}</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Requested {req.count} times
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-[#E8C34E]/5 border border-[#E8C34E]/20 rounded-xl text-[10px] text-muted-foreground leading-relaxed">
                📢 <strong>Flow notification:</strong> Stores near you are receiving high demand for <strong>Garri</strong>. Consider purchasing crates to satisfy customer request overflow.
              </div>
            </div>

          </div>

          {/* 10. SUPPLIER CONNECT FORM */}
          <div className="bg-[#16181D] border border-border rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-black text-lg text-white">
                  🤝 Supplier Connect
                </h3>
                <p className="text-xs text-muted-foreground">Are you a wholesaler? Register your catalog to sell to local retailers</p>
              </div>
              <button
                onClick={() => setShowSupplierForm(!showSupplierForm)}
                className="px-3.5 py-1.5 rounded-xl border border-border hover:border-[#E8C34E]/50 font-display font-semibold text-xs"
              >
                {showSupplierForm ? 'Hide Form' : 'Register Now'}
              </button>
            </div>

            {showSupplierForm && (
              <form onSubmit={handleRegisterSupplier} className="space-y-3 pt-2">
                {supSubmitted ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-center space-y-1 text-xs">
                    <p className="font-bold">✓ Profile Submitted Successfully!</p>
                    <p className="text-muted-foreground">Innie Group verification team will review your business credentials in 24 hours.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={supName}
                        onChange={e => setSupName(e.target.value)}
                        placeholder="Wholesale Business Name"
                        className="p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
                        required
                      />
                      <input
                        type="text"
                        value={supPhone}
                        onChange={e => setSupPhone(e.target.value)}
                        placeholder="WhatsApp / Phone Number"
                        className="p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
                        required
                      />
                    </div>
                    
                    <input
                      type="text"
                      value={supLocation}
                      onChange={e => setSupLocation(e.target.value)}
                      placeholder="Warehouse Location (e.g. Alaba Market, Lagos)"
                      className="w-full p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
                      required
                    />

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Delivery Available:</span>
                        <input
                          type="checkbox"
                          checked={supDelivery}
                          onChange={e => setSupDelivery(e.target.checked)}
                          className="w-4 h-4 rounded accent-[#E8C34E]"
                        />
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-xs">
                        <input
                          type="time"
                          value={supOpening}
                          onChange={e => setSupOpening(e.target.value)}
                          className="bg-[#0B0B12] border border-border rounded p-1 text-[#E8C34E]"
                        />
                        <span className="text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={supClosing}
                          onChange={e => setSupClosing(e.target.value)}
                          className="bg-[#0B0B12] border border-border rounded p-1 text-[#E8C34E]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-xs shadow-md"
                    >
                      Submit Supplier Details (+🪙100)
                    </button>
                  </>
                )}
              </form>
            )}
          </div>

          {/* 11. FUTURE FEATURES / TECH ROADMAP */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#16181D] to-[#0B0B12] border border-border/80 space-y-3">
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground">
              🚀 Tech Roadmap &amp; Future Features
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Supplier Reviews', 'Delivery Tracking', 'Group Purchasing', 'Bulk Discounts',
                'AI Price Negotiation', 'AI Stock Forecasting', 'AI Supplier Ranking',
                'AI Purchase Planning', 'Voice search', 'QR ordering'
              ].map(f => (
                <span
                  key={f}
                  className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[10px] text-muted-foreground font-semibold"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
           MODAL: REWARDS COINS REDEMPTION
         ═══════════════════════════════════════════════════════════ */}
      {showRewardsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowRewardsModal(false)}>
          <div className="w-full max-w-md bg-[#16181D] border border-[#E8C34E]/30 rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-black text-lg text-white">🪙 StoreFlow Rewards</h3>
                <p className="text-xs text-muted-foreground">Exchange your coins for business boosters</p>
              </div>
              <button onClick={() => setShowRewardsModal(false)} className="text-muted-foreground hover:text-white text-2xl">×</button>
            </div>

            <div className="p-3 bg-[#E8C34E]/10 border border-[#E8C34E]/20 rounded-xl text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Your Balance</p>
              <p className="font-display text-2xl font-black text-[#E8C34E]">🪙 {coinsBalance} Coins</p>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {REDEEMABLES.map(item => {
                const canAfford = coinsBalance >= item.cost;
                return (
                  <div key={item.id} className="p-3 bg-[#0B0B12]/80 border border-border rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{item.description}</p>
                    </div>
                    <button
                      onClick={() => handleRedeem(item)}
                      disabled={!canAfford}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-all ${
                        canAfford
                          ? 'bg-[#E8C34E] text-[#0B0B12] hover:scale-105'
                          : 'bg-surface-3 text-muted-foreground border border-border cursor-not-allowed opacity-50'
                      }`}
                    >
                      🪙 {item.cost}
                    </button>
                  </div>
                );
              })}
            </div>
            
            <button
              onClick={() => setShowRewardsModal(false)}
              className="w-full py-2.5 rounded-xl border border-border font-display font-semibold text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
           MODAL: SUPPLIER PRODUCT CATALOGUE
         ═══════════════════════════════════════════════════════════ */}
      {activeSupplierCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setActiveSupplierCatalog(null)}>
          <div className="w-full max-w-lg bg-[#16181D] border border-border rounded-2xl p-5 animate-slide-up flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-start pb-3 border-b border-border">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display font-black text-lg text-white">{activeSupplierCatalog.name}</h3>
                  {activeSupplierCatalog.verified && <span className="text-emerald-500 text-xs">✓</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Supplier catalogue • Direct wholesale prices</p>
              </div>
              <button onClick={() => setActiveSupplierCatalog(null)} className="text-muted-foreground hover:text-white text-2xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
              {activeSupplierCatalog.products.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">This supplier hasn't uploaded products yet. Check back later.</p>
              ) : (
                activeSupplierCatalog.products.map(p => (
                  <div key={p.name} className="p-3 bg-[#0B0B12]/80 border border-border rounded-xl flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-white">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Category: {p.category}</p>
                      <p className="text-xs font-bold text-[#E8C34E] mt-1">₦{p.price.toLocaleString()}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveSupplierCatalog(null);
                          openAddInventoryModal(p.name, p.price, p.category);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#E8C34E]/10 border border-[#E8C34E]/30 text-[#E8C34E] text-xs font-bold"
                      >
                        Add product
                      </button>
                      <a
                        href={`https://wa.me/2347025517388?text=Hello%20${activeSupplierCatalog.name},%20I%20want%20to%20order%20the%20${p.name}%20(₦${p.price.toLocaleString()})%20seen%20on%20StoreFlow.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                      >
                        Order WhatsApp
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
              <a
                href={activeSupplierCatalog.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-display font-bold flex items-center gap-1.5"
              >
                💬 Chat WhatsApp
              </a>
              <button
                onClick={() => setActiveSupplierCatalog(null)}
                className="px-4 py-2 bg-surface-2 border border-border text-white rounded-xl text-xs font-display font-semibold"
              >
                Close Catalogue
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
           MODAL: ADD PRODUCT TO LIVE INVENTORY (BINDING)
         ═══════════════════════════════════════════════════════════ */}
      {selectedProductToAdd && (
        <InventoryAddForm
          productName={selectedProductToAdd.name}
          defaultCost={selectedProductToAdd.costPrice}
          defaultSell={selectedProductToAdd.sellingPrice}
          onClose={() => setSelectedProductToAdd(null)}
          onSave={handleSaveProductToInventory}
        />
      )}

    </div>
  );
}

// ─── Child Form Component to handle pricing configurations ───────────
interface InventoryAddFormProps {
  productName: string;
  defaultCost: number;
  defaultSell: number;
  onClose: () => void;
  onSave: (qty: number, cost: number, sell: number) => void;
}

function InventoryAddForm({ productName, defaultCost, defaultSell, onClose, onSave }: InventoryAddFormProps) {
  const [qty, setQty] = useState('10');
  const [cost, setCost] = useState(String(defaultCost));
  const [sell, setSell] = useState(String(defaultSell));

  const profit = Number(sell) - Number(cost);
  const profitMargin = Number(cost) > 0 ? Math.round((profit / Number(cost)) * 100) : 0;

  const handleConfirm = () => {
    const q = Number(qty);
    const c = Number(cost);
    const s = Number(sell);
    if (!q || q <= 0 || !c || c <= 0 || !s || s <= 0) {
      showToast('Please enter positive numbers for all fields', 'error');
      return;
    }
    onSave(q, c, s);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#16181D] border border-[#E8C34E]/30 rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
        
        <div>
          <h3 className="font-display font-black text-lg text-white">📦 Add to Inventory</h3>
          <p className="text-xs text-muted-foreground truncate">{productName}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Initial Stock Quantity</label>
            <input
              type="number"
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cost Price (₦)</label>
              <input
                type="number"
                value={cost}
                onChange={e => setCost(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
              />
            </div>
            
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Selling Price (₦)</label>
              <input
                type="number"
                value={sell}
                onChange={e => setSell(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-[#0B0B12] border border-border text-xs focus:outline-none focus:border-[#E8C34E] text-white"
              />
            </div>
          </div>

          <div className="p-3 bg-[#0B0B12]/80 border border-border rounded-xl text-[10px] flex justify-between">
            <span className="text-muted-foreground">Expected Profit / Unit:</span>
            <span className={profit > 0 ? 'text-emerald-400 font-bold' : 'text-rose-500 font-bold'}>
              ₦{profit.toLocaleString()} ({profitMargin}% margin)
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl bg-[#E8C34E] text-[#0B0B12] font-display font-black text-xs shadow-md"
            >
              Add to Stock
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
