import DateField from '@/components/DateField';

export const card = "bg-card shadow-card rounded-2xl";

export const tileBase = "w-full p-4 rounded-2xl bg-card shadow-card flex items-center gap-3 text-left transition-all hover:ring-1 hover:ring-primary/30";

export const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm";

// ---- small helpers ----
export function ProgressRing({ pct, size = 56, color = 'hsl(var(--success))' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth="4" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="4" fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        transform={`rotate(90 ${size/2} ${size/2})`}
        className="fill-foreground font-display font-bold" style={{ fontSize: 11 }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function IconBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-base"
      style={{ background: color + '20', color }}>
      {children}
    </div>
  );
}

/*
 * One back button, not two.
 *
 * This drew its own round back arrow beside the title while the page around it
 * already had a "Back" at the top left - two controls a centimetre apart that
 * looked alike and did different things. The outer one left Settings entirely
 * and landed on Home, which is the "it jumps pages, even to home" that was
 * reported: a merchant three levels deep tapped the nearer of two identical
 * arrows and lost their place.
 *
 * The page's own Back does both jobs now: up one level while there is one, out
 * to the dashboard at the top. `onBack` stays in the signature because every
 * call site passes it and it is still the handler that runs.
 */
export function SubPage({ title, subtitle, children, right }: { title: string; subtitle?: string; onBack: () => void; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}

// ============ small components ============
export function Field({ label, value, onChange, placeholder, type='text', trailing }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; trailing?: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {/* `relative` always, so anything passed in sits inside the field rather
          than pushing the row around. */}
      <div className="relative">
        {type === 'date'
          ? <DateField value={value} onChange={onChange} placeholder={placeholder} ariaLabel={label} />
          : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} className={`${inputClass} ${trailing ? 'pr-11' : ''}`} />}
        {trailing}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold pt-2 pb-1 px-1">
      {children}
    </p>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-bold capitalize">{value}</p>
    </div>
  );
}

export function NumberRow({ label, value, onChange, onSave }: { label: string; value: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <div>
      <p className="text-sm font-display font-semibold mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} className={inputClass + ' flex-1'} />
        <button onClick={onSave} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">Save</button>
      </div>
    </div>
  );
}

export function SettingTile({ icon, color, title, desc, right, onClick }: { icon: React.ReactNode; color: string; title: string; desc: string; right?: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={tileBase}>
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="flex-1 min-w-0">
        <h4 className="font-display font-bold text-sm leading-tight">{title}</h4>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{desc}</p>
      </div>
      {right && <div className="shrink-0 border-l border-border pl-3 text-right max-w-[160px]">{right}</div>}
      <span className="shrink-0 text-muted-foreground">›</span>
    </button>
  );
}

export function DataTile({ icon, label, subtitle, onClick, iconBg, iconColor }: { icon: React.ReactNode; label: string; subtitle: string; onClick: () => void; iconBg: string; iconColor: string }) {
  return (
    <button onClick={onClick} className="p-4.5 rounded-2xl bg-card border border-border flex flex-col items-center justify-center text-center gap-3 hover:border-primary/40 transition-all w-full cursor-pointer active:scale-[0.98]">
      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="font-display font-bold text-sm text-foreground">{label}</h4>
        <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
      </div>
    </button>
  );
}

export function SupportRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full p-4 flex items-center gap-3 hover:bg-surface-2 transition-colors">
      <span className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 text-left text-sm font-display font-semibold">{label}</span>
      <span className="text-muted-foreground">›</span>
    </button>
  );
}
