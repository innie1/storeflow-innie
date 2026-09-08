import type { Customer, StoreData } from '@/types/store';
import { getBusinessTemplate, isServiceFirstBusiness } from '@/lib/business-runtime';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';

/**
 * What Flow needs to know to sound like it works here.
 *
 * The engine was written for a shop that keeps stock. Asked how the business
 * was doing, it answered a laundry with inventory value and "products needing
 * restocking"; asked what was selling, it counted units. None of that is a
 * laundry's business — its stock is other people's clothes, and what it has to
 * account for is work in progress, promised days, and who is owed what.
 *
 * This module holds the service half: the facts, and the words for them.
 */

export interface ServiceSnapshot {
  /** Bundles taken in and not yet handed back. */
  open: number;
  /** Past the day they were promised. */
  overdue: number;
  /** Finished and waiting for collection. */
  ready: number;
  /** Taken in today. */
  today: number;
  /** Money still owed across the book. */
  owed: number;
  /** How many people that is spread across — not how many customers exist. */
  owedBy: number;
  /** Services the shop offers. */
  services: string[];
  customers: number;
}

export function isServiceShop(store: StoreData | null | undefined): boolean {
  return !!store && isServiceFirstBusiness(store);
}

/** What the shop calls a job: "laundry order", "appointment", "job". */
export function workNoun(store: StoreData): string {
  const template = getBusinessTemplate(store);
  return String(template.labels.orderNoun || 'job').toLowerCase();
}

export function serviceSnapshot(store: StoreData): ServiceSnapshot {
  const accessCode = String(store.accessCode || '');
  const records = accessCode ? getLocalLaundryRecords(accessCode) : [];
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const open = records.filter(record => record.workflowStage !== 'collected');
  const overdue = open.filter(record => {
    const due = new Date(record.promisedFor || '').getTime();
    return Number.isFinite(due) && due < now;
  });

  return {
    open: open.length,
    overdue: overdue.length,
    ready: open.filter(record => record.workflowStage === 'ready').length,
    today: records.filter(record => new Date(record.createdAt).getTime() >= midnight.getTime()).length,
    owed: openDebts(store).reduce((sum, payment) => sum + Math.max(0, Number(payment.balance) || 0), 0),
    owedBy: debtorNames(store).length,
    services: (store.products || [])
      .filter(product => product.isService && !product.discontinued)
      .map(product => product.name),
    customers: (store.customers || []).length,
  };
}

const money = (value: number) => `₦${Math.round(value || 0).toLocaleString()}`;

/** Unsettled balances, wherever they came from. */
function openDebts(store: StoreData) {
  return (store.pendingPayments || []).filter(payment => payment.status === 'pending' && Number(payment.balance) > 0);
}

const normaliseName = (value: unknown) => String(value || '').trim().toLowerCase();

function debtorNames(store: StoreData): string[] {
  return Array.from(new Set(openDebts(store).map(payment => normaliseName(payment.customerName)).filter(Boolean)));
}

/**
 * What one customer owes.
 *
 * Reads the pending payments rather than `customer.outstandingDebt`, which the
 * laundry flow never writes: recordLaundryPayment opens a pending payment and
 * leaves the customer record alone.
 */
export function owedByCustomer(store: StoreData, customer: { name?: string; phone?: string }): number {
  const name = normaliseName(customer.name);
  const phone = String(customer.phone || '').replace(/\D/g, '');
  return openDebts(store)
    .filter(payment => {
      const paymentPhone = String(payment.customerPhone || '').replace(/\D/g, '');
      if (phone && paymentPhone) return phone === paymentPhone;
      return normaliseName(payment.customerName) === name;
    })
    .reduce((sum, payment) => sum + Math.max(0, Number(payment.balance) || 0), 0)
    + Number((customer as any).outstandingDebt || 0);
}

/** How the shop is doing, in the terms a service shop actually uses. */
export function serviceOverview(store: StoreData): string {
  const snapshot = serviceSnapshot(store);
  const noun = workNoun(store);
  const lines = [
    `**${store.storeName || 'Your shop'}** — ${snapshot.open} ${noun}${snapshot.open === 1 ? '' : 's'} in the shop right now.`,
    '',
  ];

  if (snapshot.overdue > 0) {
    lines.push(`⚠️ **${snapshot.overdue}** past the promised day. That is the first thing I would deal with.`);
  } else if (snapshot.open > 0) {
    lines.push('✅ Nothing is past its promised day.');
  }

  if (snapshot.ready > 0) lines.push(`📦 **${snapshot.ready}** finished and waiting to be collected.`);
  if (snapshot.today > 0) lines.push(`📥 **${snapshot.today}** taken in today.`);
  if (snapshot.owed > 0) lines.push(`💳 **${money(snapshot.owed)}** still owed across ${snapshot.owedBy} customer${snapshot.owedBy === 1 ? '' : 's'}.`);

  if (!snapshot.services.length) {
    lines.push('', 'You have no services set up yet, so I cannot price anything. Add one in your price list.');
  }
  return lines.join('\n');
}

/** What is on the floor, replacing the stock answer. */
export function serviceWorkload(store: StoreData): string {
  const snapshot = serviceSnapshot(store);
  const noun = workNoun(store);
  if (snapshot.open === 0) return `Nothing in the shop right now. Every ${noun} has been handed back.`;

  const parts = [`**${snapshot.open}** ${noun}${snapshot.open === 1 ? '' : 's'} in the shop.`];
  if (snapshot.overdue) parts.push(`**${snapshot.overdue}** past the promised day.`);
  if (snapshot.ready) parts.push(`**${snapshot.ready}** ready for collection.`);
  return parts.join('\n');
}

/** The services offered, replacing the best-sellers answer. */
export function serviceList(store: StoreData): string {
  const snapshot = serviceSnapshot(store);
  if (!snapshot.services.length) return 'You have not set up any services yet. Add one in your price list and I can price work for you.';
  return `You offer ${snapshot.services.length} service${snapshot.services.length === 1 ? '' : 's'}:\n${
    snapshot.services.map((name, index) => `${index + 1}. **${name}**`).join('\n')
  }`;
}

/* ------------------------------------------------------------------ *
 * Customers                                                          *
 * ------------------------------------------------------------------ */

function norm(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * The customer a question is about.
 *
 * Matched on the whole name, then on any single name in it, so "how much does
 * Chidi owe" finds "Chidi Okeke" without the surname.
 */
export function findCustomer(store: StoreData, query: string): Customer | null {
  const needle = norm(query);
  if (!needle) return null;
  const customers = (store.customers || []).filter(Boolean);

  const exact = customers.find(customer => norm(customer.name) === needle);
  if (exact) return exact;

  const contained = customers.find(customer => needle.includes(norm(customer.name)));
  if (contained) return contained;

  // A single word in the question matching a single word of a name.
  const words = needle.split(' ').filter(word => word.length >= 3);
  return customers.find(customer => {
    const parts = norm(customer.name).split(' ').filter(Boolean);
    return parts.some(part => part.length >= 3 && words.includes(part));
  }) || null;
}

const daysSince = (iso?: string) => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / 86_400_000) : null;
};

/** Everything the shop knows about one customer, said plainly. */
export function customerBrief(store: StoreData, customer: Customer): string {
  const away = daysSince(customer.lastPurchaseDate);
  const owed = owedByCustomer(store, customer);
  const spent = Number(customer.totalPurchases || 0);
  const visits = Number(customer.visitsCount || 0);

  const accessCode = String(store.accessCode || '');
  const theirs = accessCode
    ? getLocalLaundryRecords(accessCode).filter(record => norm(record.customerName) === norm(customer.name))
    : [];
  const openOnes = theirs.filter(record => record.workflowStage !== 'collected');

  const lines = [`**${customer.name}**`];
  if (customer.phone) lines.push(`📞 ${customer.phone}`);
  lines.push(
    `${visits} visit${visits === 1 ? '' : 's'} · ${money(spent)} spent all time`,
  );
  if (owed > 0) lines.push(`💳 Owes **${money(owed)}**`);
  if (away === null) lines.push('Has not been in yet.');
  else if (away === 0) lines.push('Was in today.');
  else lines.push(`Last in **${away} day${away === 1 ? '' : 's'}** ago.`);

  if (openOnes.length) {
    lines.push('', `In the shop now: ${openOnes.map(record => `${record.tagCode} (${record.workflowStage || 'received'})`).join(', ')}`);
  }
  if (away !== null && away >= 30) {
    lines.push('', 'They have gone quiet. Worth a message.');
  }
  return lines.join('\n');
}

/** Customers worth the owner's attention right now. */
export function customerRoundup(store: StoreData): string {
  const customers = (store.customers || []).filter(Boolean);
  if (!customers.length) return 'No customers saved yet. Take a phone number at the counter and I can keep track of them.';

  const owing = customers.filter(customer => owedByCustomer(store, customer) > 0);
  const lapsed = customers.filter(customer => {
    const away = daysSince(customer.lastPurchaseDate);
    return away !== null && away >= 30;
  });

  const lines = [`You have **${customers.length} customer${customers.length === 1 ? '' : 's'}**.`];
  if (owing.length) {
    const total = owing.reduce((sum, customer) => sum + owedByCustomer(store, customer), 0);
    lines.push('', `💳 **${owing.length}** owe you ${money(total)}:`);
    lines.push(...owing.slice(0, 5).map(customer => `• ${customer.name} — ${money(owedByCustomer(store, customer))}`));
  }
  if (lapsed.length) {
    lines.push('', `🕰️ **${lapsed.length}** have not been in for a month or more:`);
    lines.push(...lapsed.slice(0, 5).map(customer => `• ${customer.name}`));
  }
  if (!owing.length && !lapsed.length) lines.push('', 'Nobody owes you and nobody has gone quiet. That is a healthy book.');
  return lines.join('\n');
}

/**
 * What Flow can be asked, in this shop's own vocabulary.
 *
 * The help list offered a laundry "Sell 2 Indomie", "Add 5 Milo" and "What's
 * low?" — three things it cannot do and one it has no answer for. A shop that
 * has never sold a tin of anything was being taught a grocer's commands.
 */
export function serviceHelp(store: StoreData): string {
  if (!isServiceShop(store)) {
    return [
      'I can operate your store locally. Try:',
      '• **Sell 2 Indomie**',
      '• **Add 5 Milo**',
      '• **Undo that**',
      '• **How is my store?**',
      "• **What's low?**",
      '• **Show my best sellers**',
      '• **How much did I spend?**',
      '• **Show my finances**',
      '• **Do I have new orders?**',
      '• **Why are sales down?**',
      '• **What should I fix?**',
    ].join('\n');
  }

  const noun = workNoun(store);
  const snapshot = serviceSnapshot(store);
  const someone = (store.customers || []).find(Boolean)?.name;

  return [
    'I know this shop. Try:',
    '• **How is my shop?** — what is in, what is late, what is owed',
    `• **What is in the shop?** — the ${noun}s on the floor`,
    '• **What do I offer?** — your services and prices',
    someone
      ? `• **Who is ${String(someone).split(' ')[0]}?** — anything about a customer`
      : '• **Who is [customer name]?** — anything about a customer',
    '• **Tell me about my customers** — who owes, who has gone quiet',
    '• **How much did I spend?** — expenses',
    '• **What should I fix?** — what I would deal with first',
    snapshot.overdue > 0
      ? `\nRight now I would start with the **${snapshot.overdue}** past their promised day.`
      : '',
  ].filter(Boolean).join('\n');
}
