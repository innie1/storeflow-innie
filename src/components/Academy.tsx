import { useState } from 'react';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { 
  GraduationCap, BookOpen, CheckCircle, Award, PlayCircle, Coins, ChevronRight, ArrowLeft
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface AcademyProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

interface Lesson {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  coinsReward: number;
  content: string[];
  quiz: {
    question: string;
    options: string[];
    correctIndex: number;
  };
  /**
   * Who the lesson is for.
   *
   * A laundry was being taught inventory turnover and how to reconcile a cash
   * drawer it does not have. Teaching the wrong trade is worse than teaching
   * nothing: it tells the owner the app was built for somebody else.
   */
  productShopOnly?: boolean;
  serviceShopOnly?: boolean;
}

const LESSONS: Lesson[] = [
  {
    id: 'service-pricing',
    serviceShopOnly: true,
    title: 'Pricing Work, Not Goods',
    category: 'Pricing Strategy',
    duration: '3 min',
    coinsReward: 15,
    description: 'Work out what an hour of your time and your materials really cost, so a busy week is also a profitable one.',
    content: [
      'A shop that sells work has no cost price to mark up. What it has is time, materials and machines — and those are easy to give away without noticing.',
      '1. Start with materials per job. Detergent, starch, bags, water, and the share of electricity or fuel one load actually uses. Divide a full bottle by how many loads it does; that is your real cost per load.',
      '2. Add your time. Decide what an hour of your work is worth and count the whole job — sorting, washing, drying, ironing, folding, handing back. A job that takes twice as long should not cost the same.',
      '3. Price per piece for ordinary clothes, and price the awkward ones separately. A duvet is not a shirt. Charging one price for both means the shirts are paying for the duvets.',
      '4. Charge more for express work. Someone who wants it tomorrow is asking you to reorder your whole day, and that is worth money.',
    ],
    quiz: {
      question: 'A bottle of detergent costs ₦4,000 and washes 20 loads. What is the detergent cost of one load?',
      options: ['₦200', '₦400', '₦100', '₦2,000'],
      correctIndex: 0,
    },
  },
  {
    id: 'turnaround',
    serviceShopOnly: true,
    title: 'Promised Days and Getting Work Back Out',
    category: 'Operations',
    duration: '3 min',
    coinsReward: 15,
    description: 'The promised day is the promise customers actually judge you on. Here is how to keep it.',
    content: [
      'In a service shop the thing customers remember is not the price. It is whether their clothes were ready when you said they would be.',
      '1. Promise honestly, not optimistically. In the rainy season clothes take longer to dry, so promise later. A day late costs you more goodwill than a day longer costs you at the counter.',
      '2. Work the oldest first. Whatever has been in longest, or is closest to its promised day, goes next — not whatever is nearest the door.',
      '3. Chase what is finished. Work sitting on the shelf is money you have already earned and space the next job needs. A short message when something is ready moves most of it.',
      '4. Take a deposit on big bundles. It costs nothing to ask, and it is the difference between a customer who comes back and one whose clothes live with you for a month.',
    ],
    quiz: {
      question: 'Two bundles are waiting. One came in on Monday and is due Friday, the other came in Wednesday and is due Thursday. Which should you do first?',
      options: ['The Wednesday one — it is due sooner', 'The Monday one — it came in first', 'Whichever is smaller', 'Whichever pays more'],
      correctIndex: 0,
    },
  },
  {
    id: 'pricing-101',
    productShopOnly: true,
    title: 'The Art of Pricing & Profit Markups',
    category: 'Pricing Strategy',
    duration: '3 min',
    coinsReward: 15,
    description: 'Learn how to calculate cost price, markup margins, and avoid common pricing traps that lead to business losses.',
    content: [
      'Many retail shop owners set prices arbitrarily or simply copy competitors. This can lead to zero profit or operating at a loss.',
      '1. Cost Price is the total money paid to acquire the product, including transport or delivery fees. If a carton of milk costs ₦12,000 to purchase and ₦500 to ship, your actual Cost Price per unit includes the shipping fraction.',
      '2. Markup vs Margin: A 30% markup means you add 30% to the cost price (Selling Price = Cost × 1.30). A 30% profit margin means profit represents 30% of the total selling price (Selling Price = Cost / 0.70).',
      '3. To maintain a healthy business, aim for at least a 20-30% markup on fast-moving goods and 40-50% on slower items to cover overhead costs (like rent and electricity).'
    ],
    quiz: {
      question: 'If an item costs ₦1,000 to buy and you want a 30% profit markup, what is the selling price?',
      options: ['₦1,300', '₦1,030', '₦1,500', '₦1,150'],
      correctIndex: 0
    }
  },
  {
    id: 'inventory-turnover',
    productShopOnly: true,
    title: 'Optimizing Inventory Turnover & Dead Stock',
    category: 'Inventory Management',
    duration: '4 min',
    coinsReward: 15,
    description: 'Master the principles of low stock warnings, reorder frequencies, and how to prevent capital from rotting in slow inventory.',
    content: [
      'Having inventory sits on shelves is the same as locking money in a drawer. It limits cash flow and blocks you from buying high-demand items.',
      '1. High Turnover means items sell quickly. Focus your capital here. Restock these weekly or bi-weekly to avoid gaps.',
      '2. Low Stock Alerts: Set a critical stock threshold (e.g., 2 units). When stock hits this level, it triggers an alert so you can replenish before going to zero.',
      '3. Dead Stock is inventory that has not sold in 30 days. Identify these items, stop restocking them, and run promotional bundle discounts to cash out immediately.'
    ],
    quiz: {
      question: 'What is the best way to handle "dead stock" (items that have not sold in 30 days)?',
      options: [
        'Keep them at the original price forever',
        'Throw them away immediately',
        'Run bundle discounts or clearance sales to free up capital',
        'Order more quantity to fill the shelves'
      ],
      correctIndex: 2
    }
  },
  {
    id: 'cash-drawer',
    productShopOnly: true,
    title: 'Cash Flow Management & Reconciliation',
    category: 'Finance Strategy',
    duration: '3 min',
    coinsReward: 15,
    description: 'Understand cash drawers, separating personal and business finances, and reconciliating cash balances daily.',
    content: [
      'A profitable store can still go bankrupt if cash flow is mismanaged. Cash flow is the physical money entering and leaving your drawer.',
      '1. Opening Cash is the float money left in the drawer for change. Record this at the start of the day.',
      '2. Separate Cash Registers: Never pay personal bills out of the store drawer without recording it as an expense or withdrawal.',
      '3. Daily Reconciliation: Tally cash sales against manual drawer count. Discrepancies point to theft, missed records, or incorrect change giving.'
    ],
    quiz: {
      question: 'What is daily cash drawer reconciliation?',
      options: [
        'Counting cash only once a month',
        'Tallying expected cash from sales against physical cash in drawer',
        'Borrowing money from the register to pay personal utilities',
        'Deleting transactions that were paid in cash'
      ],
      correctIndex: 1
    }
  }
];

export default function Academy({ store, onUpdate }: AcademyProps) {
  // Only the lessons that apply here. Teaching a laundry about inventory
  // turnover is worse than teaching it nothing.
  const isService = isServiceFirstBusiness(store);
  const lessons = LESSONS.filter(lesson => (
    !(lesson.productShopOnly && isService) && !(lesson.serviceShopOnly && !isService)
  ));
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState(false);

  const completedLessons = store.lastDailyClaim ? JSON.parse(localStorage.getItem(`storeflow_academy_${store.accessCode}`) || '[]') : [];

  const isCompleted = (id: string) => completedLessons.includes(id);

  const startLesson = (l: Lesson) => {
    setActiveLesson(l);
    setSelectedOption(null);
    setQuizSubmitted(false);
    setQuizSuccess(false);
  };

  const handleQuizSubmit = () => {
    if (selectedOption === null || !activeLesson) return;
    
    setQuizSubmitted(true);
    if (selectedOption === activeLesson.quiz.correctIndex) {
      setQuizSuccess(true);
      
      // Save completion progress
      if (!completedLessons.includes(activeLesson.id)) {
        const nextCompleted = [...completedLessons, activeLesson.id];
        localStorage.setItem(`storeflow_academy_${store.accessCode}`, JSON.stringify(nextCompleted));
        
        // Reward store coins
        const nextStore = {
          ...store,
          coins: (store.coins || 0) + activeLesson.coinsReward
        };
        onUpdate(nextStore);
        showToast(`🎉 Quiz Correct! Earned +${activeLesson.coinsReward} FLOW Coins! 🪙`);
      }
    } else {
      setQuizSuccess(false);
      showToast('Oops, that is not correct. Try reading the lesson again!', 'error');
    }
  };

  if (activeLesson) {
    const lessonDone = isCompleted(activeLesson.id);
    return (
      <div className="space-y-6 text-left">
        <button 
          onClick={() => setActiveLesson(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Academy
        </button>

        <div className="bg-background border border-border rounded-2xl p-6 space-y-6 max-w-3xl mx-auto shadow-sm">
          {/* Header */}
          <div className="space-y-1.5 border-b border-border pb-4">
            <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-[10px] font-bold uppercase tracking-wide border border-yellow-500/20">
              {activeLesson.category}
            </span>
            <h3 className="font-display font-black text-xl text-foreground mt-1.5">{activeLesson.title}</h3>
            <p className="text-xs text-muted-foreground">Completion Reward: <strong className="text-yellow-500">🪙 {activeLesson.coinsReward} Coins</strong></p>
          </div>

          {/* Core Content */}
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            {activeLesson.content.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>

          {/* Interactive Quiz Section */}
          <div className="p-5 rounded-xl bg-surface-2 border border-border space-y-4">
            <h4 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
              <GraduationCap className="w-5 h-5 text-yellow-500 shrink-0" /> Lesson Quiz Verification
            </h4>
            <p className="text-xs text-foreground font-semibold">{activeLesson.quiz.question}</p>
            
            <div className="space-y-2">
              {activeLesson.quiz.options.map((opt, optIdx) => {
                let borderClass = 'border-border';
                if (selectedOption === optIdx) borderClass = 'border-yellow-500/50 bg-yellow-500/5';
                if (quizSubmitted) {
                  if (optIdx === activeLesson.quiz.correctIndex) borderClass = 'border-success bg-success/10 text-success';
                  else if (selectedOption === optIdx) borderClass = 'border-destructive bg-destructive/10 text-destructive';
                }
                return (
                  <button 
                    key={optIdx}
                    type="button"
                    disabled={quizSubmitted && quizSuccess}
                    onClick={() => setSelectedOption(optIdx)}
                    className={`w-full p-3 rounded-lg border text-left text-xs font-display font-semibold transition-all ${borderClass}`}
                  >
                    {optIdx + 1}. {opt}
                  </button>
                );
              })}
            </div>

            {!quizSubmitted ? (
              <button 
                onClick={handleQuizSubmit}
                disabled={selectedOption === null}
                className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-display font-bold text-xs shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
              >
                Submit Answer
              </button>
            ) : quizSuccess ? (
              <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-center text-xs text-success font-display font-bold flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" /> Lesson Completed! +{activeLesson.coinsReward} Coins Earned!
              </div>
            ) : (
              <button 
                onClick={() => setQuizSubmitted(false)}
                className="w-full py-2.5 rounded-xl bg-surface-3 border border-border hover:bg-surface-4 text-foreground font-display font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Try Quiz Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-yellow-500" /> Flow Academy
        </h2>
        <p className="text-sm text-muted-foreground">Boost your business acumen with micro-lessons and earn rewards.</p>
      </div>

      {/* Rewards card */}
      <div className="p-4 rounded-2xl bg-card/60 border border-yellow-500/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-yellow-500 shrink-0" />
          <div>
            <h4 className="font-display font-bold text-sm text-foreground">Academy Completion Status</h4>
            <p className="text-xs text-muted-foreground">{completedLessons.length} of {lessons.length} modules cleared.</p>
          </div>
        </div>
        <span className="px-3.5 py-1.5 rounded-full bg-background border border-border text-yellow-500 font-display font-black text-sm">
          🪙 {store.coins || 0} Coins
        </span>
      </div>

      {/* Lessons List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {lessons.map(l => {
          const done = isCompleted(l.id);
          return (
            <div 
              key={l.id} 
              className={`p-5 rounded-2xl bg-background border hover:border-yellow-500/25 transition-all flex flex-col justify-between gap-4 shadow-sm ${
                done ? 'border-success/30 bg-gradient-to-br from-success/5 to-transparent' : 'border-border'
              }`}
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <span className="px-2 py-0.5 rounded bg-surface-2 border border-border text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                    {l.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">{l.duration}</span>
                </div>
                <h3 className="font-display font-bold text-base text-foreground mt-1 leading-tight">{l.title}</h3>
                <p className="text-xs text-muted-foreground leading-normal">{l.description}</p>
              </div>

              <div className="flex justify-between items-center border-t border-border/60 pt-3">
                <span className="text-[10px] font-bold text-yellow-500 flex items-center gap-0.5">
                  🪙 +{l.coinsReward} Coins
                </span>
                
                <button 
                  onClick={() => startLesson(l)}
                  className={`px-3 py-1.5 rounded-lg border font-display font-bold text-xs flex items-center gap-1 transition-all ${
                    done 
                      ? 'bg-success/10 border-success/30 text-success' 
                      : 'bg-yellow-500 border-yellow-500 text-primary-foreground hover:bg-yellow-600'
                  }`}
                >
                  {done ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Review
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3.5 h-3.5 shrink-0" /> Learn <ChevronRight className="w-3 h-3 shrink-0" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
