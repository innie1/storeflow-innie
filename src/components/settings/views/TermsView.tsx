import { FileText } from 'lucide-react';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function TermsView({ s }: { s: SettingsState }) {
  const { setView } = s;
  return (
    <SubPage title="Terms & Conditions" subtitle="Effective Date: August 2026" onBack={() => setView('support')}>
      <div className={`${card} p-5 space-y-4 text-left`}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <FileText className="w-6 h-6 text-primary shrink-0" />
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Terms of Service Agreement</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Please read these standard operational terms governing StoreFlow.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">1. Agreement to Terms</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            By creating a store, accessing, or using the StoreFlow application, you agree to be bound by these Terms and Conditions. If you do not agree, you should cease using the platform.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">2. License & Acceptable Use</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Innie Group grants you a limited, non-exclusive, non-transferable license to use StoreFlow for managing store inventory, POS sales, receipt issuance, and retail reporting. You agree not to use the service for illegal trade, fraud, or reverse engineering.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">3. Account & Security Responsibilities</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You are responsible for maintaining the confidentiality of your Store Access Code, owner password, and staff credentials. StoreFlow is not liable for unauthorized access resulting from compromised local passwords.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">4. Accuracy of Transactions & Tax</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Merchants maintain sole responsibility for verifying product prices, stock counts, customer receipt details, and local tax compliance. StoreFlow provides calculation tools but does not act as a licensed tax advisory service.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">5. Limitation of Liability</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            To the maximum extent permitted by law, Innie Group shall not be liable for direct, indirect, incidental, or consequential damages resulting from device hardware loss, network downtime, or data corruption beyond reasonable control.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">6. Service Modifications & Updates</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We continuously improve StoreFlow with new features, security updates, and performance optimizations. We reserve the right to update software functionality or these terms with notice.
          </p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">7. Governing Law & Inquiries</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These terms are governed by the laws applicable to commercial retail software. For legal inquiries, contact <a href="mailto:inniegroup@gmail.com" className="text-primary font-bold hover:underline">inniegroup@gmail.com</a>.
          </p>
        </div>
      </div>
    </SubPage>
  );
}
