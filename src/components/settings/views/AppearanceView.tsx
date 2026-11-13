import { THEMES } from '@/lib/theme';
import DayNightToggle from '@/components/DayNightToggle';
import ToggleRow from '@/components/Toggle';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function AppearanceView({ s }: { s: SettingsState }) {
  const { setView, theme, mgr, updateMgr, handleThemeChange } = s;
  return (
    <SubPage title="Appearance" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <h3 className="font-display font-bold text-sm text-center">Display Mode</h3>
        <DayNightToggle />
      </div>
      <div className={`${card} p-4 space-y-3`}>
        <h3 className="font-display font-bold text-sm">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-center transition-all ${theme === t.id ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30' : 'bg-surface-2 border-border'}`}>
              {theme === t.id && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">✓</span>}
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg border border-border" style={{ background: t.swatch }}>{t.emoji}</div>
              <p className="font-display font-semibold text-xs">{t.label}</p>
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Mascot Animations" description="Animate Flow across the app." checked={mgr.mascotAnimations} onChange={v => updateMgr({ mascotAnimations: v })} />
        <ToggleRow label="Number Animations" description="Count up and pulse numeric statistics." checked={mgr.numericAnimations ?? true} onChange={v => updateMgr({ numericAnimations: v })} />
        <ToggleRow label="Reduce Motion" checked={mgr.reduceMotion} onChange={v => updateMgr({ reduceMotion: v })} />
        <ToggleRow label="Compact Mode" description="Tighter spacing across cards." checked={mgr.compactMode} onChange={v => updateMgr({ compactMode: v })} />
      </div>
    </SubPage>
  );
}
