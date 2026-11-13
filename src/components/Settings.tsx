import { useSettings, type SettingsProps } from './settings/useSettings';
import BarcodeView from './settings/views/BarcodeView';
import PrinterSettingsView from './settings/views/PrinterSettingsView';
import MarketplaceSettingsView from './settings/views/MarketplaceSettingsView';
import ProfileView from './settings/views/ProfileView';
import FlowView from './settings/views/FlowView';
import PricingView from './settings/views/PricingView';
import InventoryView from './settings/views/InventoryView';
import SavingsView from './settings/views/SavingsView';
import AppearanceView from './settings/views/AppearanceView';
import NotificationsView from './settings/views/NotificationsView';
import SecurityView from './settings/views/SecurityView';
import DataView from './settings/views/DataView';
import BackupsView from './settings/views/BackupsView';
import ActivityLogView from './settings/views/ActivityLogView';
import AboutView from './settings/views/AboutView';
import ContactView from './settings/views/ContactView';
import FaqView from './settings/views/FaqView';
import HelpView from './settings/views/HelpView';
import PrivacyView from './settings/views/PrivacyView';
import TermsView from './settings/views/TermsView';
import SupportView from './settings/views/SupportView';
import HomeView from './settings/views/HomeView';

/*
 * The session helpers live in lib/store-session, not here.
 *
 * Index needs saveSession, clearSession and getActiveSession at startup. While
 * they lived in this file, importing them pulled this whole screen - the
 * largest in the app - into the startup bundle, which no amount of lazy
 * loading of the screen itself could undo. They are re-exported so that
 * anything already importing them from Settings keeps working.
 */
export type { LockTimer } from '@/lib/store-session';
export { saveLockTimer, getLockTimer, saveSession, clearSession, getActiveSession } from '@/lib/store-session';

export default function Settings(props: SettingsProps) {
  const s = useSettings(props);
  const { view } = s;
  if (view === 'barcode') return <BarcodeView s={s} />;
  if (view === 'printer-settings') return <PrinterSettingsView s={s} />;
  if (view === 'marketplace-settings') return <MarketplaceSettingsView s={s} />;
  if (view === 'profile') return <ProfileView s={s} />;
  if (view === 'flow') return <FlowView s={s} />;
  if (view === 'pricing' || view === 'discount') return <PricingView s={s} />;
  if (view === 'inventory') return <InventoryView s={s} />;
  if (view === 'savings') return <SavingsView s={s} />;
  if (view === 'appearance') return <AppearanceView s={s} />;
  if (view === 'notifications') return <NotificationsView s={s} />;
  if (view === 'security') return <SecurityView s={s} />;
  if (view === 'data') return <DataView s={s} />;
  if (view === 'backups') return <BackupsView s={s} />;
  if (view === 'activity-log') return <ActivityLogView s={s} />;
  if (view === 'about') return <AboutView s={s} />;
  if (view === 'contact') return <ContactView s={s} />;
  if (view === 'faq') return <FaqView s={s} />;
  if (view === 'help') return <HelpView s={s} />;
  if (view === 'privacy') return <PrivacyView s={s} />;
  if (view === 'terms') return <TermsView s={s} />;
  if (view === 'support') return <SupportView s={s} />;
  return <HomeView s={s} />;
}
