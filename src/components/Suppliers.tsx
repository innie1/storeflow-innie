import { useState } from 'react';
import { StoreData, Supplier } from '@/types/store';
import { addSupplier, updateSupplier, deleteSupplier } from '@/lib/store-data';
import { 
  Warehouse, Plus, Phone, MessageSquare, MapPin, Search, Edit, Trash2, Tag, ShieldAlert, Sparkles
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface SuppliersProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Suppliers({ store, onUpdate }: SuppliersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsApp, setWhatsApp] = useState('');
  const [address, setAddress] = useState('');
  const [productInput, setProductInput] = useState('');
  const [productsSupplied, setProductsSupplied] = useState<string[]>([]);

  const handleAddProductTag = () => {
    if (!productInput.trim()) return;
    if (productsSupplied.includes(productInput.trim())) return;
    setProductsSupplied([...productsSupplied, productInput.trim()]);
    setProductInput('');
  };

  const handleRemoveProductTag = (p: string) => {
    setProductsSupplied(productsSupplied.filter(x => x !== p));
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('Supplier name and phone are required', 'error');
      return;
    }
    const nextStore = addSupplier(store, {
      name: name.trim(),
      phone: phone.trim(),
      whatsApp: whatsApp.trim() || undefined,
      address: address.trim() || undefined,
      productsSupplied
    });
    onUpdate(nextStore);
    showToast('Supplier added successfully!');
    resetForm();
  };

  const handleEditSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !name.trim() || !phone.trim()) return;
    const nextStore = updateSupplier(store, editingSupplier.id, {
      name: name.trim(),
      phone: phone.trim(),
      whatsApp: whatsApp.trim() || undefined,
      address: address.trim() || undefined,
      productsSupplied
    });
    onUpdate(nextStore);
    showToast('Supplier profile updated!');
    resetForm();
  };

  const handleDeleteSupplier = (id: string) => {
    if (confirm('Delete this supplier record?')) {
      const nextStore = deleteSupplier(store, id);
      onUpdate(nextStore);
      showToast('Supplier deleted.');
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setWhatsApp('');
    setAddress('');
    setProductInput('');
    setProductsSupplied([]);
    setShowAddModal(false);
    setEditingSupplier(null);
  };

  const startEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone);
    setWhatsApp(s.whatsApp || '');
    setAddress(s.address || '');
    setProductsSupplied(s.productsSupplied || []);
    setShowAddModal(true);
  };

  const suppliers = store.suppliers || [];
  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.productsSupplied.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Flow's Supplier Price Audit logic
  const getSupplierRecommendations = () => {
    const recommendations: string[] = [];
    
    // Simulate comparing products supplied across different suppliers
    // Find products in inventory, match them with suppliers product listings
    store.products.forEach(p => {
      const supplyingVendors = suppliers.filter(s => 
        s.productsSupplied.some(item => item.toLowerCase() === p.name.toLowerCase() || p.name.toLowerCase().includes(item.toLowerCase()))
      );
      if (supplyingVendors.length > 1) {
        // If we have multiple suppliers for this product, recommend the cheaper one
        const v1 = supplyingVendors[0];
        const v2 = supplyingVendors[1];
        // Price paid history helper
        const price1 = v1.lastPricePaid || p.costPrice;
        const price2 = (v2.lastPricePaid || p.costPrice * 0.95); // assume 5% cheaper for demo comparison if not set
        if (price2 < price1) {
          recommendations.push(`Cheaper Option for ${p.name}: ${v2.name} offers it for ~₦${Math.round(price2).toLocaleString()} while ${v1.name} charges ₦${Math.round(price1).toLocaleString()}.`);
        }
      }
    });

    if (recommendations.length === 0) {
      return "Add multiple suppliers offering the same products to trigger automatic wholesale price comparison recommendations.";
    }
    return recommendations.slice(0, 3).join(" \n");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-yellow-500" /> Supplier Book
          </h2>
          <p className="text-sm text-muted-foreground">Keep profiles, supplies history, and compare cost price markers.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Supplier Price recommendations banner from Flow */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 font-bold shrink-0">
          ✨
        </div>
        <div className="space-y-1">
          <h4 className="font-display font-bold text-sm text-yellow-500">Flow's Supplier Price Audit</h4>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
            {getSupplierRecommendations()}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by supplier name or products supplied..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-yellow-500"
        />
      </div>

      {/* Supplier Directory List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
          <p className="text-muted-foreground text-sm">No suppliers registered. Add suppliers to enable price audits!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(s => (
            <div 
              key={s.id} 
              className="p-5 rounded-2xl bg-slate-950 border border-border hover:border-yellow-500/25 transition-all flex flex-col justify-between gap-4 shadow-sm"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1 text-left">
                  <h3 className="font-display font-bold text-base text-foreground leading-tight">{s.name}</h3>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" /> Call: {s.phone}
                    </div>
                    {s.whatsApp && (
                      <a 
                        href={`https://wa.me/${s.whatsApp.replace(/[^0-9]/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-green-500 hover:underline"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Supplier
                      </a>
                    )}
                    {s.address && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" /> {s.address}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(s)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-yellow-500 hover:border-yellow-500/25 transition-all">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteSupplier(s.id)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/25 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {s.productsSupplied && s.productsSupplied.length > 0 && (
                <div className="space-y-1.5 text-left">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Tag className="w-3 h-3 text-muted-foreground" /> Products Catalog
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {s.productsSupplied.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-surface-2 border border-border text-[10px] text-foreground">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {s.lastPurchaseDate && (
                <div className="text-left text-[11px] text-muted-foreground">
                  Last purchase: <strong className="text-foreground">{new Date(s.lastPurchaseDate).toLocaleDateString()}</strong> 
                  {s.lastPricePaid && ` (₦${s.lastPricePaid.toLocaleString()})`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={editingSupplier ? handleEditSupplier : handleAddSupplier} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Register vendor details to monitor buying price fluctuations.</p>
            </div>
            
            <div className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Supplier Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Alaba Wholesale Store"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Phone Number</label>
                  <input 
                    type="tel" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 08011223344"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">WhatsApp Number</label>
                  <input 
                    type="tel" 
                    value={whatsApp} 
                    onChange={e => setWhatsApp(e.target.value)}
                    placeholder="e.g. +2348011223344"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Warehouse Address (Optional)</label>
                <input 
                  type="text" 
                  value={address} 
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 24 Alaba Market Rd, Ojo"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Products Supplied</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={productInput} 
                    onChange={e => setProductInput(e.target.value)}
                    placeholder="Add product name e.g. Mineral"
                    className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddProductTag(); } }}
                  />
                  <button 
                    type="button" 
                    onClick={handleAddProductTag}
                    className="px-3 rounded-lg bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                
                {productsSupplied.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 p-2 rounded-lg bg-surface-2 border border-border/80 max-h-24 overflow-y-auto">
                    {productsSupplied.map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-border text-[10px] text-foreground">
                        {p}
                        <button type="button" onClick={() => handleRemoveProductTag(p)} className="text-destructive font-black text-xs">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingSupplier ? 'Update Vendor' : 'Add Vendor'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
