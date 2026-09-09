import { describe, expect, it } from 'vitest';
import { contactPickerAvailable } from '@/lib/contact-picker';
import { readSource } from './helpers/source';

/**
 * Taking a number from the phone's own contacts.
 *
 * Typing an eleven-digit Nigerian number on a phone keyboard, at a counter,
 * with somebody waiting, is where mistakes get made - and a wrong number is
 * worse than none, because the shop then messages a stranger about somebody
 * else's clothes. Most of these customers are already in the phone.
 */

describe('the picker knows when it cannot work', () => {
  it('says no where the phone has no contacts API', () => {
    // jsdom has none, which is the same answer every desktop and every iPhone
    // gives. A button that opens nothing reads as the app being broken.
    expect(contactPickerAvailable()).toBe(false);
  });

  it('draws nothing at all in that case', () => {
    const button = readSource('src/components/ContactPickButton.tsx');
    expect(button).toContain('if (!contactPickerAvailable()) return null;');
  });

  it('treats a cancelled pick as nothing happening', () => {
    /*
     * Backing out of the picker, or choosing a contact with no number saved,
     * are both ordinary and neither deserves a message - the merchant knows
     * what they did.
     */
    const lib = readSource('src/lib/contact-picker.ts');
    expect(lib).toContain('if (!first) return null;');
    expect(lib).toContain('if (!phone) return null;');
  });
});

describe('it is on every phone field a merchant fills in', () => {
  const fields: [string, string][] = [
    ['the laundry counter', 'src/components/laundry/LaundryWalkInIntakeV2.tsx'],
    ['the customer book', 'src/components/Customers.tsx'],
    ['taking payment', 'src/components/Sales.tsx'],
    ['securing the store', 'src/components/StoreAccess.tsx'],
    ['the shop profile', 'src/components/Settings.tsx'],
    ['suppliers', 'src/components/Suppliers.tsx'],
    ['staff', 'src/components/StaffManagement.tsx'],
    ['a sale receipt', 'src/components/SaleReceipt.tsx'],
    ['an order receipt', 'src/components/OrderReceipt.tsx'],
  ];

  it.each(fields)('%s', (_label, path) => {
    expect(readSource(path)).toContain('<ContactPickButton');
  });

  it('leaves the customer-facing storefront alone', () => {
    // A customer ordering from their own phone knows their own number, and
    // handing a shop's app their contact list is not the same thing.
    expect(readSource('src/components/business/BusinessStorefront.tsx')).not.toContain('ContactPickButton');
  });
});

describe('picking a contact fills the name too, carefully', () => {
  it('only when the name is still empty', () => {
    // Somebody who has typed a name has already told us who this is, and
    // overwriting it with whatever the phone calls them would be wrong.
    const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');
    expect(intake).toContain('if (name && !customerName.trim()) setCustomerName(name);');
  });
});
