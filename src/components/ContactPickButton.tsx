import { Contact } from 'lucide-react';
import { contactPickerAvailable, pickContact } from '@/lib/contact-picker';
import { showToast } from '@/components/Toast';

/**
 * The small contacts button at the end of a phone field.
 *
 * Sits inside the input rather than beside it, so it does not push the layout
 * around on the several screens this appears on and reads as part of the field
 * it fills.
 *
 * It used to draw nothing where the phone cannot offer its contacts, on the
 * grounds that a button which opens nothing looks broken. In practice the
 * opposite happened: the icon was simply missing on the shop owner's own
 * phone, with no way to tell whether the app had it, had lost it, or had never
 * shipped it. A missing thing cannot explain itself.
 *
 * So it is always drawn, and where the phone will not share its contacts it
 * says why - which is something the merchant can act on. Only Chrome on
 * Android has this; every iPhone and most desktop browsers do not, and no web
 * app on those can read the address book at all.
 */

interface Props {
  /** Given the number, and the contact's name when the phone knows it. */
  onPick: (phone: string, name: string) => void;
  className?: string;
}

export default function ContactPickButton({ onPick, className = '' }: Props) {
  const available = contactPickerAvailable();

  return (
    <button
      type="button"
      onClick={async () => {
        if (!available) {
          showToast('This phone will not share its contacts with an app — type or paste the number. Chrome on Android can do it.', 'info');
          return;
        }
        const picked = await pickContact();
        if (picked) onPick(picked.phone, picked.name);
      }}
      aria-label="Choose from contacts"
      title={available ? 'Choose from contacts' : 'This phone cannot share its contacts'}
      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-95 ${
        available ? 'text-muted-foreground hover:text-primary' : 'text-muted-foreground/50'
      } ${className}`}
    >
      <Contact className="w-4 h-4" />
    </button>
  );
}
