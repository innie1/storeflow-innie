import { useEffect, useState } from 'react';
import { StoreData } from '@/types/store';
import { X, TrendingUp } from 'lucide-react';
import {
  fetchPredictionLogs, reconcilePredictions, overallAccuracy,
  ReconciledPrediction,
} from '@/lib/prediction-log';

interface PredictionHistoryProps {
  store: StoreData;
  onClose: () => void;
}

const OUTCOME_STYLE: Record<string, string> = {
  'Prediction achieved.': 'text-success',
  'Performance exceeded prediction.': 'text-primary',
  'Performance below prediction.': 'text-warning',
};

export default function PredictionHistory({ store, onClose }: PredictionHistoryProps) {
  const [items, setItems] = useState<ReconciledPrediction[] | null>(null);

  useEffect(() => {
    fetchPredictionLogs(store).then(logs => {
      setItems(reconcilePredictions(store, logs));
    });
  }, [store.id]);

  const accuracy = items ? overallAccuracy(items) : null;
  const resolvedCount = items ? items.filter(i => i.resolved).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-base font-display font-bold">Prediction History</h3>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {accuracy !== null && (
        <div className="px-4 py-3 border-b border-border/60">
          <p className="text-2xl font-display font-bold">{accuracy}%</p>
          <p className="text-xs text-muted-foreground">Average accuracy across {resolvedCount} resolved prediction{resolvedCount === 1 ? '' : 's'}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {items === null && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2/40 animate-pulse" />)}
          </div>
        )}

        {items !== null && items.length === 0 && (
          <div className="text-center py-16">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No prediction history yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Every forecast you view from now on gets logged here, so history builds up over time.</p>
          </div>
        )}

        {items?.map(p => (
          <div key={p.id} className="p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between mb-1">
              <p className="font-display font-semibold text-sm">{p.label}</p>
              <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-1.5">
              <div>
                <p className="text-muted-foreground">Predicted</p>
                <p className="font-display font-semibold">₦{Math.round(p.predicted_revenue).toLocaleString()}</p>
              </div>
              {p.resolved && p.actualRevenue !== null && (
                <div>
                  <p className="text-muted-foreground">Actual</p>
                  <p className="font-display font-semibold">₦{Math.round(p.actualRevenue).toLocaleString()}</p>
                </div>
              )}
            </div>

            {!p.resolved && (
              <p className="text-[11px] text-muted-foreground italic">Target date hasn't arrived yet — resolves {new Date(p.target_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}.</p>
            )}

            {p.resolved && p.outcomeMessage && (
              <div className="flex items-center justify-between mt-1">
                <span className={`text-xs font-display font-semibold ${OUTCOME_STYLE[p.outcomeMessage] || 'text-foreground'}`}>{p.outcomeMessage}</span>
                {p.accuracyPct !== null && <span className="text-[10px] text-muted-foreground">{p.accuracyPct}% accurate</span>}
              </div>
            )}

            {p.feedback && (
              <p className="text-[10px] text-muted-foreground mt-1">
                You rated this {p.feedback === 'correct' ? '👍 correct' : '👎 incorrect'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
