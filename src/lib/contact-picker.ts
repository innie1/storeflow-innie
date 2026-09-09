/**
 * Taking a number from the phone's own contacts.
 *
 * Typing an eleven-digit Nigerian number on a phone keyboard, at a counter,
 * with somebody waiting, is where mistakes get made - and a wrong number is
 * worse than none, because the shop then messages a stranger about somebody
 * else's clothes. Most of these customers are already in the phone.
 *
 * The Contact Picker is Android Chrome only, which is most of this app's
 * shops but not all of them, and it needs a secure context and a real tap. So
 * everything here fails quietly: where it is not available the button simply
 * does not appear, and the field is the plain typing field it always was.
 */

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<Array<{ name?: string[]; tel?: string[] }>>;
  getProperties(): Promise<string[]>;
}

function contacts(): ContactsManager | null {
  const api = (navigator as unknown as { contacts?: ContactsManager }).contacts;
  return api && typeof api.select === 'function' ? api : null;
}

/**
 * Whether this phone can offer its contacts.
 *
 * Checked before drawing anything, because a button that opens nothing is
 * worse than no button - it reads as the app being broken rather than the
 * phone being different.
 */
export function contactPickerAvailable(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return !!contacts();
}

export interface PickedContact {
  name: string;
  phone: string;
}

/**
 * Open the picker and return one contact, or null.
 *
 * Null covers everything: no picker, the merchant backing out, a contact with
 * no number saved against it. None of those is an error worth a message - they
 * either know what they did or the phone has already told them.
 */
export async function pickContact(): Promise<PickedContact | null> {
  const api = contacts();
  if (!api) return null;
  try {
    const selected = await api.select(['name', 'tel'], { multiple: false });
    const first = selected?.[0];
    if (!first) return null;

    const phone = String(first.tel?.[0] || '').trim();
    if (!phone) return null;

    return { name: String(first.name?.[0] || '').trim(), phone };
  } catch {
    return null;
  }
}
