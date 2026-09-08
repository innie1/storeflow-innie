import { useState } from 'react';
import { suggestCustomers } from '@/lib/customer-suggest';
import { StoreData, Customer } from '@/types/store';
import { addCustomer, updateCustomer, deleteCustomer } from '@/lib/store-data';
import { 
  Users, UserPlus, Phone, MapPin, Search, Trophy, Sparkles, AlertCircle, ChevronDown, Edit, Trash2, Calendar, FileText, MessageCircle
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getCustomerActivitySignals } from '@/lib/business-insights';
import { owedByCustomer } from '@/lib/flow-service-brain';
import ScrollLock from '@/components/ScrollLock';

interface CustomersProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Customers({ store, onUpdate }: CustomersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  /** One at a time: the point is a list you can scan, not a stack of open cards. */
  const [expanded, setExpanded] = useState<string | null>(null);
  
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

  const customers = Array.isArray(store.customers) ? store.customers : [];
  const activitySignals = getCustomerActivitySignals(store);
  const signalByCustomer = new Map(activitySignals.map(signal => [signal.customer.id, signal]));
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

  const openFollowUp = (customer: Customer) => {
    const signal = signalByCustomer.get(customer.id);
    if (!signal) return;
    const digits = customer.phone.replace(/\D/g, '').replace(/^0/, '234');
    if (digits.length < 7) return showToast('Add a valid phone number first', 'error');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(signal.message)}`, '_blank', 'noopener,noreferrer');
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
        <div className="space-y-2">
          {filtered.map(c => {
            const vip = isValuable(c);
            const inactive = isInactive(c);
            const signal = signalByCustomer.get(c.id);
            const owed = owedByCustomer(store, c);
            const open = expanded === c.id;
            return (
              <div
                key={c.id}
                className={`rounded-2xl border bg-card transition-colors ${open ? 'border-primary/40' : 'border-border'}`}
              >
                {/*
                  One line at rest.
                  Every customer used to arrive as seven stacked sections in a
                  p-5 card - name, phone, a rule, three bordered stat boxes, a
                  last-purchase block and a message with its own send button -
                  so a book of twenty people was a very long scroll of mostly
                  zeroes. What a shop actually scans for is who owes money.
                  That is the line; the rest opens on a tap.
                */}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : c.id)}
                  className="w-full text-left px-3.5 py-3 flex items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-display font-bold text-sm truncate">{c.name}</span>
                      {vip && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
                      {inactive && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />}
                      {signal && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate mt-0.5">{c.phone}</span>
                  </span>

                  {owed > 0 ? (
                    <span className="text-xs font-display font-black text-amber-500 shrink-0">
                      ₦{owed.toLocaleString()}
                    </span>
                  ) : Number(c.totalPurchases || 0) > 0 ? (
                    <span className="text-xs font-display font-bold text-muted-foreground shrink-0">
                      ₦{Number(c.totalPurchases).toLocaleString()}
                    </span>
                  ) : null}

                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="px-3.5 pb-3.5 space-y-3 text-left">
                    {c.address && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                      </p>
                    )}

                    {/* Plain text, not three bordered boxes. The boxes were
                        most of the height and said ₦0 three times over for
                        anyone who had not bought yet. */}
                    <p className="text-xs text-muted-foreground">
                      Spent <b className="text-foreground">₦{Number(c.totalPurchases || 0).toLocaleString()}</b>
                      {owed > 0 && <> · owes <b className="text-amber-500">₦{owed.toLocaleString()}</b></>}
                      {c.loyaltyPoints > 0 && <> · {c.loyaltyPoints} coins</>}
                    </p>

                    {c.purchaseHistory && c.purchaseHistory.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Last {c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString() : ''} — {c.purchaseHistory[0].items}
                      </p>
                    )}

                    {signal && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5">
                        <p className="text-[10px] font-black uppercase text-primary">{signal.label}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{signal.message}</p>
                        <button type="button" onClick={() => openFollowUp(c)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white">
                          <MessageCircle className="h-3 w-3" /> Review & send on WhatsApp
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => startEdit(c)} className="flex-1 h-9 rounded-xl bg-surface-2 border border-border text-[11px] font-display font-bold flex items-center justify-center gap-1.5">
                        <Edit className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={() => handleDeleteCustomer(c.id)} className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-muted-foreground">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}><ScrollLock />
          <form 
            onSubmit={editingCustomer ? handleEditCustomer : handleAddCustomer} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
            onClick={e => e.stopPropagation()}
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
              
                {/* A duplicate here is not a tidiness problem: the same person
                    ends up with two records, their history splits between them,
                    and a debt filed under one is invisible from the other.
                    This is the moment to catch it, and picking is not the
                    answer on a form whose whole purpose is to create someone
                    new. */}
                {!editingCustomer && (() => {
                  const clashes = suggestCustomers(store.customers || [], name);
                  if (clashes.length === 0) return null;
                  return (
                    <p className="text-[11px] text-amber-500 font-semibold">
                      Already in your book: {clashes.slice(0, 2).map(c => `${c.customer.name} (${c.customer.phone})`).join(', ')}
                      {clashes.length > 2 ? ` +${clashes.length - 2} more` : ''}
                    </p>
                  );
                })()}
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
