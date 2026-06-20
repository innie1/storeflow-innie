import { useState } from 'react';
import { StoreData, Customer } from '@/types/store';
import { addCustomer, updateCustomer, deleteCustomer } from '@/lib/store-data';
import { 
  Users, UserPlus, Phone, MapPin, Search, Trophy, Sparkles, AlertCircle, Edit, Trash2, Calendar, FileText
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface CustomersProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Customers({ store, onUpdate }: CustomersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('Name and phone are required', 'error');
      return;
    }
    const nextStore = addCustomer(store, { name: name.trim(), phone: phone.trim(), address: address.trim() || undefined });
    onUpdate(nextStore);
    showToast('Customer added successfully!');
    resetForm();
  };

  const handleEditCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !name.trim() || !phone.trim()) return;
    const nextStore = updateCustomer(store, editingCustomer.id, { name: name.trim(), phone: phone.trim(), address: address.trim() || undefined });
    onUpdate(nextStore);
    showToast('Customer updated successfully!');
    resetForm();
  };

  const handleDeleteCustomer = (id: string) => {
    if (confirm('Are you sure you want to remove this customer?')) {
      const nextStore = deleteCustomer(store, id);
      onUpdate(nextStore);
      showToast('Customer deleted.');
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setShowAddModal(false);
    setEditingCustomer(null);
  };

  const startEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address || '');
    setShowAddModal(true);
  };

  const customers = store.customers || [];
  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  // Flow customer classification
  const isValuable = (c: Customer) => c.totalPurchases > 10000 || c.visitsCount >= 5;
  const isInactive = (c: Customer) => {
    if (!c.lastPurchaseDate) return true;
    const daysSince = (Date.now() - new Date(c.lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 14;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-yellow-500" /> Customer Book
          </h2>
          <p className="text-sm text-muted-foreground">Manage client relationships, debt levels, and loyalty rewards.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Customer summary analysis banner from Flow */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 font-bold shrink-0">
          ✨
        </div>
        <div className="space-y-1">
          <h4 className="font-display font-bold text-sm text-yellow-500">Flow's Relationship Check</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            I found <strong className="text-foreground">{customers.filter(isValuable).length} valuable VIPs</strong> who buy regularly and <strong className="text-foreground">{customers.filter(isInactive).length} inactive clients</strong> who haven't logged purchases recently. Target inactive clients with discounts to reactivate them!
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-yellow-500"
        />
      </div>

      {/* Customer Directory List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
          <p className="text-muted-foreground text-sm">No customers found. Click Add Customer to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => {
            const vip = isValuable(c);
            const inactive = isInactive(c);
            return (
              <div 
                key={c.id} 
                className="p-5 rounded-2xl bg-slate-950 border border-border hover:border-yellow-500/25 transition-all flex flex-col justify-between gap-4 shadow-sm"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-base text-foreground leading-tight">{c.name}</h3>
                      {vip && (
                        <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-[10px] font-bold flex items-center gap-1 border border-yellow-500/20">
                          <Trophy className="w-2.5 h-2.5" /> VIP
                        </span>
                      )}
                      {inactive && (
                        <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-bold flex items-center gap-1 border border-destructive/20">
                          <AlertCircle className="w-2.5 h-2.5" /> Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" /> {c.phone}
                    </div>
                    {c.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" /> {c.address}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(c)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-yellow-500 hover:border-yellow-500/25 transition-all">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteCustomer(c.id)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/25 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <hr className="border-border/60" />

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-surface-2 border border-border/80">
                    <p className="text-[10px] text-muted-foreground uppercase font-sans tracking-wide">Total Spent</p>
                    <p className="font-display font-bold text-sm text-foreground mt-0.5">₦{c.totalPurchases.toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-2 border border-border/80">
                    <p className="text-[10px] text-muted-foreground uppercase font-sans tracking-wide">Owed Debt</p>
                    <p className={`font-display font-bold text-sm mt-0.5 ${c.outstandingDebt > 0 ? 'text-destructive font-black' : 'text-success'}`}>
                      ₦{c.outstandingDebt.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-2 border border-border/80">
                    <p className="text-[10px] text-muted-foreground uppercase font-sans tracking-wide">Coins Earned</p>
                    <p className="font-display font-bold text-sm text-yellow-500 mt-0.5 flex items-center justify-center gap-1">
                      🪙 {c.loyaltyPoints}
                    </p>
                  </div>
                </div>

                {c.purchaseHistory && c.purchaseHistory.length > 0 && (
                  <div className="mt-1 space-y-1.5 text-left">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <FileText className="w-3 h-3 text-muted-foreground" /> Last Purchase ({c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString() : ''})
                    </span>
                    <p className="text-xs text-muted-foreground truncate">{c.purchaseHistory[0].items}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={editingCustomer ? handleEditCustomer : handleAddCustomer} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Register customer contact for debt ledger & rewards tracking.</p>
            </div>
            
            <div className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Full Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Kola Adesina"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Phone Number</label>
                <input 
                  type="tel" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 08012345678"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Address (Optional)</label>
                <input 
                  type="text" 
                  value={address} 
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 15 Oba Akran Ave, Ikeja"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingCustomer ? 'Update Profile' : 'Add Profile'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
