import {
  ChevronRight,
  Search,
  Rocket,
  ShoppingCart,
  CreditCard,
  Package,
  Tag,
  Download,
  Cpu,
  Heart,
  MessageSquare,
  Home,
  PiggyBank,
  BarChart3,
  Trash2,
  Bike,
  Shirt,
  Wallet,
  Ticket,
  Target,
  Lock,
  MoonStar,
  Droplets,
  Clock,
} from 'lucide-react';
import { SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function HelpView({ s }: { s: SettingsState }) {
  const { serviceBusiness, setView, searchQuery, setSearchQuery, helpOpen, setHelpOpen } = s;
  const topics = [
    {
      id: 'start', icon: <Rocket className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Getting Started',
      body: (
        <div className="space-y-2">
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
            {['Create your store profile', 'Add your products', 'Record sales daily', 'Record expenses', 'Set profit margins', 'Configure savings goals', 'Turn on Flow for insights and recommendations', 'Review your dashboard regularly'].map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="text-[10px] text-muted-foreground italic mt-1.5">The more data you record, the smarter StoreFlow becomes.</p>
        </div>
      ),
    },
    {
      id: 'sales', icon: <ShoppingCart className="w-4 h-4" />, iconBg: 'rgba(99, 102, 241, 0.12)', iconColor: '#818CF8', title: 'Making a Sale',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <ol className="list-decimal list-inside space-y-1">
            {['Open the Sales page', 'Search or select products', 'Add products to cart', 'Click Complete Sale', 'Select payment type', 'Save sale'].map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="text-[10px] italic mt-1">Inventory automatically updates after each sale.</p>
        </div>
      ),
    },
    {
      id: 'partial', icon: <CreditCard className="w-4 h-4" />, iconBg: 'rgba(245, 158, 11, 0.12)', iconColor: '#FBBF24', title: 'Partial Payments',
      body: (
        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <p>Part-payments create a Pending Balance. The sale is still recorded in full.</p>
          <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
            <div className="flex justify-between"><span>Customer buys</span><strong className="text-foreground">₦2,500</strong></div>
            <div className="flex justify-between"><span>Customer pays</span><strong className="text-foreground">₦2,000</strong></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Pending balance</span><strong className="text-warning font-bold">₦500</strong></div>
          </div>
          <div>
            <p className="font-semibold text-foreground/80 mb-1">When customer pays later:</p>
            <ol className="list-decimal list-inside space-y-1 text-[11px]">
              {['Open Pending Balance', 'Tap Record Payment', 'Enter amount paid', 'Balance updates automatically'].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <p className="text-[10px] italic">Find all balances at: Sales → Pending Balances</p>
        </div>
      ),
    },
    {
      id: 'inventory', icon: <Package className="w-4 h-4" />, iconBg: 'rgba(249, 115, 22, 0.12)', iconColor: '#FB923C', title: 'Adding Products',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Go to <strong className="text-foreground">Inventory → Add Product</strong> and enter:</p>
          <ul className="space-y-1 text-[11px]">
            {['Product Name', 'Category', 'Cost Price', 'Selling Price', 'Quantity', 'Barcode (optional)'].map(f => (
              <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: 'pricing', icon: <Tag className="w-4 h-4" />, iconBg: 'rgba(234, 179, 8, 0.12)', iconColor: '#FACC15', title: 'Auto Pricing',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Suggests a selling price from cost plus your target markup.</p>
          <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
            <div className="flex justify-between"><span>Cost Price</span><strong className="text-foreground">₦1,000</strong></div>
            <div className="flex justify-between"><span>Margin</span><strong className="text-foreground">20%</strong></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Suggested Price</span><strong className="text-success font-bold">₦1,200</strong></div>
          </div>
          <p className="text-[10px] italic">Enable in Settings → Pricing.</p>
        </div>
      ),
    },
    {
      id: 'batch', icon: <Download className="w-4 h-4" />, iconBg: 'rgba(16, 185, 129, 0.12)', iconColor: '#34D399', title: 'Batch Import',
      body: (
        <p className="text-xs text-muted-foreground leading-relaxed">Import many products at once, with a preview to fix names and prices first.</p>
      ),
    },
    {
      id: 'flow', icon: <Cpu className="w-4 h-4" />, iconBg: 'rgba(6, 182, 212, 0.12)', iconColor: '#22D3EE', title: 'Flow Assistant',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Flow reads your sales, expenses, stock and debts to suggest what to do next.</p>
          <ul className="space-y-1 text-[11px]">
            {['Predict revenue and profits', 'Detect slow and fast-moving products', 'Suggest savings targets', 'Analyze rent and expense impact', 'Forecast busy periods and daily sales', 'Answer business questions (Ask Advice)', 'Suggest products worth stocking'].map(f => (
              <li key={f} className="flex items-center gap-1.5"><span className="text-success text-[6px]">●</span>{f}</li>
            ))}
          </ul>
          <p className="text-[10px] italic mt-1">Flow helps you make smarter decisions — it does not replace them.</p>
        </div>
      ),
    },
    {
      id: 'health', icon: <Heart className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#F43F5E', title: 'Store Health Score',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Scores your business on revenue, profit, expenses, stock, savings and debts.</p>
          <p className="text-[10px] italic">Tap the score on your dashboard for a full breakdown.</p>
        </div>
      ),
    },
    {
      id: 'requests', icon: <MessageSquare className="w-4 h-4" />, iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: '#2DD4BF', title: 'Customer Requests',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Record what customers ask for, so you can see what to start stocking.</p>
          <p>Flow uses this data to recommend which products to stock next.</p>
        </div>
      ),
    },
    {
      id: 'rent', icon: <Home className="w-4 h-4" />, iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#60A5FA', title: 'Rent Analysis',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p><strong className="text-foreground">Rented store:</strong> Weekly and monthly savings to cover rent, with a 10% buffer.</p>
          <p><strong className="text-foreground">Owned store:</strong> Flow estimates annual savings, emergency reserves, and property maintenance suggestions.</p>
          <p className="text-[10px] italic">Configure in Settings → Edit Profile.</p>
        </div>
      ),
    },
    {
      id: 'savings', icon: <PiggyBank className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#FB7185', title: 'Savings Plan',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Choose between percentage saving (e.g. 10% of profit) or a fixed amount (e.g. ₦5,000 weekly or ₦20,000 monthly). Plans can be enabled or paused at any time.</p>
          <p className="text-[10px] italic">Set up in Settings → Savings Plan.</p>
        </div>
      ),
    },
    {
      id: 'graphs', icon: <BarChart3 className="w-4 h-4" />, iconBg: 'rgba(139, 92, 246, 0.12)', iconColor: '#A78BFA', title: 'Graphs & Activity',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>The Sales Activity graph shows 30-minute intervals by default (Today view). Switch timeframes:</p>
          <ul className="space-y-1 text-[11px]">
            {['Today (hourly)', '7 Days', '14 Days', '30 Days', '1 Year', 'Lifetime'].map(f => (
              <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
            ))}
          </ul>
          <p>The Dashboard Sales Trend chart can also be filtered by Today, 1 Week, 14 Days, 30 Days, or All Time.</p>
        </div>
      ),
    },
    /*
      Written for the shop that is actually running this.

      The help had fourteen articles and every one of them was about stock:
      add your products, set your margins, record sales. A laundry using this
      app takes bundles in, promises them for Thursday, chases what is owed
      and closes the book at night, and none of that was explained anywhere.

      These are the screens the app now has, in the order somebody meets
      them, and the service ones only appear for the trades that have them.
    */
    ...(serviceBusiness ? [
    {
      id: 'intake', icon: <Shirt className="w-4 h-4" />, iconBg: 'rgba(245, 197, 60, 0.12)', iconColor: '#F5C53C', title: 'Taking a bundle in',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Intake, then New bundle. Type the customer name, count what they brought, and the price adds itself up from your price list.</p>
          <p><b className="text-foreground">The phone number is optional.</b> A customer who will not give one can still be recorded; you simply will not be able to message them when the clothes are ready.</p>
          <p>Add a shelf or rack so you can find the bundle later, and a photo if the clothes need one. Neither is required.</p>
          <p className="text-[10px] italic">Every bundle gets a tag code. Write it on the clothes.</p>
        </div>
      ),
    },
    {
      id: 'ticket', icon: <Ticket className="w-4 h-4" />, iconBg: 'rgba(16, 185, 129, 0.12)', iconColor: '#34D399', title: 'The customer ticket',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>After saving, <b className="text-foreground">WhatsApp</b> sends the customer their receipt in one tap. With no number saved it opens your contacts instead, so you can pick anybody: the customer, their driver, or your own phone.</p>
          <p><b className="text-foreground">Show customer</b> turns the screen round. A white ticket with the code, what they dropped, when it is ready and what is left to pay. Tell them to photograph it.</p>
          <p>Lost their ticket? Open the bundle in Records and tap <b className="text-foreground">Ticket</b>. It comes back exactly as it was, which is the one thing paper cannot do.</p>
        </div>
      ),
    },
    {
      id: 'dayboard', icon: <Clock className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'What to do today',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>The top of the home screen shows the day work. Tap any of them to open that list:</p>
          <ul className="space-y-1 text-[11px]">
            {[['Late', 'promised before today and still not finished'], ['Due today', 'promised for today'], ['Ready', 'washed and waiting to be collected'], ['Owed', 'money still to come, and who owes it']].map(([a, b]) => (
              <li key={a} className="flex gap-1.5"><span className="text-primary text-[6px] mt-1.5">&#9679;</span><span><b className="text-foreground">{a}</b> &mdash; {b}</span></li>
            ))}
          </ul>
          <p className="text-[10px] italic">A bundle on the Ready shelf past its time is not counted late. It is finished, and waiting for someone to come.</p>
        </div>
      ),
    },
    {
      id: 'dayclose', icon: <MoonStar className="w-4 h-4" />, iconBg: 'rgba(139, 92, 246, 0.12)', iconColor: '#A78BFA', title: 'Closing the day',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>From five in the afternoon the home screen shows how the day went: bundles in, money actually taken, money still owed, and what is promised tomorrow.</p>
          <p><b className="text-foreground">Taken</b> is what went into the drawer, not the value of what came in. A bundle taken on credit is not money yet.</p>
          <p>Tap <b className="text-foreground">Done for today</b> and it waits until tomorrow evening.</p>
        </div>
      ),
    },
    {
      id: 'pricelist', icon: <Tag className="w-4 h-4" />, iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#60A5FA', title: 'Your price list',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Price List holds every item you wash and what you charge for it. Most laundries charge per piece: one shirt is one piece, a bundle of twenty is twenty.</p>
          <p><b className="text-foreground">Set all prices</b> deals them one at a time, name then price then next, with a count of what is left. Stopping part-way keeps everything already set.</p>
          <p>The advisor underneath shows what each item earns and suggests a price when one is losing money. Nothing changes until you accept it.</p>
        </div>
      ),
    },
    {
      id: 'breakeven', icon: <Target className="w-4 h-4" />, iconBg: 'rgba(34, 197, 94, 0.12)', iconColor: '#4ADE80', title: 'What the month must take',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>The ring beside Revenue says how the month is going at a glance:</p>
          <ul className="space-y-1 text-[11px]">
            {[['Grey', 'no target yet, record your costs'], ['Green', 'covered, or on pace'], ['Amber', 'slipping'], ['Red', 'behind what the month needs']].map(([a, b]) => (
              <li key={a} className="flex gap-1.5"><span className="text-primary text-[6px] mt-1.5">&#9679;</span><span><b className="text-foreground">{a}</b> &mdash; {b}</span></li>
            ))}
          </ul>
          <p>Tap it for the full figures. To get a target, record what the month costs you: rent under Edit Profile, salaries on each staff member, and the rest as expenses.</p>
          <p>It fills with money actually received, not the price of bundles still owed, so the month only shows covered when real money covers the costs.</p>
        </div>
      ),
    },
    {
      id: 'supplies', icon: <Droplets className="w-4 h-4" />, iconBg: 'rgba(6, 182, 212, 0.12)', iconColor: '#22D3EE', title: 'Soap, and what a job really costs',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Most shops buy detergent out of the drawer and never write it down, which makes every profit figure look better than it is.</p>
          <p>Expenses, then <b className="text-foreground">Supplies</b>, lists what your trade uses. Staff can mark something as run out without needing to see money; only an owner records what was paid.</p>
          <p>Now and then the Expenses screen asks what you spent on it. Answering takes seconds and makes the cost per piece honest.</p>
        </div>
      ),
    },
    {
      id: 'runs', icon: <Bike className="w-4 h-4" />, iconBg: 'rgba(249, 115, 22, 0.12)', iconColor: '#FB923C', title: 'Pickups and deliveries',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>When you take a bundle in, choose whether it is a walk-in, a collection or a delivery, and add the address.</p>
          <p>Intake, then <b className="text-foreground">Runs</b>, lists the day stops with a map link that opens your own phone maps, and a WhatsApp message for each stage.</p>
          <p className="text-[10px] italic">Where a bundle is in its journey is kept separate from where it is in the wash. Clothes can be ironed and out on a bike at the same time.</p>
        </div>
      ),
    },
    ] : []),
    {
      id: 'lock', icon: <Lock className="w-4 h-4" />, iconBg: 'rgba(148, 163, 184, 0.12)', iconColor: '#94A3B8', title: 'Locking the app',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Settings, Security, then <b className="text-foreground">PIN Lock</b> sets four digits, asked for when the app opens and whenever it has been in the background a couple of minutes. Fingerprint unlock can sit on top of it once a PIN exists.</p>
          <p>Five wrong tries and it waits a minute before accepting more.</p>
          <p className="text-[10px] italic">This is a screen lock: it stops somebody picking up the phone and reading your takings. It does not encrypt the records, so the phone itself is still the thing worth protecting.</p>
        </div>
      ),
    },
    {
      id: 'owed', icon: <Wallet className="w-4 h-4" />, iconBg: 'rgba(245, 158, 11, 0.12)', iconColor: '#FBBF24', title: 'Money owed to you',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>When a job is not paid in full, the balance stays on it and appears in the owed total on the home screen.</p>
          <p>Handing work over unpaid is allowed. The app asks first and keeps the balance on the customer account rather than losing it, which is what a paper book does.</p>
          <p className="text-[10px] italic">The customer own ticket shows what is left to pay, so both sides have the same number.</p>
        </div>
      ),
    },
    {
      id: 'trash', icon: <Trash2 className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Data Recovery',
      body: (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>Nothing is permanently deleted immediately. Deleted products, sales, expenses, and categories all go to Trash and can be restored at any time.</p>
          <p className="text-[10px] italic">Access via: Settings → Data & Storage → Recently Deleted</p>
        </div>
      ),
    },
  ];
  const filteredTopics = topics.filter(topic => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return topic.title.toLowerCase().includes(query) || topic.id.toLowerCase().includes(query);
  });
  return (
    <SubPage title="Help Center" subtitle="Learn, explore and grow your business" onBack={() => { setView('support'); setSearchQuery(''); }}>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
        {filteredTopics.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No matching help articles found.
          </div>
        ) : (
          filteredTopics.map(topic => {
            const isOpen = helpOpen === topic.id;
            return (
              <div key={topic.id} className="transition-all">
                <button
                  className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2 group"
                  onClick={() => setHelpOpen(isOpen ? null : topic.id)}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: topic.iconBg, color: topic.iconColor }}>
                      {topic.icon}
                    </div>
                    <span className="text-sm font-display font-semibold text-foreground group-hover:text-primary transition-colors">{topic.title}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-primary' : ''}`} />
                </button>
                {isOpen && (
                  <div className="p-5 bg-black/15 border-t border-border/80 animate-fade-in">
                    {topic.body}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Search bar inside the card container at the bottom */}
        <div className="p-4 border-t border-border/60 bg-black/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search help articles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      </div>
    </SubPage>
  );
}
