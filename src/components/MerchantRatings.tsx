import { useEffect, useState } from 'react';
import { StoreData } from '@/types/store';
import { X, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';

interface MerchantRatingsProps {
  store: StoreData;
  onClose: () => void;
}

interface RatingRow {
  id: string;
  customer_phone: string;
  rating: number;
  tags: string[];
  created_at: string;
}

// Same digits-only, country-code-prefixed formatting wa.me requires as
// Orders.tsx — kept local rather than shared to avoid coupling this file
// to Orders.tsx's internals for one helper.
function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  return digits;
}

function openWhatsApp(phone: string, message: string) {
  if (!phone) return;
  window.open(`https://wa.me/${sanitizePhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`, '_blank');
}

export default function MerchantRatings({ store, onClose }: MerchantRatingsProps) {
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);

  useEffect(() => {
    if (!store.id) { setRatings([]); return; }
    supabase
      .from('store_ratings')
      .select('id, customer_phone, rating, tags, created_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) {
          showToast(`Couldn't load ratings: ${error.message}`, 'error');
          setRatings([]);
          return;
        }
        setRatings((data || []) as RatingRow[]);
      });
  }, [store.id]);

  const avg = ratings && ratings.length > 0
    ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
    : null;

  const thankYou = (r: RatingRow) => {
    openWhatsApp(r.customer_phone, `Thank you so much for your review of ${store.storeName}! We really appreciate you taking the time. 🙏`);
  };

  const sendOffer = (r: RatingRow) => {
    openWhatsApp(r.customer_phone, `Hi! As a thank-you for your review of ${store.storeName}, here's a little something special for your next visit. Come say hello! 🎁`);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-warning fill-warning" />
          <h3 className="text-base font-display font-bold">Customer Ratings</h3>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {avg && (
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <span className="text-2xl font-display font-bold">{avg}</span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className={`w-4 h-4 ${i <= Math.round(Number(avg)) ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">({ratings!.length} review{ratings!.length === 1 ? '' : 's'})</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {ratings === null && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2/40 animate-pulse" />)}
          </div>
        )}

        {ratings !== null && ratings.length === 0 && (
          <div className="text-center py-16">
            <Star className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Ratings customers leave after an order will show up here.</p>
          </div>
        )}

        {ratings?.map(r => (
          <div key={r.id} className="p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
            </div>
            {r.tags && r.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {r.tags.map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2/60 text-muted-foreground">{t}</span>
                ))}
              </div>
            )}
            {r.customer_phone && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => thankYou(r)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-display font-semibold border border-border active:scale-[0.97] transition"
                >
                  Thank You
                </button>
                <button
                  onClick={() => sendOffer(r)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-display font-semibold bg-primary/10 text-primary active:scale-[0.97] transition"
                >
                  🎁 Send Offer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
