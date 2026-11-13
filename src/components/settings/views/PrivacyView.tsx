import { Shield } from 'lucide-react';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function PrivacyView({ s }: { s: SettingsState }) {
  const { setView } = s;
  return (
    <SubPage title="Privacy Policy" subtitle="Last updated: August 2026" onBack={() => setView('support')}>
      <div className={`${card} p-5 space-y-4 text-left`}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Shield className="w-6 h-6 text-primary shrink-0" />
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Your Business Data Belongs to You</h3>
            <p className="text-xs text-muted-foreground mt-0.5">StoreFlow is designed with offline-first privacy at its core.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">1. Data Storage & Ownership</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            By default, all your store records — including products, daily sales, expenses, debts, staff records, and financial analytics — are stored locally on your device. We do not sell, monetize, or scan your business data.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">2. Cloud Synchronization & Security</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If you enable Cloud Sync, your store data is encrypted using Industry Standard TLS/SSL protocols in transit and protected by Supabase Row-Level Security (RLS) policies. Only authenticated devices authorized with your store access code can read or write store records.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">3. Information We Collect</h4>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4 leading-relaxed">
            <li><strong>Account Profile:</strong> Store name, owner name, business contact email, and phone number provided during setup.</li>
            <li><strong>Transactional Records:</strong> Products, prices, sales history, expenses, and inventory stock counts.</li>
            <li><strong>Device & Crash Logs:</strong> Anonymous performance diagnostics to resolve app errors.</li>
          </ul>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">4. Data Sharing & Third Parties</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We never share your customer data or sales revenue metrics with third-party advertisers. Data is shared strictly with infrastructure service providers (e.g., Supabase, WhatsApp API) solely to execute requested services like cloud backups or receipt delivery.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">5. Data Control & Deletion Rights</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You retain full control over your data. You may export your entire store backup as a JSON file or execute a complete, permanent wipe of all local and cloud records at any time directly in <strong>Settings → Data & Storage</strong>.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">6. Contact Privacy Officer</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            For privacy inquiries or compliance requests under applicable data protection laws, contact us at <a href="mailto:inniegroup@gmail.com" className="text-primary font-bold hover:underline">inniegroup@gmail.com</a>.
          </p>
        </div>
      </div>
    </SubPage>
  );
}
