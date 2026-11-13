import { showToast } from '@/components/Toast';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function ContactView({ s }: { s: SettingsState }) {
  const { setView, setShowContactPopup } = s;
  return (
    <SubPage title="Contact Support" onBack={() => setView('support')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center text-2xl shrink-0">💬</div>
          <div>
            <p className="font-display font-bold text-sm">WhatsApp Support</p>
            <p className="text-xs text-muted-foreground">Chat directly with the StoreFlow team</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-success text-white font-display font-bold text-sm"
          >
            💬 Open WhatsApp
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('07025517388');
              showToast('WhatsApp phone number copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Phone: 07025517388</p>
      </div>

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">📧</div>
          <div>
            <p className="font-display font-bold text-sm">Email Support</p>
            <p className="text-xs text-muted-foreground">Send a detailed issue or request</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Support%20Request&body=Hello%20StoreFlow%20Team,%0A%0AI%20need%20help%20with:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
          >
            ✉️ Email Support
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('inniegroup@gmail.com');
              showToast('Support email copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Email: inniegroup@gmail.com</p>
      </div>

      <button
        onClick={() => setShowContactPopup(true)}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-success text-primary-foreground font-display font-bold text-sm shadow-md hover:opacity-95 transition-all"
      >
        ✨ Show More Support Options
      </button>

      <div className={`${card} p-4 text-center space-y-1`}>
        <p className="text-xs font-semibold text-foreground">Support Hours</p>
        <p className="text-xs text-muted-foreground">Monday - Sunday</p>
        <p className="text-[10px] text-muted-foreground">StoreFlow Support Team · Innie Group</p>
      </div>
    </SubPage>
  );
}
