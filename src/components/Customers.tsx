import { useState } from 'react';
import { suggestCustomers } from '@/lib/customer-suggest';
import { StoreData, Customer } from '@/types/store';
import { addCustomer, updateCustomer, deleteCustomer } from '@/lib/store-data';
import { 
  Users, UserPlus, Phone, MapPin, Search, Trophy, Sparkles, AlertCircle, ChevronDown, Edit, Trash2, Calendar, FileText, MessageCircle
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import ContactPickButton from '@/components/ContactPickButton';
import { getCustomerActivitySignals } from '@/lib/business-insights';
import { owedByCustomer } from '@/lib/flow-service-brain';
import { customerStanding, explainStanding } from '@/lib/customer-rhythm';
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
  // Was 14 days here and 30 everywhere else, so one customer could read
  // "gone quiet" on this screen and healthy on the next. And `if
  // (!lastPurchaseDate) return true` branded every customer added at the
  // counter as lapsed before they had ever bought anything.
  const isInactive = (c: Customer) => customerStanding(c) === 'quiet';
  const isNew = (c: Customer) => customerStanding(c) === 'new';

  const openFollowUp = (customer: Customer) => {
    const signal = signalByCustomer.get(customer.id);
    if (!signal) return;
    const digits = customer.phone.replace(/\D/g, '').replace(/^0/, '234');
    if (digits.length < 7) return showToast('Add a valid phone number first', 'error');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(signal.message)}`, '_blank', 'noopener,noreferrer');
  };

  const vipCount = customers.filter(isValuable).length;
  const inactiveCount = customers.filter(isInactive).length;
  const owingCount = customers.filter(customer => owedByCustomer(store, customer) > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-black text-xl text-foreground">Customer Book</h2>
          {/*
            One line of counts, in place of a paragraph explaining what a
            customer book is and a banner restating the same numbers in prose.
            A shop opening this screen is looking for a person, not a briefing.
          */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {customers.length} {customers.length === 1 ? 'customer' : 'customers'}
            {owingCount > 0 && <> · <span className="text-amber-500 font-bold">{owingCount} owing</span></>}
            {vipCount > 0 && <> · {vipCount} regular</>}
            {inactiveCount > 0 && <> · {inactiveCount} gone quiet</>}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs active:scale-95 transition shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 h-11 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {/* Customer Directory List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card/30 rounded-2xl border border-dashed border-border/80">
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
                    <span className="block font-display font-bold text-sm truncate">{c.name}</span>
                    {/*
                      Said in a word, on the line the phone number already
                      occupies.
                      This was a trophy and two coloured dots floating after
                      the name. Nobody was ever told what they meant, they were
                      6px shapes trying to sit level with 14px text, and three
                      of them could land in a row - so they read as specks
                      rather than information. A word needs no legend and sits
                      on the baseline, which is why it looks placed rather than
                      scattered.
                    */}
                    <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
                      {c.phone}
                      {isNew(c)
                        ? <> · <span className="text-muted-foreground">new</span></>
                        : inactive
                        ? <> · <span className="text-destructive font-semibold">gone quiet</span></>
                        : signal
                          ? <> · <span className="text-primary font-semibold">needs a message</span></>
                          : vip
                            ? <> · <span className="text-yellow-500 font-semibold">regular</span></>
                            : null}
                    </span>
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

                    <p className="text-[11px] text-muted-foreground">{explainStanding(c)}</p>
                    {c.purchaseHistory && c.purchaseHistory.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Last bought — {c.purchaseHistory[0].items}
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
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full p-2.5 pr-11 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                  <ContactPickButton onPick={(picked, pickedName) => {
                    setPhone(picked);
                    if (pickedName && !name.trim()) setName(pickedName);
                  }} />
                </div>
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
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-primary-foreground text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingCustomer ? 'Update Profile' : 'Add Profile'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
