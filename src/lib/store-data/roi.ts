import { StoreData, Investment, Loan, Withdrawal } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Smart ROI System Helpers ──────────────────────────────────────────
export function addManualInvestment(store: StoreData, amount: number, note: string, source: string, reason?: string): StoreData {
  const newInv: Investment = {
    id: generateId(),
    amount,
    note,
    date: new Date().toISOString(),
    type: 'additional',
    source,
    reason,
  };

  const updated = {
    ...store,
    investments: [newInv, ...(store.investments || [])],
    cashBalance: source === 'Cash Drawer' ? Math.round(((store.cashBalance || 0) + amount) * 100) / 100 : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.round(((store.bankBalance || 0) + amount) * 100) / 100 : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.round(((store.walletBalance || 0) + amount) * 100) / 100 : (store.walletBalance || 0),
  };

  saveStore(updated);
  return updated;
}

export function deleteManualInvestment(store: StoreData, id: string): StoreData {
  const inv = (store.investments || []).find(i => i.id === id);
  if (!inv) return store;

  const source = inv.source || 'Cash Drawer';
  const updated = {
    ...store,
    investments: (store.investments || []).filter(i => i.id !== id),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - inv.amount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - inv.amount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - inv.amount) * 100) / 100) : (store.walletBalance || 0),
  };

  saveStore(updated);
  return updated;
}

export function addLoan(store: StoreData, amount: number, source: string, note?: string, dueDate?: string): StoreData {
  const newLoan: Loan = {
    id: generateId(),
    amount,
    source,
    date: new Date().toISOString(),
    note,
    status: 'active',
    dueDate,
  };

  const updated = {
    ...store,
    loans: [newLoan, ...(store.loans || [])],
    liabilities: Math.round(((store.liabilities || 0) + amount) * 100) / 100,
    cashBalance: source === 'Cash Drawer' ? Math.round(((store.cashBalance || 0) + amount) * 100) / 100 : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.round(((store.bankBalance || 0) + amount) * 100) / 100 : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.round(((store.walletBalance || 0) + amount) * 100) / 100 : (store.walletBalance || 0),
  };

  saveStore(updated);
  return updated;
}

export function deleteLoan(store: StoreData, id: string): StoreData {
  const loan = (store.loans || []).find(l => l.id === id);
  if (!loan) return store;

  const source = loan.source || 'Cash Drawer';
  const updated = {
    ...store,
    loans: (store.loans || []).filter(l => l.id !== id),
    liabilities: Math.max(0, Math.round(((store.liabilities || 0) - loan.amount) * 100) / 100),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - loan.amount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - loan.amount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - loan.amount) * 100) / 100) : (store.walletBalance || 0),
  };

  saveStore(updated);
  return updated;
}

export function repayLoan(store: StoreData, id: string, amount: number): StoreData {
  const loans = store.loans || [];
  const loanIndex = loans.findIndex(l => l.id === id);
  if (loanIndex === -1) return store;

  const loan = loans[loanIndex];
  const source = loan.source || 'Cash Drawer';
  // Never let a repayment exceed what's actually still owed on this loan —
  // without this, overpaying (e.g. a typo) would deduct the full typed
  // amount from cash/bank/wallet and reduce total liabilities by more than
  // this loan actually accounted for, silently corrupting both balances.
  const effectiveAmount = Math.min(amount, loan.amount);

  const updatedLoans = [...loans];
  const updatedLoan = {
    ...loan,
    amount: Math.max(0, Math.round((loan.amount - effectiveAmount) * 100) / 100),
  };
  if (updatedLoan.amount <= 0) {
    updatedLoan.status = 'repaid';
  }
  updatedLoans[loanIndex] = updatedLoan as Loan;

  const updated = {
    ...store,
    loans: updatedLoans,
    liabilities: Math.max(0, Math.round(((store.liabilities || 0) - effectiveAmount) * 100) / 100),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - effectiveAmount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - effectiveAmount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - effectiveAmount) * 100) / 100) : (store.walletBalance || 0),
  };

  saveStore(updated);
  return updated;
}

export function addWithdrawal(store: StoreData, amount: number, note?: string): StoreData {
  const newWithdrawal: Withdrawal = {
    id: generateId(),
    amount,
    date: new Date().toISOString(),
    note,
  };

  const updated = {
    ...store,
    withdrawals: [newWithdrawal, ...(store.withdrawals || [])],
    cashBalance: Math.max(0, Math.round(((store.cashBalance || 0) - amount) * 100) / 100),
  };

  saveStore(updated);
  return updated;
}

export function deleteWithdrawal(store: StoreData, id: string): StoreData {
  const w = (store.withdrawals || []).find(x => x.id === id);
  if (!w) return store;

  const updated = {
    ...store,
    withdrawals: (store.withdrawals || []).filter(x => x.id !== id),
    cashBalance: Math.round(((store.cashBalance || 0) + w.amount) * 100) / 100,
  };

  saveStore(updated);
  return updated;
}
