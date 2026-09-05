import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import Mascot from '@/components/Mascot';
import type { FlowReport, FlowReportSection, FlowReportTone } from '@/lib/manager-intel';
import type { AutoFixSpec } from '@/lib/auto-fix';
import type { TabId } from '@/types/store';
import type { ProductFocus } from '@/lib/product-focus';

interface Props {
  report: FlowReport;
  onDismiss: () => void;
  onNavigate?: (tab: TabId, focus?: ProductFocus) => void;
  onAutoFix: (spec: AutoFixSpec) => void;
}

/**
 * The Get Advice report.
 *
 * It used to be markdown fed to the greeting Typewriter, which puts raw
 * characters into a <span> — so the merchant read the markup itself ("###",
 * "**41/100**") one character every 30ms, about 45 seconds for a full report,
 * unskippable, re-rendering the manager screen on every character.
 *
 * It also printed the same five sections in the same order every time, so a
 * sold-out product sat below a paragraph saying expenses were fine. Sections
 * now arrive ranked by what they found: the worst one is pulled out as a
 * headline with its actions attached, and the rest collapse.
 */
export default function FlowAdviceReport({ report, onDismiss, onNavigate, onAutoFix }: Props) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const spoken = useMemo(() => reportToText(report), [report]);

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);

  // Reading aloud is now something you ask for. It used to start by itself on
  // every report, with no way to stop it short of leaving the screen.
  const toggleSpeech = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = 0.98;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(spoken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  if (report.onboarding) {
    return (
      <div className="rounded-2xl border border-border bg-surface-2/40 p-4 flex items-start gap-3 animate-fade-in">
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full"><Mascot size={30} mood="happy" /></span>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{report.onboarding}</p>
      </div>
    );
  }

  const rest = report.headline
    ? report.sections.filter(s => s.id !== report.headline!.id)
    : report.sections;

  return (
    <div className="rounded-2xl bg-card border border-primary/25 shadow-card overflow-hidden animate-fade-in">
      <div className="h-[3px] bg-gradient-to-r from-primary via-[#9b5de5] to-success" />

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full"><Mascot size={24} mood="thinking" /></span>
        <h4 className="flex-1 min-w-0 font-display font-bold text-xs uppercase tracking-wider text-primary truncate">
          Flow's Analysis
        </h4>
        <IconButton label={speaking ? 'Stop reading aloud' : 'Read this aloud'} onClick={toggleSpeech} active={speaking}>
          {speaking ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </IconButton>
        <IconButton label="Copy report" onClick={copy}>
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </IconButton>
        <IconButton label="Dismiss report" onClick={onDismiss}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      <div className="px-3 pb-3 space-y-2">
        <p className="text-[12px] leading-relaxed text-muted-foreground">{report.intro}</p>

        {report.headline && (
          <SectionCard section={report.headline} lead onNavigate={onNavigate} onAutoFix={onAutoFix} />
        )}

        {rest.length > 0 && (
          <>
            {/* The other sections are most of why this screen felt heavy: four
                more blocks of prose whether or not any of them had anything to
                say. They stay one tap away instead. */}
            <button
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface-2/30 text-left hover:bg-surface-2/60 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-xs font-display font-bold">
                  {expanded ? 'Hide the rest' : 'See the full picture'}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {rest.map(s => s.heading).join(' · ')}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
              <div className="space-y-2">
                {rest.map((s, i) => (
                  <SectionCard
                    key={s.id}
                    section={s}
                    onNavigate={onNavigate}
                    onAutoFix={onAutoFix}
                    style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, active, children }: {
  label: string; onClick: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary hover:bg-surface-2/60'
      }`}
    >
      {children}
    </button>
  );
}

function SectionCard({ section, lead, onNavigate, onAutoFix, style }: {
  section: FlowReportSection;
  lead?: boolean;
  onNavigate?: (tab: TabId, focus?: ProductFocus) => void;
  onAutoFix: (spec: AutoFixSpec) => void;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`rounded-xl border p-3 animate-fade-in ${toneClass(section.tone)}`} style={style}>
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="text-sm leading-5 shrink-0">{section.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h5 className="font-display font-bold text-xs text-foreground/70">{section.heading}</h5>
            {lead && (section.tone === 'critical' || section.tone === 'warning') && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-display font-bold shrink-0 ${
                section.tone === 'critical' ? 'bg-destructive text-white' : 'bg-warning text-white'
              }`}>
                {section.tone === 'critical' ? 'URGENT' : 'WATCH'}
              </span>
            )}
          </div>

          <p className={`mt-0.5 leading-snug ${lead ? 'text-sm font-display font-bold text-foreground' : 'text-[13px] text-foreground'}`}>
            {section.summary}
          </p>

          {section.detail.map((d, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-muted-foreground mt-1">{d}</p>
          ))}

          {section.items && section.items.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
              {section.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate">{it.name}</span>
                  <span className="text-muted-foreground shrink-0">{it.note}</span>
                </div>
              ))}
            </div>
          )}

          {section.actions && section.actions.length > 0 && (
            <div className="flex gap-2 mt-2.5">
              {section.actions.map(a => (
                <button
                  key={a.label}
                  onClick={() => a.autoFix ? onAutoFix(a.autoFix) : a.goTo && onNavigate?.(a.goTo, a.focus)}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold active:scale-[0.97] transition flex items-center justify-center gap-1 ${
                    a.autoFix ? 'bg-foreground/90 text-background' : 'border border-current/25'
                  }`}
                >
                  {a.autoFix && <Zap className="w-3.5 h-3.5" />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function toneClass(tone: FlowReportTone) {
  if (tone === 'critical') return 'border-destructive/30 bg-destructive/5';
  if (tone === 'warning') return 'border-warning/30 bg-warning/5';
  if (tone === 'good') return 'border-success/25 bg-success/5';
  return 'border-border bg-surface-2/30';
}

/** Plain text for the clipboard and for reading aloud. */
function reportToText(report: FlowReport): string {
  if (report.onboarding) return report.onboarding;
  const lines = [report.intro];
  for (const s of report.sections) {
    lines.push('', `${s.heading}: ${s.summary}`, ...s.detail);
    if (s.items) lines.push(...s.items.map(i => `- ${i.name}: ${i.note}`));
  }
  return lines.join('\n').trim();
}
