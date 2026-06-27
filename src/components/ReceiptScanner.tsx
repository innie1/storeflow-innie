import { useState, useRef, useEffect } from 'react';
import { StoreData, Product, LearnedProduct } from '@/types/store';
import { recordSale, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { supabase } from '@/integrations/supabase/client';

interface ScannedItem {
  name: string;
  costPrice: number;     // Total cost price in the scanned invoice
  sellingPrice: number;  // Selling price (initially matches cost or calculated)
  quantity: number;      // Quantity purchased (e.g. 4 cartons)
  category: string;
}

interface ReceiptScannerProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

interface GroupInfo {
  id: string;
  label: string;
  icon: string;
  keywords: string[];
  items: ScannedItem[];
  answered: boolean;
  sameStructure: boolean | null;
  purchaseUnit: string;
  sellingUnit: string;
  unitsPerPurchase: number;
  sachetType?: 'roll' | 'carton';
  rollsPerCarton?: number;
  sachetsPerRoll?: number;
}

export default function ReceiptScanner({ store, onUpdate, onClose }: ReceiptScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // V1 Import Learning Logic States
  const [learningStep, setLearningStep] = useState<'upload' | 'learning' | 'summary' | 'success'>('upload');
  const [learningQueue, setLearningQueue] = useState<ScannedItem[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentItemInGroupIndex, setCurrentItemInGroupIndex] = useState(0);
  const [learnedCount, setLearnedCount] = useState(0);

  // Custom UI selectors
  const [customPurchaseUnit, setCustomPurchaseUnit] = useState('');
  const [customQtyVal, setCustomQtyVal] = useState('');
  const [customRollsVal, setCustomRollsVal] = useState('12');
  const [customSachetsVal, setCustomSachetsVal] = useState('10');

  const startLearningFlow = (scannedItems: ScannedItem[]) => {
    const learnedList = store.learnedProducts || [];
    const productsList = store.products || [];

    const newItemsToLearn: ScannedItem[] = [];
    const processedItems: ScannedItem[] = [];

    const defaultMargin = store.managerSettings?.defaultMargin ?? 20;

    for (const item of scannedItems) {
      // 1. Check existing inventory products
      const existing = productsList.find(
        p => p.name.toLowerCase() === item.name.toLowerCase() && !p.discontinued
      );

      if (existing) {
        let unitsPerPurchase = 1;
        if (existing.isCartonSingleEnabled && existing.singlesPerCarton) {
          unitsPerPurchase = existing.singlesPerCarton;
        }
        const unitCost = item.costPrice / (item.quantity * unitsPerPurchase);
        const sellingPrice = existing.sellingPrice || (unitCost * (1 + defaultMargin / 100));

        processedItems.push({
          ...item,
          costPrice: unitCost,
          sellingPrice: sellingPrice,
          category: existing.category || item.category || 'Groceries'
        });
        continue;
      }

      // 2. Check learned products library
      const learned = learnedList.find(
        lp => lp.name.toLowerCase() === item.name.toLowerCase()
      );

      if (learned) {
        const unitCost = item.costPrice / (item.quantity * learned.unitsPerPurchase);
        const sellingPrice = learned.suggestedSellingPrice || (unitCost * (1 + learned.markup / 100));

        processedItems.push({
          ...item,
          costPrice: unitCost,
          sellingPrice: sellingPrice,
          category: item.category || 'Groceries'
        });
        continue;
      }

      // 3. New product to learn
      newItemsToLearn.push(item);
    }

    if (newItemsToLearn.length === 0) {
      setItems(processedItems);
      setLearningStep('summary');
      return;
    }

    // Set recognized/pre-learned items
    setItems(processedItems);

    // Grouping similar new products
    const defaultGroups: GroupInfo[] = [
      { id: 'drinks', label: 'Drinks', icon: '🥤', keywords: ['coke', 'pepsi', 'water', 'juice', 'fanta', 'sprite', 'soda', 'beer', 'malt', 'drink', 'beverage', 'schweppes', 'lacasera', 'viju', 'chivita', '5alive', 'eva'], items: [], answered: false, sameStructure: null, purchaseUnit: 'Carton', sellingUnit: 'Bottle', unitsPerPurchase: 24 },
      { id: 'noodles', label: 'Noodles', icon: '🍜', keywords: ['indomie', 'noodles', 'chikki', 'penny', 'mimi', 'minimie', 'golden penny'], items: [], answered: false, sameStructure: null, purchaseUnit: 'Carton', sellingUnit: 'Pack', unitsPerPurchase: 40 },
      { id: 'sachets', label: 'Sachet Products', icon: '🥛', keywords: ['milk', 'milo', 'cowbell', 'coffee', 'nescafe', 'sachet', 'tea', 'detergent', 'omo', 'ariel', 'klin', 'sunlight', 'dano', 'peak', 'three crowns', 'loya'], items: [], answered: false, sameStructure: null, purchaseUnit: 'Roll', sellingUnit: 'Sachet', unitsPerPurchase: 10, sachetType: 'roll', rollsPerCarton: 12, sachetsPerRoll: 10 },
      { id: 'biscuits', label: 'Biscuits', icon: '🍪', keywords: ['biscuit', 'cabin', 'digestive', 'yale', 'cookies', 'crackers', 'mcfities', 'beloxxi', 'speedy', 'spicy'], items: [], answered: false, sameStructure: null, purchaseUnit: 'Carton', sellingUnit: 'Pack', unitsPerPurchase: 24 },
      { id: 'other', label: 'Other Items', icon: '📦', keywords: [], items: [], answered: false, sameStructure: null, purchaseUnit: 'Carton', sellingUnit: 'Item', unitsPerPurchase: 12 }
    ];

    for (const item of newItemsToLearn) {
      let allocated = false;
      const lowerName = item.name.toLowerCase();

      for (const g of defaultGroups) {
        if (g.id === 'other') continue;
        if (g.keywords.some(k => lowerName.includes(k))) {
          g.items.push(item);
          allocated = true;
          break;
        }
      }

      if (!allocated) {
        defaultGroups.find(g => g.id === 'other')?.items.push(item);
      }
    }

    const activeGroups = defaultGroups.filter(g => g.items.length > 0);

    setGroups(activeGroups);
    setLearningQueue(newItemsToLearn);
    setCurrentGroupIndex(0);
    setCurrentItemInGroupIndex(0);
    setLearningStep('learning');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return showToast('Please upload an image file', 'error');
    }

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setScanning(true);
    setError(null);
    setItems([]);

    try {
      const base64 = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke('scan-receipt', {
        body: { imageBase64: base64 },
      });

      if (fnError) throw new Error(fnError.message || 'Scan failed');
      if (data?.error) throw new Error(data.error);

      if (data?.items?.length > 0) {
        showToast(`Parsed ${data.items.length} items from receipt`, 'success');
        startLearningFlow(data.items);
      } else {
        setError('No items found in receipt. Try a clearer image.');
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to scan receipt');
      showToast('Scan failed', 'error');
    } finally {
      setScanning(false);
    }
  };

  const applyStructureToItems = (targetItems: ScannedItem[], pUnit: string, sUnit: string, unitsPerPurchase: number) => {
    const defaultMargin = store.managerSettings?.defaultMargin ?? 20;

    const processed = targetItems.map(item => {
      // Cost price in invoice is total purchase price, so we divide by (invoiceQty * unitsPerPurchase)
      const unitCost = item.costPrice / (item.quantity * unitsPerPurchase);
      
      // If cost price and selling price are equal (or margin causes them to match), use default margin
      let sellingPrice = item.sellingPrice;
      if (sellingPrice <= unitCost || Math.abs(sellingPrice - unitCost) < 0.1) {
        sellingPrice = unitCost * (1 + defaultMargin / 100);
      }

      return {
        ...item,
        costPrice: unitCost,
        sellingPrice: sellingPrice,
        category: autoCategory(item.name)
      };
    });

    setItems(prev => [...prev, ...processed]);
  };

  const autoCategory = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('soap') || n.includes('detto') || n.includes('lux') || n.includes('premier') || n.includes('handwash')) return 'Soap';
    if (n.includes('detergent') || n.includes('omo') || n.includes('ariel') || n.includes('soclin') || n.includes('wash') || n.includes('bleach') || n.includes('hypo')) return 'Detergents';
    if (n.includes('milk') || n.includes('drink') || n.includes('water') || n.includes('beverage') || n.includes('soda') || n.includes('milo') || n.includes('coke') || n.includes('mineral') || n.includes('juice') || n.includes('fanta') || n.includes('sprite') || n.includes('pepsi') || n.includes('tea') || n.includes('coffee')) return 'Beverages';
    if (n.includes('rice') || n.includes('beans') || n.includes('garri') || n.includes('yam') || n.includes('food') || n.includes('grocery') || n.includes('spaghetti') || n.includes('indomie') || n.includes('bread') || n.includes('semovita') || n.includes('oil') || n.includes('sugar') || n.includes('salt') || n.includes('flour') || n.includes('semolina')) return 'Groceries';
    return 'Others';
  };

  const handleNextLearningStep = (pUnit: string, sUnit: string, unitsPerQty: number) => {
    const group = groups[currentGroupIndex];
    
    if (group.sameStructure || group.sameStructure === null) {
      applyStructureToItems(group.items, pUnit, sUnit, unitsPerQty);
      showToast(`✓ Learned structures for ${group.items.length} ${group.label}`, 'success');
      
      if (currentGroupIndex + 1 < groups.length) {
        setCurrentGroupIndex(prev => prev + 1);
        setCurrentItemInGroupIndex(0);
      } else {
        setLearningStep('summary');
      }
    } else {
      // Individual flow
      const currentItem = group.items[currentItemInGroupIndex];
      applyStructureToItems([currentItem], pUnit, sUnit, unitsPerQty);
      showToast(`✓ Learned structure for ${currentItem.name}`, 'success');

      if (currentItemInGroupIndex + 1 < group.items.length) {
        setCurrentItemInGroupIndex(prev => prev + 1);
      } else if (currentGroupIndex + 1 < groups.length) {
        setCurrentGroupIndex(prev => prev + 1);
        setCurrentItemInGroupIndex(0);
      } else {
        setLearningStep('summary');
      }
    }

    // Reset custom inputs
    setCustomPurchaseUnit('');
    setCustomQtyVal('');
    setCustomRollsVal('12');
    setCustomSachetsVal('10');
  };

  const updateItem = (index: number, field: keyof ScannedItem, value: string | number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: typeof item[field] === 'number' ? Number(value) : value } : item
    ));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleStock = () => {
    let updated = { ...store };
    let stocked = 0;

    const existingLearned = updated.learnedProducts || [];
    const nextLearned = [...existingLearned];

    for (const item of items) {
      const existingIndex = updated.products.findIndex(
        p => p.name.toLowerCase() === item.name.toLowerCase() && !p.discontinued
      );

      // Save structural learning details
      const wasLearned = learningQueue.find(l => l.name.toLowerCase() === item.name.toLowerCase());
      if (wasLearned) {
        let unitsPerPurchase = 1;
        let pUnit = 'Carton';
        let sUnit = 'Item';

        const matchedGroup = groups.find(g => g.items.some(gi => gi.name.toLowerCase() === item.name.toLowerCase()));
        if (matchedGroup) {
          unitsPerPurchase = matchedGroup.unitsPerPurchase;
          pUnit = matchedGroup.purchaseUnit;
          sUnit = matchedGroup.sellingUnit;
        }

        const learnIndex = nextLearned.findIndex(l => l.name.toLowerCase() === item.name.toLowerCase());
        const learningEntry: LearnedProduct = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name: item.name,
          purchaseUnit: pUnit,
          sellingUnit: sUnit,
          unitsPerPurchase,
          suggestedSellingPrice: item.sellingPrice,
          markup: store.managerSettings?.defaultMargin ?? 20,
          lastPurchasePrice: item.costPrice * unitsPerPurchase,
          averagePurchasePrice: item.costPrice * unitsPerPurchase,
          dateLearned: new Date().toISOString()
        };

        if (learnIndex >= 0) {
          nextLearned[learnIndex] = learningEntry;
        } else {
          nextLearned.push(learningEntry);
        }
      }

      if (existingIndex >= 0) {
        const existing = updated.products[existingIndex];
        let unitsPerPurchase = 1;
        const matchedGroup = groups.find(g => g.items.some(gi => gi.name.toLowerCase() === item.name.toLowerCase()));
        if (matchedGroup) {
          unitsPerPurchase = matchedGroup.unitsPerPurchase;
        } else if (existing.isCartonSingleEnabled && existing.singlesPerCarton) {
          unitsPerPurchase = existing.singlesPerCarton;
        }

        const addQty = item.quantity * unitsPerPurchase;

        updated.products[existingIndex] = {
          ...existing,
          quantity: existing.quantity + addQty,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice
        };
      } else {
        let unitsPerPurchase = 1;
        const matchedGroup = groups.find(g => g.items.some(gi => gi.name.toLowerCase() === item.name.toLowerCase()));
        if (matchedGroup) {
          unitsPerPurchase = matchedGroup.unitsPerPurchase;
        }

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + stocked;
        updated.products.push({
          id,
          name: item.name,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          quantity: item.quantity * unitsPerPurchase,
          category: item.category || 'Groceries',
          isCartonSingleEnabled: unitsPerPurchase > 1,
          singlesPerCarton: unitsPerPurchase,
          sellAsSinglesByDefault: unitsPerPurchase > 1,
          singleSellingPrice: item.sellingPrice
        });
      }
      stocked++;
    }

    updated.learnedProducts = nextLearned;

    saveStore(updated);
    onUpdate(updated);

    setLearnedCount(learningQueue.length);
    setLearningStep('success');
  };

  const handleSell = () => {
    let updated = { ...store };
    let sold = 0;

    for (const item of items) {
      const existing = updated.products.find(
        p => p.name.toLowerCase() === item.name.toLowerCase()
      );

      if (existing && existing.quantity >= item.quantity) {
        updated = recordSale(updated, existing.id, item.quantity);
        sold++;
      } else if (existing) {
        showToast(`Not enough stock for ${item.name}`, 'error');
      } else {
        showToast(`${item.name} not in inventory`, 'error');
      }
    }

    if (sold > 0) {
      onUpdate(updated);
      showToast(`${sold} sales recorded`);
      onClose();
    }
  };

  const inputClass = "w-full p-2.5 rounded-xl bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-xs placeholder:text-muted-foreground";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-card border border-border rounded-2xl p-6 shadow-2xl animate-slide-up no-scrollbar" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-border/40 mb-5 sticky top-0 bg-card z-20">
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <span>📷</span> Invoice Import Assistant
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl transition-colors cursor-pointer">×</button>
        </div>

        {/* STEP 1: Upload / Scanning Screen */}
        {learningStep === 'upload' && (
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface-2/20 space-y-4 group"
            >
              {preview ? (
                <img src={preview} alt="Receipt Preview" className="max-h-48 mx-auto rounded-xl shadow-md border border-border/50" />
              ) : (
                <div className="space-y-3 py-6">
                  <div className="text-5xl group-hover:scale-110 transition-transform duration-200">🧾</div>
                  <h4 className="font-display font-bold text-sm text-foreground">Tap to scan or select invoice image</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">Supports JPG, PNG, and HEIC camera invoices</p>
                </div>
              )}
              {scanning && (
                <div className="flex flex-col items-center justify-center pt-2 space-y-2">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
                  <div className="text-xs font-display font-bold text-primary animate-pulse">AI is reading invoice details...</div>
                </div>
              )}
            </div>
            
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            {error && <p className="text-destructive text-xs font-semibold text-center bg-destructive/5 py-2.5 rounded-xl border border-destructive/20">{error}</p>}
          </div>
        )}

        {/* STEP 2: Interactive Learning Card Wizard */}
        {learningStep === 'learning' && (() => {
          const group = groups[currentGroupIndex];
          if (!group) return null;

          const isSachets = group.id === 'sachets';
          const isNoodles = group.id === 'noodles';

          const currentItem = group.sameStructure === false ? group.items[currentItemInGroupIndex] : null;
          const labelText = currentItem ? currentItem.name : `${group.items.length} new ${group.label.toLowerCase()}`;

          return (
            <div className="space-y-5">
              {/* Group Banner */}
              <div className="p-4 rounded-2xl bg-surface-2/50 border border-border/80 flex items-center gap-3">
                <span className="text-3xl">{group.icon}</span>
                <div>
                  <h4 className="font-display font-bold text-base text-white">{group.label}</h4>
                  <p className="text-xs text-muted-foreground">
                    I detected <strong className="text-white">{group.items.length}</strong> new product{group.items.length > 1 ? 's' : ''} in this group.
                  </p>
                </div>
              </div>

              {/* Step Question 1: Are they all purchased the same way? */}
              {group.sameStructure === null && (
                <div className="space-y-4 py-2">
                  <p className="text-sm font-semibold text-white">Are all these items purchased and packaged the same way?</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        const updated = [...groups];
                        updated[currentGroupIndex].sameStructure = true;
                        setGroups(updated);
                      }}
                      className="p-4 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition text-center space-y-1 cursor-pointer"
                    >
                      <span className="text-xl block">✅</span>
                      <strong className="text-xs font-display text-white">Yes, all the same</strong>
                    </button>
                    <button
                      onClick={() => {
                        const updated = [...groups];
                        updated[currentGroupIndex].sameStructure = false;
                        setGroups(updated);
                      }}
                      className="p-4 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition text-center space-y-1 cursor-pointer"
                    >
                      <span className="text-xl block">❌</span>
                      <strong className="text-xs font-display text-white">Ask individually</strong>
                    </button>
                  </div>

                  <div className="pt-2">
                    <h5 className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Products in group:</h5>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                      {group.items.map((it, idx) => <li key={idx}>{it.name}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Step Question 2: Custom details for yes-group or individual items */}
              {group.sameStructure !== null && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h5 className="text-xs font-bold text-primary font-display uppercase tracking-wider">
                      Learning structure for: <span className="text-white underline">{labelText}</span>
                    </h5>
                    {group.sameStructure === false && (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        Item {currentItemInGroupIndex + 1} of {group.items.length}
                      </span>
                    )}
                  </div>

                  {/* SACHET PRODUCTS WIZARD FLOW */}
                  {isSachets && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-2">How are they purchased?</label>
                        <div className="flex gap-2">
                          {['roll', 'carton'].map((type) => (
                            <button
                              key={type}
                              onClick={() => {
                                const updated = [...groups];
                                updated[currentGroupIndex].sachetType = type as 'roll' | 'carton';
                                setGroups(updated);
                              }}
                              className={`flex-1 py-2.5 rounded-xl border text-xs font-display font-bold transition-all cursor-pointer ${
                                group.sachetType === type 
                                  ? 'bg-primary text-primary-foreground border-primary' 
                                  : 'bg-surface-2 border-border text-muted-foreground'
                              }`}
                            >
                              {type === 'roll' ? '🥛 Roll' : '📦 Carton'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {group.sachetType === 'carton' && (
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">How many rolls are inside one carton?</label>
                          <input
                            type="number"
                            value={customRollsVal}
                            onChange={e => setCustomRollsVal(e.target.value)}
                            className={inputClass}
                            placeholder="e.g. 12"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                          How many sachets are inside one roll?
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {[8, 10, 12].map((num) => (
                            <button
                              key={num}
                              onClick={() => setCustomSachetsVal(String(num))}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                customSachetsVal === String(num)
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-surface-2 border-border text-muted-foreground hover:bg-surface-3'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            onClick={() => setCustomSachetsVal('')}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                              !['8', '10', '12'].includes(customSachetsVal)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-surface-2 border-border text-muted-foreground'
                            }`}
                          >
                            ✏ Other
                          </button>
                        </div>

                        {!['8', '10', '12'].includes(customSachetsVal) && (
                          <input
                            type="number"
                            value={customSachetsVal}
                            onChange={e => setCustomSachetsVal(e.target.value)}
                            placeholder="Enter custom count..."
                            className={inputClass}
                          />
                        )}
                      </div>

                      <button
                        onClick={() => {
                          const sRolls = group.sachetType === 'carton' ? (Number(customRollsVal) || 12) : 1;
                          const sCount = Number(customSachetsVal) || 10;
                          const totalSachets = sRolls * sCount;
                          handleNextLearningStep(
                            group.sachetType === 'carton' ? 'Carton' : 'Roll',
                            'Sachet',
                            totalSachets
                          );
                        }}
                        className="w-full py-3 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition cursor-pointer"
                      >
                        ✓ Apply Configuration
                      </button>
                    </div>
                  )}

                  {/* NOODLES PRODUCTS WIZARD FLOW */}
                  {isNoodles && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">How are these purchased?</label>
                        <div className="flex gap-2">
                          {['Carton', 'Pack'].map((unit) => (
                            <button
                              key={unit}
                              onClick={() => setCustomPurchaseUnit(unit)}
                              className={`flex-1 py-2.5 border rounded-xl text-xs font-display font-bold transition cursor-pointer ${
                                (customPurchaseUnit || 'Carton') === unit
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-surface-2 border-border text-muted-foreground'
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">How many packs are inside?</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {[40, 60].map((num) => (
                            <button
                              key={num}
                              onClick={() => setCustomQtyVal(String(num))}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                customQtyVal === String(num)
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-surface-2 border-border text-muted-foreground hover:bg-surface-3'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            onClick={() => setCustomQtyVal('')}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                              !['40', '60'].includes(customQtyVal)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-surface-2 border-border text-muted-foreground'
                            }`}
                          >
                            ✏ Other
                          </button>
                        </div>

                        {!['40', '60'].includes(customQtyVal) && (
                          <input
                            type="number"
                            value={customQtyVal}
                            onChange={e => setCustomQtyVal(e.target.value)}
                            placeholder="Enter custom pack quantity..."
                            className={inputClass}
                          />
                        )}
                      </div>

                      <button
                        onClick={() => {
                          const qty = Number(customQtyVal) || 40;
                          handleNextLearningStep(customPurchaseUnit || 'Carton', 'Pack', qty);
                        }}
                        className="w-full py-3 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition cursor-pointer"
                      >
                        ✓ Apply Configuration
                      </button>
                    </div>
                  )}

                  {/* DRINKS / BISCUITS / OTHER FLOW */}
                  {!isSachets && !isNoodles && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">What is the purchase unit?</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {['Carton', 'Pack', 'Crate'].map((unit) => (
                            <button
                              key={unit}
                              onClick={() => {
                                setCustomPurchaseUnit(unit);
                              }}
                              className={`px-3.5 py-2 rounded-xl border text-xs font-display font-bold transition cursor-pointer ${
                                (customPurchaseUnit || group.purchaseUnit) === unit
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-surface-2 border-border text-muted-foreground hover:bg-surface-3'
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                          <button
                            onClick={() => setCustomPurchaseUnit('Other')}
                            className={`px-3.5 py-2 rounded-xl border text-xs font-display font-bold transition cursor-pointer ${
                              customPurchaseUnit === 'Other'
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-surface-2 border-border text-muted-foreground'
                            }`}
                          >
                            ✏ Other
                          </button>
                        </div>

                        {customPurchaseUnit === 'Other' && (
                          <input
                            type="text"
                            value={customPurchaseUnit}
                            onChange={e => setCustomPurchaseUnit(e.target.value)}
                            placeholder="Enter custom unit name (e.g. Box, Bag)..."
                            className={inputClass}
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                          How many {group.sellingUnit.toLowerCase()}s are inside?
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {[8, 12, 24, 48].map((num) => (
                            <button
                              key={num}
                              onClick={() => setCustomQtyVal(String(num))}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                customQtyVal === String(num)
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-surface-2 border-border text-muted-foreground hover:bg-surface-3'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            onClick={() => setCustomQtyVal('')}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                              !['8', '12', '24', '48'].includes(customQtyVal)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-surface-2 border-border text-muted-foreground'
                            }`}
                          >
                            ✏ Other
                          </button>
                        </div>

                        {!['8', '12', '24', '48'].includes(customQtyVal) && (
                          <input
                            type="number"
                            value={customQtyVal}
                            onChange={e => setCustomQtyVal(e.target.value)}
                            placeholder="Enter custom count..."
                            className={inputClass}
                          />
                        )}
                      </div>

                      <button
                        onClick={() => {
                          const qty = Number(customQtyVal) || group.unitsPerPurchase;
                          handleNextLearningStep(
                            customPurchaseUnit || group.purchaseUnit,
                            group.sellingUnit,
                            qty
                          );
                        }}
                        className="w-full py-3 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition cursor-pointer"
                      >
                        ✓ Apply Configuration
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const updated = [...groups];
                      updated[currentGroupIndex].sameStructure = null;
                      setGroups(updated);
                    }}
                    className="w-full py-2.5 text-center text-xs text-muted-foreground hover:text-foreground font-semibold hover:underline mt-2"
                  >
                    ← Back to Group Question
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* STEP 3: Review & Summary Table */}
        {learningStep === 'summary' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                Verify and edit individual costs/prices before stocking inventory:
              </p>
              <button
                onClick={() => {
                  setItems([]);
                  setLearningStep('upload');
                  setPreview(null);
                }}
                className="text-xs text-primary font-bold hover:underline"
              >
                Scan another
              </button>
            </div>

            <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
              {items.map((item, i) => {
                const markupSuggested = item.costPrice * (1 + (store.managerSettings?.defaultMargin ?? 20) / 100);
                const isPriceSame = item.sellingPrice <= item.costPrice || Math.abs(item.sellingPrice - item.costPrice) < 0.1;

                return (
                  <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-border/80 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        value={item.name}
                        onChange={e => updateItem(i, 'name', e.target.value)}
                        className="bg-transparent border-none text-white font-display font-bold text-xs focus:ring-0 w-full p-0"
                      />
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive text-sm shrink-0 transition-colors">✕</button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Unit Cost (₦)</label>
                        <input
                          value={item.costPrice ? Math.round(item.costPrice) : ''}
                          onChange={e => updateItem(i, 'costPrice', e.target.value)}
                          type="number"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Selling Price (₦)</label>
                        <input
                          value={item.sellingPrice ? Math.round(item.sellingPrice) : ''}
                          onChange={e => updateItem(i, 'sellingPrice', e.target.value)}
                          type="number"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Pack Qty</label>
                        <input
                          value={item.quantity}
                          onChange={e => updateItem(i, 'quantity', e.target.value)}
                          type="number"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                        <select
                          value={item.category}
                          onChange={e => updateItem(i, 'category', e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                        >
                          {['Groceries', 'Beverages', 'Toiletries', 'Snacks', 'Bakery', 'Soap', 'Detergents', 'Others'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Cost price equals Selling price warning / quick apply */}
                    {isPriceSame && (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-500 leading-snug">
                        <span>Selling price and cost price are exactly the same. Apply {store.managerSettings?.defaultMargin ?? 20}% profit margin (₦{Math.round(markupSuggested)})?</span>
                        <button
                          onClick={() => {
                            updateItem(i, 'sellingPrice', Math.round(markupSuggested));
                            showToast(`Suggested selling price of ₦${Math.round(markupSuggested)} applied!`, 'success');
                          }}
                          className="px-3 py-1 bg-yellow-500 text-black rounded-lg font-display font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          OK
                        </button>
                      </div>
                    )}

                    {/* Stats metrics */}
                    {!isPriceSame && (
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground bg-black/20 p-2 rounded-lg">
                        <span>Expected Profit: <strong className="text-success">₦{Math.round(item.sellingPrice - item.costPrice)}</strong> / item</span>
                        <span>Revenue: <strong className="text-white">₦{Math.round(item.sellingPrice * item.quantity)}</strong></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleStock}
                className="p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs hover:brightness-105 transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>📦</span> Stock Items
              </button>
              <button
                onClick={handleSell}
                className="p-3 rounded-xl bg-surface-3 border border-success/30 text-success font-display font-bold text-xs hover:bg-surface-2 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>💰</span> Record Sales
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Celebrating Learning Progress Success Screen */}
        {learningStep === 'success' && (
          <div className="text-center space-y-6 py-6 animate-fade-in">
            <div className="text-6xl animate-bounce">🎉</div>
            
            <div className="space-y-2">
              <h3 className="font-display font-bold text-xl text-white">Great! You taught me.</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                I successfully learned how to purchase and structure <strong className="text-primary">{learnedCount}</strong> new product{learnedCount > 1 ? 's' : ''}. Next time I'll recognize them automatically!
              </p>
            </div>

            {/* Custom progress bar matching user aesthetic */}
            <div className="space-y-1.5 max-w-xs mx-auto">
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>AI Knowledge Progress</span>
                <span className="text-success font-bold">100%</span>
              </div>
              <div className="w-full bg-surface-2 h-2.5 rounded-full overflow-hidden border border-border">
                <div className="bg-success h-full rounded-full animate-pulse transition-all duration-1000" style={{ width: '100%' }} />
              </div>
            </div>

            <button
              onClick={() => {
                setItems([]);
                setPreview(null);
                setError(null);
                setLearningStep('upload');
                onClose();
              }}
              className="px-6 py-3 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              Finish & Return
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
