import CloudAuthModal from '@/components/CloudAuthModal';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function AboutView({ s }: { s: SettingsState }) {
  const { store, setView, showCloudAuthModal, setShowCloudAuthModal, handleCloudAuthSuccess } = s;
  return (
    <SubPage title="About StoreFlow" onBack={() => setView('support')}>
      <div className={`${card} p-6 flex flex-col items-center text-center gap-4`}>
        <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center text-4xl">
          🏪
        </div>
        <div>
          <h2 className="wordmark font-bold text-2xl"><span className="text-foreground">Store</span><span className="text-primary">Flow</span></h2>
          <p className="text-xs text-muted-foreground mt-0.5">Version 1.0 · Innie Group</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A modern business management platform for small businesses, supermarkets, kiosks, pharmacies, boutiques, restaurants, and growing stores.
        </p>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Our Mission</p>
        <ul className="space-y-2">
          {([
            ['📈', 'Help you make better business decisions'],
            ['💸', 'Reduce losses and increase profits'],
            ['📊', 'Track business growth over time'],
            ['🔮', 'Predict future performance'],
            ['🐖', 'Save for business goals'],
            ['🤝', 'Understand what customers want'],
            ['🏪', 'Make store management easier'],
          ] as [string, string][]).map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2.5 text-sm text-foreground/85">
              <span className="shrink-0 leading-5">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${card} px-4 divide-y divide-border`}>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Developer</span>
          <span className="text-sm font-display font-semibold">Innie Group</span>
        </div>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm font-display font-semibold">1.0</span>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">Email</span>
          <a href="mailto:inniegroup@gmail.com" className="text-sm font-semibold text-primary truncate">
            inniegroup@gmail.com
          </a>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">WhatsApp</span>
          <a href="https://wa.me/2347025517388" target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-success">
            07025517388
          </a>
        </div>
      </div>

      {showCloudAuthModal && (
        <CloudAuthModal
          onAuthSuccess={handleCloudAuthSuccess}
          onClose={() => setShowCloudAuthModal(false)}
          initialEmail={store.profile?.email || ''}
          initialFullName={store.profile?.ownerName || store.storeName || ''}
        />
      )}
    </SubPage>
  );
}
