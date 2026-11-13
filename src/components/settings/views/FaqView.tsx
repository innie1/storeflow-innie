import { ChevronDown } from 'lucide-react';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function FaqView({ s }: { s: SettingsState }) {
  const { setView, helpOpen, setHelpOpen, customQuestion, setCustomQuestion } = s;
  return (
    <SubPage title="Frequently Asked Questions" onBack={() => setView('support')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        {([
          ['Does StoreFlow work offline?', 'Yes. Most features work offline and data syncs when available.'],
          ['Can I manage multiple stores?', 'Yes. Use the Switch Store feature in Settings → Data & Storage.'],
          ['Can I restore deleted items?', 'Yes. Visit Settings → Data & Storage → Recently Deleted. Nothing is permanently deleted immediately.'],
          ['Can Flow predict future sales?', 'Yes. Predictions become more accurate as more sales and expense data is recorded.'],
          ['Does Flow learn from my business?', 'Yes. Flow learns from your sales history, inventory, expenses, customer requests, and business information.'],
          ['Can I disable Flow?', 'Yes. Flow can be turned off at any time in Settings → Flow Settings.'],
          ['Can I track partial payments and debts?', 'Yes. StoreFlow automatically creates and tracks outstanding balances for partial payments.'],
          ['Can I upload a store logo?', 'Yes. Your logo appears throughout the app. Add it in Settings → Edit Profile.'],
          ['Can StoreFlow help me save money?', 'Yes. The Savings Plan feature and Flow recommendations help you build financial discipline over time — set a schedule and it deducts automatically, even reminding you if the app was closed when it was due.'],
          ['Is my data safe?', 'Yes. StoreFlow stores and protects your business information securely on your device, with cloud backup to Supabase for stores that enable it.'],
          ['Can I print receipts on a Bluetooth thermal printer?', 'Yes. Go to Settings → Printer Settings, choose Bluetooth, then tap "Pair Printer & Test Print". This only works in Chrome or Edge (Android or desktop) — not on iPhone/Safari, which will automatically use the regular print dialog instead.'],
          ['Will I get notified when a new order comes in, even if the app is closed?', 'Yes, if you turn it on. Go to Marketplace Settings → Notifications and enable "Push Notifications". This sends a real phone notification, not just an in-app one — supported on Chrome/Edge (Android or desktop) and Safari 16.4+ on iOS when the app is added to your home screen.'],
          ['Why does Smart Restock sometimes show items I can\u2019t afford yet?', 'Smart Restock\u2019s budget is based on your Business Balance. If it\u2019s too low (or negative) to fund a full restock, the list still shows what\u2019s most critical, ranked by priority, so you know what to prioritize even before you have the cash — you can still select items to fund with new money (a loan, top-up, etc.) if something can\u2019t wait.'],
          ['What happens after I approve a Smart Restock buy list?', 'Approved items are added to Inventory → Planned Restocks. Stock is NOT added automatically — go buy the goods, then come back and mark each item received to add it to your actual inventory.'],
          ['What\u2019s the Restock Score on my dashboard?', 'It shows what percentage of your restock spending over the last 90 days went into products that are actually selling, versus products that are dead stock or moving slowly. Higher is better.'],
          ['Can I get reminders for rent or loan repayments?', 'Yes. Set up a recurring bill in Expenses → Recurring Bills, or add a due date when registering a loan in ROI Tracker → Loans. You\u2019ll get a reminder starting 3 days before it\u2019s due.'],
          ['What\u2019s the difference between "Share Performance Report" and "Raw Export"?', 'Share Performance Report (Owner Dashboard) is a short summary meant for quickly sending to someone. Raw Export (Settings → Data & Storage) is your complete data — every product, sale, expense, restock, loan, and customer — as a PDF, CSV, or text file.'],
          ['Can I message a customer about their order?', 'Yes. On the Orders page, tap the WhatsApp icon next to a customer\u2019s phone number — it opens WhatsApp with a message already filled in based on the order\u2019s status, items, and total.'],
        ] as [string, string][]).map(([q, a]) => (
          <div key={q}>
            <button
              className="w-full text-left flex items-start justify-between gap-3 py-4"
              onClick={() => setHelpOpen(helpOpen === q ? null : q)}
            >
              <p className="text-sm font-display font-semibold text-foreground leading-snug">{q}</p>
              <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 text-muted-foreground transition-transform ${helpOpen === q ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {helpOpen === q && (
              <p className="pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">{a}</p>
            )}
          </div>
        ))}
      </div>

      <div className={`${card} p-4 mt-4 space-y-2.5`}>
        <p className="text-sm font-display font-bold">Still have a question?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">Type it below and send it to our support team on WhatsApp — we'll get back to you.</p>
        <textarea
          value={customQuestion}
          onChange={e => setCustomQuestion(e.target.value)}
          placeholder="Type your question here..."
          rows={3}
          className="w-full p-3 rounded-xl bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary resize-none"
        />
        <button
          onClick={() => {
            if (!customQuestion.trim()) return;
            window.open(`https://wa.me/2347025517388?text=${encodeURIComponent('Hi StoreFlow Team, I have a question: ' + customQuestion.trim())}`, '_blank');
            setCustomQuestion('');
          }}
          disabled={!customQuestion.trim()}
          className="w-full p-3 rounded-xl bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-40"
        >
          Send Question
        </button>
      </div>
    </SubPage>
  );
}
