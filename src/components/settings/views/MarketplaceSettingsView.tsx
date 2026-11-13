import MarketplaceSettings from '@/components/MarketplaceSettings';
import { SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function MarketplaceSettingsView({ s }: { s: SettingsState }) {
  const { store, onUpdate, setView } = s;
  return (
    <SubPage title="Marketplace, Store Type & Loyalty Settings" onBack={() => setView('home')}>
      <MarketplaceSettings store={store} onUpdate={onUpdate} />
    </SubPage>
  );
}
