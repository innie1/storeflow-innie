import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, Volume2, VolumeX, X } from 'lucide-react';

interface Props {
  report: string;
  onDismiss: () => void;
}

interface Section {
  heading: string;
  emoji: string;
  paragraphs: string[];
  items: string[];
  tone: 'critical' | 'warning' | 'neutral';
}

/**
 * Renders the Get Advice report.
 *
 * The report is written as markdown — `### 📊 Store Performance Summary`,
 * `**₦167,000**` — but it was being fed to the greeting Typewriter, which puts
 * raw characters into a <span>. So the merchant read the markup: literal hashes
 * and asterisks, and every paragraph break collapsed into one wall of text.
 *
 * The typing made it worse. At one character per 30ms a ~1,500 character report
 * took roughly 45 seconds to finish, could not be skipped, and re-rendered the
 * whole manager screen on every character. A report is for scanning, so this
 * shows it at once and fades the sections in.
 */
export default function FlowAdviceReport({ report, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const { intro, sections } = useMemo(() => parseReport(report), [report]);

  // Reading the report aloud is now something you ask for. It used to start by
  // itself on every report, with no way to stop it short of leaving the screen.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);

  const toggleSpeech = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const spoken = report.replace(/[*#_`>[\]]/g, '').replace(/\s+/g, ' ').trim();
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
      await navigator.clipboard.writeText(report.replace(/\*\*/g, '').replace(/^### /gm, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="rounded-2xl bg-card border border-primary/25 shadow-card overflow-hidden animate-fade-in">
      <div className="h-[3px] bg-gradient-to-r from-primary via-[#9b5de5] to-success" />

      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
        <h4 className="flex-1 min-w-0 font-display font-bold text-xs uppercase tracking-wider text-primary truncate">
          Flow's Analysis
        </h4>
        <button
          onClick={toggleSpeech}
          aria-label={speaking ? 'Stop reading aloud' : 'Read this aloud'}
          className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
            speaking ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary hover:bg-surface-2/60'
          }`}
        >
          {speaking ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button
          onClick={copy}
          aria-label="Copy report"
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-surface-2/60 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss report"
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        {intro && <p className="text-[13px] leading-relaxed text-muted-foreground">{inline(intro)}</p>}

        {/* Every section is in the DOM from the first render — the stagger is
            only the fade, so nothing is hidden from a screen reader (or a test)
            behind a timer. */}
        {sections.map((s, i) => (
          <section
            key={s.heading + i}
            className={`rounded-xl border p-3 animate-fade-in ${toneClass(s.tone)}`}
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'backwards' }}
          >
            <h5 className="flex items-center gap-1.5 font-display font-bold text-xs mb-1.5">
              {s.emoji && <span aria-hidden="true">{s.emoji}</span>}
              <span>{s.heading}</span>
            </h5>
            {s.paragraphs.map((p, n) => (
              <p key={n} className="text-[13px] leading-relaxed text-foreground/90 [&+p]:mt-1.5">{inline(p)}</p>
            ))}
            {s.items.length > 0 && (
              <ol className="mt-1.5 space-y-1.5">
                {s.items.map((item, n) => (
                  <li key={n} className="flex gap-2 text-[13px] leading-relaxed">
                    <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                      {n + 1}
                    </span>
                    <span>{inline(item)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function toneClass(tone: Section['tone']) {
  if (tone === 'critical') return 'border-destructive/30 bg-destructive/5';
  if (tone === 'warning') return 'border-warning/30 bg-warning/5';
  return 'border-border bg-surface-2/30';
}

/** `**bold**` → <strong>, everything else as-is. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function parseReport(report: string): { intro: string; sections: Section[] } {
  const lines = report.split('\n');
  const sections: Section[] = [];
  const introParts: string[] = [];
  let current: Section | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const title = heading[1].trim();
      // Headings lead with an emoji ("📦 Inventory Diagnostics"); pull it out so
      // it can sit as an icon rather than inside the text.
      const withEmoji = title.match(/^([^\w\s])\s*(.*)$/u);
      current = {
        emoji: withEmoji ? withEmoji[1] : '',
        heading: withEmoji ? withEmoji[2] : title,
        paragraphs: [],
        items: [],
        tone: 'neutral',
      };
      sections.push(current);
      continue;
    }

    if (!current) { introParts.push(line); continue; }

    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) current.items.push(numbered[1]);
    else current.paragraphs.push(line);

    if (/🚨|Critical|Critically|dangerously high|negative profit/i.test(line)) current.tone = 'critical';
    else if (current.tone !== 'critical' && /⚠️|⚠|decline of|running low|thin at|overdue/i.test(line)) current.tone = 'warning';
  }

  return { intro: introParts.join(' '), sections };
}
