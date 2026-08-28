import { useState, useMemo } from 'react';
import { StoreData, TabId, Product, Customer, Supplier, StaffMember, CommunicationMessage } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import Mascot from '@/components/Mascot';
import { showToast } from '@/components/Toast';
import { 
  MessageSquare, Users, Warehouse, Briefcase, PlusCircle, History, Send, Trash2, Search, Sparkles
} from 'lucide-react';

interface CommunicationCenterProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  currentUser: { name: string; role: string };
}

type SectionId = 'customers' | 'suppliers' | 'employees' | 'custom' | 'history';

export default function CommunicationCenter({ store, onUpdate, currentUser }: CommunicationCenterProps) {
  const [section, setSection] = useState<SectionId>('customers');
  
  // Search & Filter states
  const [custSearch, setCustSearch] = useState('');
  const [suppSearch, setSuppSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Selected entities
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [selectedSupp, setSelectedSupp] = useState<Supplier | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<StaffMember | null>(null);

  // Template sub-selections
  const [custTemplate, setCustTemplate] = useState<'debt' | 'loyalty' | 'new_product'>('debt');
  const [suppTemplate, setSuppTemplate] = useState<'price' | 'order'>('price');
  const [empTemplate, setEmpTemplate] = useState<'schedule' | 'performance' | 'deduction'>('schedule');

  // Input lists/checks
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [customPriceProducts, setCustomPriceProducts] = useState('');
  
  // Employee form parameters
  const [shiftDate, setShiftDate] = useState('');
  const [shiftTime, setShiftTime] = useState('08:00 AM - 04:00 PM');
  const [deductionAmount, setDeductionAmount] = useState('');
  const [deductionReason, setDeductionReason] = useState('');

  // Custom Message form
  const [customName, setCustomName] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customText, setCustomText] = useState('');

  // Live edited text
  const [reviewedText, setReviewedText] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  // Filtered lists
  const filteredCustomers = useMemo(() => {
    const term = custSearch.toLowerCase().trim();
    return (store.customers || []).filter(c => 
      c.name.toLowerCase().includes(term) || c.phone.includes(term)
    );
  }, [store.customers, custSearch]);

  const filteredSuppliers = useMemo(() => {
    const term = suppSearch.toLowerCase().trim();
    return (store.suppliers || []).filter(s => 
      s.name.toLowerCase().includes(term) || s.phone.includes(term)
    );
  }, [store.suppliers, suppSearch]);

  const filteredEmployees = useMemo(() => {
    const term = empSearch.toLowerCase().trim();
    return (store.staffMembers || []).filter(e => 
      e.name.toLowerCase().includes(term) || (e.phone && e.phone.includes(term))
    );
  }, [store.staffMembers, empSearch]);

  const filteredHistory = useMemo(() => {
    const term = historySearch.toLowerCase().trim();
    return (store.communicationHistory || []).filter(h => 
      h.recipientName.toLowerCase().includes(term) || 
      h.recipientPhone.includes(term) || 
      h.messageText.toLowerCase().includes(term)
    );
  }, [store.communicationHistory, historySearch]);

  // Bank details formatter
  const bankDetailsText = useMemo(() => {
    const p = store.profile?.payment;
    if (p && p.bankName && p.accountNumber) {
      return `${p.bankName} Account ${p.accountNumber} (${p.accountName || store.storeName})`;
    }
    return "(insert store account details)";
  }, [store.profile?.payment, store.storeName]);

  // Pre-generate Customer Message
  const generateCustomerMessage = (cust: Customer, type: 'debt' | 'loyalty' | 'new_product') => {
    if (type === 'debt') {
      const debt = cust.outstandingDebt || 0;
      return `Hello ${cust.name},\n\nThis is a reminder from ${store.storeName}.\n\nYour outstanding balance is ₦${debt.toLocaleString()}.\n\nPlease you can send it here (${bankDetailsText}) or visit the store at your convenience.\n\nThank you.`;
    }
    if (type === 'loyalty') {
      return `Hello ${cust.name},\n\nThank you for being one of our valued customers.\n\nWe appreciate your continued support.\n\n- ${store.storeName}`;
    }
    if (type === 'new_product') {
      const prodNames = selectedProducts.length > 0 ? selectedProducts.join(" and ") : "[Product Names]";
      return `Hello ${cust.name},\n\n${prodNames} are now available in our store.\n\nWe look forward to serving you.`;
    }
    return '';
  };

  // Pre-generate Supplier Message
  const generateSupplierMessage = (supp: Supplier, type: 'price' | 'order') => {
    if (type === 'price') {
      const items = customPriceProducts ? customPriceProducts.split('\n').filter(Boolean).map(x => `- ${x.trim()}`).join('\n') : "- [Product list]";
      return `Hello,\n\nPlease send your latest prices for:\n\n${items}\n\nThank you.`;
    }
    if (type === 'order') {
      const lowStockList = store.products.filter(p => p.quantity <= 3).map(p => `- ${p.name} (Qty left: ${p.quantity})`).join('\n');
      const list = lowStockList || "- [Low stock products list]";
      return `Hello,\n\nI would like to place an order for the following products:\n\n${list}\n\nPlease confirm availability.`;
    }
    return '';
  };

  // Pre-generate Employee Message
  const generateEmployeeMessage = (emp: StaffMember, type: 'schedule' | 'performance' | 'deduction') => {
    if (type === 'schedule') {
      const dateStr = shiftDate || "[Date]";
      return `Hello ${emp.name},\n\nThis is your shift schedule for tomorrow.\nShift Date: ${dateStr}\nShift Hours: ${shiftTime}\n\nPlease confirm you have received this.\n\nThank you,\n${store.storeName} Management`;
    }
    if (type === 'performance') {
      return `Hello ${emp.name},\n\nWe want to appreciate your excellent performance during your recent shift.\nThank you for your hard work and keeping our operations running smoothly!\n\nBest regards,\n${store.storeName} Management`;
    }
    if (type === 'deduction') {
      const amountStr = deductionAmount ? `₦${Number(deductionAmount).toLocaleString()}` : "₦[Amount]";
      const reasonStr = deductionReason ? deductionReason.trim() : "discrepancy / policy violation";
      return `Hello ${emp.name},\n\nThis is to notify you of a deduction of ${amountStr} from your account due to: ${reasonStr}.\n\nIf you have any questions, please meet with management.\n\nBest regards,\n${store.storeName} Management`;
    }
    return '';
  };

  // Handle entity selections
  const handleSelectCustomer = (c: Customer) => {
    setSelectedCust(c);
    setRecipientPhone(c.phone);
    setReviewedText(generateCustomerMessage(c, custTemplate));
  };

  const handleSelectSupplier = (s: Supplier) => {
    setSelectedSupp(s);
    setRecipientPhone(s.phone);
    setReviewedText(generateSupplierMessage(s, suppTemplate));
  };

  const handleSelectEmployee = (e: StaffMember) => {
    setSelectedEmp(e);
    setRecipientPhone(e.phone || '');
    setReviewedText(generateEmployeeMessage(e, empTemplate));
  };

  // Handle updates of settings changes on active templates
  const applyCustChange = (type: 'debt' | 'loyalty' | 'new_product', products = selectedProducts) => {
    setCustTemplate(type);
    if (selectedCust) {
      setReviewedText(generateCustomerMessage(selectedCust, type));
    }
  };

  const applySuppChange = (type: 'price' | 'order', textProds = customPriceProducts) => {
    setSuppTemplate(type);
    if (selectedSupp) {
      setReviewedText(generateSupplierMessage(selectedSupp, type));
    }
  };

  const applyEmpChange = (type: 'schedule' | 'performance' | 'deduction') => {
    setEmpTemplate(type);
    if (selectedEmp) {
      setReviewedText(generateEmployeeMessage(selectedEmp, type));
    }
  };

  // Trigger actual WhatsApp dispatch
  const handleSend = () => {
    if (!recipientPhone.trim()) {
      showToast("Recipient phone number is required!", "error");
      return;
    }
    if (!reviewedText.trim()) {
      showToast("Message text is empty!", "error");
      return;
    }

    let cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');
    // Format to international if local starts with 0
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      cleanPhone = '+234' + cleanPhone.slice(1);
    }

    // 1. Log in history
    const newLog: CommunicationMessage = {
      id: Math.random().toString(36).substring(2, 9),
      recipientType: section === 'customers' ? 'customer' :
                     section === 'suppliers' ? 'supplier' :
                     section === 'employees' ? 'employee' : 'custom',
      recipientName: section === 'customers' ? selectedCust?.name || 'Customer' :
                     section === 'suppliers' ? selectedSupp?.name || 'Supplier' :
                     section === 'employees' ? selectedEmp?.name || 'Staff' : customName || 'Custom Recipient',
      recipientPhone: cleanPhone,
      messageText: reviewedText,
      timestamp: new Date().toISOString(),
      status: 'sent',
      templateType: section === 'customers' ? custTemplate :
                    section === 'suppliers' ? suppTemplate :
                    section === 'employees' ? empTemplate : 'custom'
    };

    const nextHistory = [newLog, ...(store.communicationHistory || [])];
    const updatedStore = {
      ...store,
      communicationHistory: nextHistory
    };
    onUpdate(updatedStore);

    // 2. Open WhatsApp link offline filled message
    const waUrl = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(reviewedText)}`;
    window.open(waUrl, '_blank');
    showToast("Opening WhatsApp with drafted message!");
  };

  // Clear log history
  const handleClearHistory = () => {
    if (currentUser.role !== 'owner') {
      showToast("Only the store Owner can delete message logs", "error");
      return;
    }
    if (confirm("Delete all WhatsApp message logs from history?")) {
      const updatedStore = { ...store, communicationHistory: [] };
      onUpdate(updatedStore);
      showToast("Communication history cleared.");
    }
  };

  const navItem = (id: SectionId, label: string, icon: any) => {
    const isAct = section === id;
    return (
      <button
        onClick={() => {
          setSection(id);
          setReviewedText('');
          setRecipientPhone('');
        }}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-display font-bold transition-all cursor-pointer ${
          isAct ? 'bg-yellow-500 text-slate-950 font-black shadow-md' : 'bg-surface-2 text-muted-foreground hover:text-foreground'
        }`}
      >
        {icon} {label}
      </button>
    );
  };

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-yellow-500" /> WhatsApp Message Center
        </h2>
        <p className="text-sm text-muted-foreground">Draft and send smart WhatsApp messages to customer, supplier, and employee contacts fully offline.</p>
      </div>

      {/* Navigation Headers */}
      <div className="flex flex-wrap gap-2.5">
        {navItem('customers', 'Customers', <Users className="w-4 h-4" />)}
        {navItem('suppliers', 'Suppliers', <Warehouse className="w-4 h-4" />)}
        {navItem('employees', 'Staff Members', <Briefcase className="w-4 h-4" />)}
        {navItem('custom', 'Custom Message', <PlusCircle className="w-4 h-4" />)}
        {navItem('history', 'Log History', <History className="w-4 h-4" />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side Selector (8 Cols if details loaded, else 12) */}
        <div className={`col-span-1 lg:col-span-5 space-y-4`}>
          {section === 'customers' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                👥 Customer Registry
              </h3>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Search customer name or phone..."
                  value={custSearch}
                  onChange={e => setCustSearch(e.target.value)}
                  className="w-full p-2.5 pl-9 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No customer records match query.</p>
                ) : (
                  filteredCustomers.map(c => {
                    const isSel = selectedCust?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                          isSel ? 'border-yellow-500 bg-yellow-500/10' : 'border-border/60 hover:bg-surface-2/40'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <strong className="text-sm text-foreground">{c.name}</strong>
                          {c.outstandingDebt > 0 && (
                            <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                              Debt: ₦{c.outstandingDebt.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {section === 'suppliers' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                🏬 Supplier Directory
              </h3>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Search supplier name..."
                  value={suppSearch}
                  onChange={e => setSuppSearch(e.target.value)}
                  className="w-full p-2.5 pl-9 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No suppliers found.</p>
                ) : (
                  filteredSuppliers.map(s => {
                    const isSel = selectedSupp?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSelectSupplier(s)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                          isSel ? 'border-yellow-500 bg-yellow-500/10' : 'border-border/60 hover:bg-surface-2/40'
                        }`}
                      >
                        <strong className="text-sm text-foreground">{s.name}</strong>
                        <p className="text-xs text-muted-foreground font-mono">{s.phone}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {section === 'employees' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                💼 Employee Accounts
              </h3>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Search employee name..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  className="w-full p-2.5 pl-9 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {filteredEmployees.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No employee records found.</p>
                ) : (
                  filteredEmployees.map(e => {
                    const isSel = selectedEmp?.id === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleSelectEmployee(e)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                          isSel ? 'border-yellow-500 bg-yellow-500/10' : 'border-border/60 hover:bg-surface-2/40'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <strong className="text-sm text-foreground">{e.name}</strong>
                          <span className="text-[9px] uppercase font-bold text-yellow-500 px-1.5 py-0.5 rounded bg-surface-2">
                            {e.role}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{e.phone || "(no phone saved)"}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {section === 'custom' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                ✏️ Custom Recipient
              </h3>
              <div className="space-y-3 text-left">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-bold uppercase">Name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={e => {
                      setCustomName(e.target.value);
                    }}
                    placeholder="e.g. Kola Adewale"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-bold uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={e => {
                      setCustomPhone(e.target.value);
                      setRecipientPhone(e.target.value);
                    }}
                    placeholder="e.g. 08134567890"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-bold uppercase">Message Content</label>
                  <textarea
                    rows={4}
                    value={customText}
                    onChange={e => {
                      setCustomText(e.target.value);
                      setReviewedText(e.target.value);
                    }}
                    placeholder="Type custom text details here..."
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'history' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5">
              <h3 className="font-display font-bold text-base text-foreground flex justify-between items-center">
                <span>📋 Filter logs</span>
                {filteredHistory.length > 0 && (
                  <button 
                    onClick={handleClearHistory}
                    className="text-red-500 hover:text-red-600 font-bold text-xs cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear Log
                  </button>
                )}
              </h3>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Search message history..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="w-full p-2.5 pl-9 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Side Editor/Viewer Panel */}
        <div className="col-span-1 lg:col-span-7 space-y-4">
          {section !== 'history' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border/60">
                <h3 className="font-display font-bold text-base text-yellow-500 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Message Composer
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono bg-surface-2 px-2 py-0.5 rounded border border-border">
                  Offline Integration
                </span>
              </div>

              {/* Template Selectors */}
              {section === 'customers' && selectedCust && (
                <div className="space-y-3">
                  <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden p-0.5">
                    <button
                      onClick={() => applyCustChange('debt')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${custTemplate === 'debt' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Debt Reminder
                    </button>
                    <button
                      onClick={() => applyCustChange('loyalty')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${custTemplate === 'loyalty' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Loyalty Card
                    </button>
                    <button
                      onClick={() => applyCustChange('new_product')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${custTemplate === 'new_product' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      New Product
                    </button>
                  </div>

                  {custTemplate === 'new_product' && (
                    <div className="p-3 bg-surface-2 rounded-xl border border-border/80 space-y-2">
                      <label className="text-xs text-muted-foreground font-semibold">Select Products to Notify</label>
                      <div className="flex flex-wrap gap-2.5 max-h-32 overflow-y-auto">
                        {store.products.map(p => {
                          const has = selectedProducts.includes(p.name);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                const next = has ? selectedProducts.filter(x => x !== p.name) : [...selectedProducts, p.name];
                                setSelectedProducts(next);
                                applyCustChange('new_product', next);
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-display font-bold border transition-colors cursor-pointer ${
                                has ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {section === 'suppliers' && selectedSupp && (
                <div className="space-y-3">
                  <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden p-0.5">
                    <button
                      onClick={() => applySuppChange('price')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${suppTemplate === 'price' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Price Request
                    </button>
                    <button
                      onClick={() => applySuppChange('order')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${suppTemplate === 'order' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Order Request
                    </button>
                  </div>

                  {suppTemplate === 'price' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold">List Products (one per line)</label>
                      <textarea
                        rows={3}
                        value={customPriceProducts}
                        onChange={e => {
                          setCustomPriceProducts(e.target.value);
                          if (selectedSupp) {
                            setReviewedText(`Hello,\n\nPlease send your latest prices for:\n\n${e.target.value.split('\n').filter(Boolean).map(x => `- ${x.trim()}`).join('\n') || "- [Product list]"}\n\nThank you.`);
                          }
                        }}
                        placeholder="Peak Milk&#10;Dano Milk&#10;Rice"
                        className="w-full p-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-yellow-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {section === 'employees' && selectedEmp && (
                <div className="space-y-3">
                  <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden p-0.5">
                    <button
                      onClick={() => applyEmpChange('schedule')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${empTemplate === 'schedule' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Shift Schedule
                    </button>
                    <button
                      onClick={() => applyEmpChange('performance')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${empTemplate === 'performance' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Performance
                    </button>
                    <button
                      onClick={() => applyEmpChange('deduction')}
                      className={`flex-1 py-1.5 text-xs font-display font-bold rounded-md ${empTemplate === 'deduction' ? 'bg-yellow-500 text-slate-950 font-black' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Deduction Notice
                    </button>
                  </div>

                  {empTemplate === 'schedule' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase">Shift Date</label>
                        <input
                          type="date"
                          value={shiftDate}
                          onChange={e => {
                            setShiftDate(e.target.value);
                            if (selectedEmp) {
                              setReviewedText(`Hello ${selectedEmp.name},\n\nThis is your shift schedule for tomorrow.\nShift Date: ${e.target.value}\nShift Hours: ${shiftTime}\n\nPlease confirm you have received this.\n\nThank you,\n${store.storeName} Management`);
                            }
                          }}
                          className="w-full p-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase">Shift Hours</label>
                        <input
                          type="text"
                          value={shiftTime}
                          onChange={e => {
                            setShiftTime(e.target.value);
                            if (selectedEmp) {
                              setReviewedText(`Hello ${selectedEmp.name},\n\nThis is your shift schedule for tomorrow.\nShift Date: ${shiftDate || "[Date]"}\nShift Hours: ${e.target.value}\n\nPlease confirm you have received this.\n\nThank you,\n${store.storeName} Management`);
                            }
                          }}
                          placeholder="e.g. 08:00 AM - 04:00 PM"
                          className="w-full p-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {empTemplate === 'deduction' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase">Deduction Amount (₦)</label>
                        <input
                          type="number"
                          value={deductionAmount}
                          onChange={e => {
                            setDeductionAmount(e.target.value);
                            if (selectedEmp) {
                              setReviewedText(`Hello ${selectedEmp.name},\n\nThis is to notify you of a deduction of ₦${Number(e.target.value).toLocaleString()} from your account due to: ${deductionReason || "discrepancy / policy violation"}.\n\nIf you have any questions, please meet with management.\n\nBest regards,\n${store.storeName} Management`);
                            }
                          }}
                          placeholder="e.g. 1000"
                          className="w-full p-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase">Deduction Reason</label>
                        <input
                          type="text"
                          value={deductionReason}
                          onChange={e => {
                            setDeductionReason(e.target.value);
                            if (selectedEmp) {
                              setReviewedText(`Hello ${selectedEmp.name},\n\nThis is to notify you of a deduction of ₦${Number(deductionAmount).toLocaleString()} from your account due to: ${e.target.value || "discrepancy / policy violation"}.\n\nIf you have any questions, please meet with management.\n\nBest regards,\n${store.storeName} Management`);
                            }
                          }}
                          placeholder="e.g. Cash discrepancy in drawer"
                          className="w-full p-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live Preview & Final Review */}
              {((section === 'customers' && selectedCust) || 
                (section === 'suppliers' && selectedSupp) || 
                (section === 'employees' && selectedEmp) || 
                section === 'custom') ? (
                <div className="space-y-4 pt-2">
                  <div className="flex gap-3 bg-surface-2/65 p-3 rounded-xl border border-border/80">
                    <Mascot size={32} mood="happy" store={store} />
                    <div className="text-xs text-muted-foreground flex-1 leading-snug">
                      <strong>Flow Mascot</strong>
                      <p className="mt-0.5">I have generated the smart text template for you! Review the draft below, double check the recipient phone number, and tap send to open WhatsApp.</p>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <div className="space-y-1 text-left">
                      <label className="text-xs text-muted-foreground uppercase font-bold">Recipient Phone</label>
                      <input
                        type="text"
                        value={recipientPhone}
                        onChange={e => setRecipientPhone(e.target.value)}
                        placeholder="Enter phone number..."
                        className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="text-xs text-muted-foreground uppercase font-bold">Live Draft Review</label>
                      <textarea
                        rows={8}
                        value={reviewedText}
                        onChange={e => setReviewedText(e.target.value)}
                        className="w-full p-3 rounded-lg bg-slate-900 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 font-mono leading-relaxed"
                      />
                    </div>

                    <button
                      onClick={handleSend}
                      className="w-full p-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <Send className="w-4 h-4 fill-slate-950" /> Send via WhatsApp
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/35 mx-auto" />
                  <p className="text-sm text-muted-foreground">Select a contact from the registry to compose or generate a smart WhatsApp message.</p>
                </div>
              )}
            </div>
          )}

          {section === 'history' && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                📋 WhatsApp Logs History
              </h3>

              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredHistory.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <History className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground">No sent messages recorded in log history.</p>
                  </div>
                ) : (
                  filteredHistory.map(h => (
                    <div key={h.id} className="p-4 rounded-xl bg-surface-2 border border-border/80 space-y-2 text-left text-xs">
                      <div className="flex justify-between items-center">
                        <div>
                          <strong className="text-foreground text-sm">{h.recipientName}</strong>
                          <span className="ml-2 text-[9px] uppercase font-bold text-yellow-500 bg-card px-1.5 py-0.5 rounded border border-border/60">
                            {h.recipientType}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(h.timestamp).toLocaleDateString()} {new Date(h.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground font-mono bg-card/65 p-2 rounded border border-border/40 whitespace-pre-wrap leading-relaxed">
                        {h.messageText}
                      </p>

                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Recipient Phone: <strong className="text-foreground">{h.recipientPhone}</strong>
                        </span>
                        <button
                          onClick={() => {
                            const waUrl = `https://wa.me/${h.recipientPhone.replace('+', '')}?text=${encodeURIComponent(h.messageText)}`;
                            window.open(waUrl, '_blank');
                            showToast("Opening WhatsApp with archived message...");
                          }}
                          className="px-2.5 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-[10px] transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Send className="w-2.5 h-2.5 fill-slate-950" /> Resend
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
