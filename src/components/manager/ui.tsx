

// ─── Ring ─────────────────────────────────────────────────────────────────────
export function Ring({ value, size = 100, stroke = 9, tone = 'primary' }: { value: number; size?: number; stroke?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)); const dash = (pct / 100) * c;
  const colors: Record<string, string> = { primary: 'hsl(var(--primary))', success: 'hsl(var(--success))', warning: 'hsl(var(--warning))', danger: 'hsl(var(--destructive))' };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--surface-2))" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={colors[tone]} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 800ms ease-out' }} />
    </svg>
  );
}

// ─── Activity graph helpers ───────────────────────────────────────────────────
export function activityColor(revenue: number, maxRevenue: number): string {
  if (revenue <= 0) return 'hsl(142 60% 25%)'; // Neutral/empty bar

  let greenThreshold = 10000;
  let yellowThreshold = 30000;

  if (maxRevenue > 30000) {
    greenThreshold = maxRevenue * 0.33;
    yellowThreshold = maxRevenue * 0.7;
  }

  if (revenue <= greenThreshold) {
    return 'hsl(140 65% 38%)'; // Green bar
  } else if (revenue <= yellowThreshold) {
    return 'hsl(50 95% 55%)'; // Yellowish bar
  } else {
    return 'hsl(18 95% 55%)'; // Gold bar
  }
}

export function fmtPlusInterval(min: number, interval = 30): string {
  const end = Math.min(1440, min + interval); const h = Math.floor(end / 60); const m = end % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Repayment Predictions Card ──────────────────────────────────────────────
export function fmtRelDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  if (diff > 0 && diff < 14) return `In ${diff}d · ${label}`;
  if (diff < 0 && diff > -14) return `${Math.abs(diff)}d ago · ${label}`;
  return label;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'primary' }) {
  return (
    <div className="p-2 rounded-lg bg-card border border-border/60">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-display font-bold ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
