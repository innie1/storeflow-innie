import { showToast } from '@/components/Toast';
import { guideDismissed, nextStep, showGuideAgain } from '@/lib/setup-guide';
import { card, SubPage, SupportRow } from '../ui';
import type { SettingsState } from '../useSettings';

export default function SupportView({ s }: { s: SettingsState }) {
  const { store, setView, setHelpOpen } = s;
  return (
    <SubPage title="Support & Legal" subtitle="Help, policies & contact information" onBack={() => setView('home')}>
      <div className={`${card} divide-y divide-border`}>
        <SupportRow icon="📖" label="Help Center" onClick={() => { setHelpOpen(null); setView('help'); }} />
        {/* Only while there is something left on it, and it was hidden. */}
        {guideDismissed(store.accessCode) && nextStep(store) && (
          <SupportRow icon="✅" label="Show setup checklist" onClick={() => { showGuideAgain(store.accessCode); showToast('The setup checklist is back on Home'); }} />
        )}
        <SupportRow icon="❓" label="FAQ" onClick={() => { setHelpOpen(null); setView('faq'); }} />
        <SupportRow icon="💬" label="Contact Support" onClick={() => setView('contact')} />
        <SupportRow icon="🛡️" label="Privacy Policy" onClick={() => setView('privacy')} />
        <SupportRow icon="📜" label="Terms & Conditions" onClick={() => setView('terms')} />
        <SupportRow icon="ℹ️" label="About StoreFlow" onClick={() => setView('about')} />
      </div>
    </SubPage>
  );
}
