import { Contact } from 'lucide-react';
import { contactPickerAvailable, pickContact } from '@/lib/contact-picker';

/**
 * The small contacts button at the end of a phone field.
 *
 * Sits inside the input rather than beside it, so it does not push the layout
 * around on the several screens this appears on and reads as part of the field
 * it fills.
 *
 * Draws nothing at all where the phone cannot offer its contacts - a button
 * that opens nothing reads as the app being broken rather than the phone being
 * different, and that is most desktops and every iPhone.
 */

interface Props {
  /** Given the number, and the contact's name when the phone knows it. */
  onPick: (phone: string, name: string) => void;
  className?: string;
}

export default function ContactPickButton({ onPick, className = '' }: Props) {
  if (!contactPickerAvailable()) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const picked = await pickContact();
        if (picked) onPick(picked.phone, picked.name);
      }}
      aria-label="Choose from contacts"
      title="Choose from contacts"
      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary active:scale-95 transition ${className}`}
    >
      <Contact className="w-4 h-4" />
    </button>
  );
}
