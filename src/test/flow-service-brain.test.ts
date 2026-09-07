import { describe, expect, it } from 'vitest';
import { responseFor, understand } from '@/lib/flow-operating-engine';
import { customerBrief, findCustomer, serviceHelp, serviceOverview } from '@/lib/flow-service-brain';
import { getSeasonalPredictions, getWeatherInsights } from '@/lib/manager-intel';

/**
 * Flow, working in a shop that sells work rather than goods.
 *
 * The engine was written for a grocer. Asked how the business was doing it
 * answered a laundry with inventory value and products needing restocking;
 * asked what was selling it counted units; and its help offered "Sell 2
 * Indomie", "Add 5 Milo" and "What's low?" — three things a laundry cannot do
 * and one it has no answer for. The Flow page told it that rain means "pantry
 * staples tend to hold steady" and suggested it stock Biscuit Packs.
 *
 * None of that is a laundry's business. Its stock is other people's clothes.
 */

const laundry = {
  storeName: 'Shine Laundry',
  storeType: 'laundry',
  category: 'retail',
  accessCode: 'TEST01',
  products: [
    { id: 'sv1', name: 'Wash & Iron', isService: true, sellingPrice: 500, costPrice: 0, quantity: 0 },
    { id: 'sv2', name: 'Dry Cleaning', isService: true, sellingPrice: 1500, costPrice: 0, quantity: 0 },
  ],
  sales: [],
  customers: [
    { id: 'c1', name: 'Chidi Okeke', phone: '08031234567', totalPurchases: 45000, outstandingDebt: 2000, visitsCount: 9, loyaltyPoints: 0, purchaseHistory: [], lastPurchaseDate: new Date(Date.now() - 40 * 864e5).toISOString() },
    { id: 'c2', name: 'Ada Nwosu', phone: '08039998888', totalPurchases: 12000, outstandingDebt: 0, visitsCount: 3, loyaltyPoints: 0, purchaseHistory: [], lastPurchaseDate: new Date().toISOString() },
  ],
  pendingPayments: [{ id: 'p1', status: 'pending', balance: 2000 }],
} as any;

const shop = { storeName: 'Corner Store', storeType: 'provision', category: 'retail', products: [], sales: [], customers: [] } as any;

const ask = (question: string) => responseFor(laundry, understand(laundry, question));

describe('it answers as a laundry, not a grocer', () => {
  it('describes the shop by the work in it, not by inventory value', () => {
    const reply = ask("How's the shop?");
    expect(reply).toContain('laundry order');
    expect(reply).not.toMatch(/inventory value/i);
    expect(reply).not.toMatch(/restock/i);
  });

  it('answers "what do I offer" with the services', () => {
    const reply = ask('What do I offer?');
    expect(reply).toContain('Wash & Iron');
    expect(reply).toContain('Dry Cleaning');
  });

  it('offers help a laundry can actually act on', () => {
    const help = serviceHelp(laundry);
    expect(help).not.toContain('Indomie');
    expect(help).not.toContain('Milo');
    expect(help).not.toContain("What's low?");
    expect(help).toContain('What is in the shop?');
    // It names a real customer of theirs rather than a placeholder.
    expect(help).toContain('Who is Chidi?');
  });

  it("leaves a product shop's help exactly as it was", () => {
    const help = serviceHelp(shop);
    expect(help).toContain('Sell 2 Indomie');
    expect(help).toContain("What's low?");
  });

  it('says something useful when no services exist yet', () => {
    const bare = { ...laundry, products: [] };
    expect(serviceOverview(bare)).toContain('no services set up');
  });
});

describe('it knows the customers by name', () => {
  it('finds someone from a first name in a question', () => {
    expect(findCustomer(laundry, 'how much does Chidi owe?')?.name).toBe('Chidi Okeke');
    expect(findCustomer(laundry, 'tell me about Ada')?.name).toBe('Ada Nwosu');
  });

  it('does not invent a customer who is not there', () => {
    expect(findCustomer(laundry, 'who is Emeka?')).toBeNull();
  });

  it('answers with what the shop actually knows about them', () => {
    const reply = ask('Who is Chidi?');
    expect(reply).toContain('Chidi Okeke');
    expect(reply).toContain('08031234567');
    expect(reply).toContain('₦2,000');
    expect(reply).toContain('40 days');
  });

  it('says when someone has gone quiet', () => {
    expect(customerBrief(laundry, laundry.customers[0])).toContain('gone quiet');
    expect(customerBrief(laundry, laundry.customers[1])).toContain('Was in today');
  });

  it('rounds up who owes and who has lapsed', () => {
    const reply = ask('Tell me about my customers');
    expect(reply).toContain('owe you');
    expect(reply).toContain('Chidi Okeke');
  });

  it('does not let a customer question resolve to a product', () => {
    // A customer named after a product must win a question about a person.
    const withClash = {
      ...laundry,
      products: [...laundry.products, { id: 'p9', name: 'Peak', sellingPrice: 100, costPrice: 50, quantity: 5 }],
      customers: [{ id: 'c9', name: 'Peak Obi', phone: '0803', totalPurchases: 0, outstandingDebt: 0, visitsCount: 1, loyaltyPoints: 0, purchaseHistory: [] }],
    };
    expect(understand(withClash, 'who is Peak?').intent).toBe('customer_lookup');
  });
});

describe("the seasons are the shop's seasons", () => {
  it('talks about drying, not about pantry staples', () => {
    const weather = getWeatherInsights(laundry);
    expect(weather.effect).not.toMatch(/pantry|cold drinks|skincare/i);
    expect(`${weather.effect} ${weather.suggestedAction}`).toMatch(/dry|drying|collection|turnaround/i);
  });

  it('does not tell a laundry to stock biscuits for back-to-school', () => {
    const seasons = getSeasonalPredictions(laundry);
    const text = JSON.stringify(seasons);
    expect(text).not.toMatch(/Biscuit|Sugar Packet|Milk Sachet|Stationery/i);
  });

  it("leaves a product shop's seasons alone", () => {
    const weather = getWeatherInsights(shop);
    expect(weather.weatherCondition).toMatch(/Harmattan|Hot Dry|Rainy/);
  });
});
