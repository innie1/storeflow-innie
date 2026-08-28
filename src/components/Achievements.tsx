import { StoreData } from '@/types/store';
import { 
  Trophy, Award, Lock, Sparkles, CheckCircle2, CircleDollarSign, TrendingUp, Package, ShieldAlert
} from 'lucide-react';

interface AchievementsProps {
  store: StoreData;
}

interface Badge {
  id: string;
  title: string;
  description: string;
  requirement: string;
  icon: string;
  category: string;
  check: (store: StoreData) => boolean;
}

const BADGES: Badge[] = [
  {
    id: 'first-sale',
    title: 'First Sale Milestone',
    description: 'Logged the first transaction on StoreFlow.',
    requirement: 'Log at least 1 sale.',
    icon: '⚡',
    category: 'Sales',
    check: (s) => s.sales.length >= 1
  },
  {
    id: 'sales-100',
    title: '100 Sales Century',
    description: 'Served 100 customers.',
    requirement: 'Log 100 sales.',
    icon: '📈',
    category: 'Sales',
    check: (s) => s.sales.length >= 100
  },
  {
    id: 'sales-1000',
    title: '1,000 Sales Master',
    description: 'Served 1000 customers. You are a local retail legend!',
    requirement: 'Log 1,000 sales.',
    icon: '🚀',
    category: 'Sales',
    check: (s) => s.sales.length >= 1000
  },
  {
    id: 'savings-expert',
    title: 'Savings Planner',
    description: 'Set up a dedicated savings plan for the store.',
    requirement: 'Define savings goal parameters.',
    icon: '💰',
    category: 'Finance',
    check: (s) => !!s.savingsGoal && s.savingsGoal.amount > 0
  },
  {
    id: 'savings-master',
    title: 'Savings Master',
    description: 'Successfully reached a savings goal amount.',
    requirement: 'Fully complete a savings target.',
    icon: '👑',
    category: 'Finance',
    check: (s) => !!s.savingsGoal && s.savingsGoal.saved >= s.savingsGoal.amount && s.savingsGoal.amount > 0
  },
  {
    id: 'debt-recovered',
    title: 'Debt Recovery Expert',
    description: 'Recovered outstanding customer debts completely.',
    requirement: 'Mark a pending payment as paid.',
    icon: '🛡️',
    category: 'Finance',
    check: (s) => (s.pendingPayments || []).some(p => p.status === 'paid')
  },
  {
    id: 'inventory-pro',
    title: 'Inventory Pro',
    description: 'Cataloged a robust and comprehensive inventory list.',
    requirement: 'Add 15+ products to inventory.',
    icon: '📦',
    category: 'Operations',
    check: (s) => s.products.length >= 15
  },
  {
    id: 'doc-vault-user',
    title: 'Secured Owner',
    description: 'Logged business documents securely offline.',
    requirement: 'Upload at least 1 document to the vault.',
    icon: '📂',
    category: 'Operations',
    check: (s) => (s.documents || []).length >= 1
  }
];

export default function Achievements({ store }: AchievementsProps) {
  
  const earnedBadges = BADGES.filter(b => b.check(store));
  const lockedBadges = BADGES.filter(b => !b.check(store));
  
  const completionPercentage = Math.round((earnedBadges.length / BADGES.length) * 100);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" /> Achievement Badges
          </h2>
          <p className="text-sm text-muted-foreground">Unlock rewards and showcase your milestones in scaling your retail store.</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-border text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span>{completionPercentage}% Badges Unlocked</span>
        </div>
      </div>

      {/* Progress track */}
      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden border border-border/80">
        <div 
          className="h-full bg-yellow-500 rounded-full transition-all duration-500"
          style={{ width: `${completionPercentage}%` }}
        />
      </div>

      {/* Earned Badges Grid */}
      <div className="space-y-3.5">
        <h3 className="font-display font-bold text-sm text-yellow-500 uppercase tracking-wider">Unlocked Badges ({earnedBadges.length})</h3>
        
        {earnedBadges.length === 0 ? (
          <div className="text-center py-10 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
            <p className="text-muted-foreground text-xs">No badges unlocked yet. Keep logging sales and inventory to clear targets!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {earnedBadges.map(b => (
              <div 
                key={b.id} 
                className="p-4 rounded-2xl bg-slate-950 border border-yellow-500/35 bg-gradient-to-br from-yellow-500/5 to-transparent flex gap-4 items-center"
              >
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-2xl border border-yellow-500/25 shrink-0 shadow-[0_0_12px_rgba(234,179,8,0.1)]">
                  {b.icon}
                </div>
                <div className="space-y-0.5 text-left">
                  <span className="text-[8px] font-bold text-yellow-500 uppercase tracking-widest block">{b.category}</span>
                  <h4 className="font-display font-bold text-sm text-foreground">{b.title}</h4>
                  <p className="text-xs text-muted-foreground leading-snug">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Locked Badges Grid */}
      <div className="space-y-3.5 pt-4">
        <h3 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">Locked Achievements ({lockedBadges.length})</h3>
        
        {lockedBadges.length === 0 ? (
          <div className="text-center py-6 bg-slate-900/10 rounded-2xl border border-dashed border-border/85">
            <p className="text-success text-xs font-display font-bold">🎉 Outstanding! You have unlocked all achievements!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lockedBadges.map(b => (
              <div 
                key={b.id} 
                className="p-4 rounded-2xl bg-slate-950 border border-border flex gap-4 items-center opacity-65 grayscale"
              >
                <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-0.5 text-left">
                  <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">{b.category}</span>
                  <h4 className="font-display font-bold text-sm text-foreground">{b.title}</h4>
                  <p className="text-xs text-muted-foreground leading-snug">{b.description}</p>
                  <p className="text-[10px] text-yellow-500/80 font-semibold mt-1">To unlock: {b.requirement}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
