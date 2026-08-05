import { 
  Glasses, 
  Smartphone, 
  Headphones, 
  Watch, 
  Camera, 
  Backpack, 
  Trophy, 
  Guitar,
  Coffee,
  Laptop,
  Armchair,
  Utensils,
  Image as ImageIcon,
  Moon,
  Dog,
  Sparkles,
  Tv,
  Gamepad2
} from 'lucide-react';

function PopcornIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 11V21H17V11" fill="rgba(244,63,94,0.2)" />
      <path d="M7 11L5 21H19L17 11" />
      <path d="M10 11V21" strokeDasharray="2 2" />
      <path d="M14 11V21" strokeDasharray="2 2" />
      <circle cx="9" cy="8" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="7" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="15" cy="8" r="2.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function VRHeadsetIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="8" width="18" height="9" rx="3" fill="rgba(56,189,248,0.2)" />
      <path d="M8 12.5H10.5" />
      <path d="M13.5 12.5H16" />
      <path d="M6 8V6A3 3 0 0 1 18 6V8" />
    </svg>
  );
}

function BurgerIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9a6 6 0 0 1 12 0H6z" fill="rgba(245,158,11,0.3)" />
      <path d="M5 13h14" strokeWidth="2.5" stroke="#22c55e" />
      <path d="M4 17h16" />
      <path d="M6 17v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

function TennisIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="10" cy="9" rx="6" ry="7" />
      <path d="M10 2v14M4 9h12" opacity="0.4" />
      <path d="M14 14l6 6" strokeWidth="2.5" />
      <circle cx="18" cy="6" r="2.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function SoccerBall({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="21" fill="url(#ball-grad)" stroke="#0b0b12" strokeWidth="1.5" />
      <defs>
        <radialGradient id="ball-grad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dcdfe6" />
        </radialGradient>
      </defs>
      <g stroke="#0b0b12" strokeWidth="1.3" strokeLinejoin="round" fill="#0b0b12">
        <path d="M24 15.5l5.3 3.85-2 6.25h-6.6l-2-6.25z" />
        <path d="M24 15.5l-5.3 3.85M24 15.5l5.3 3.85M18.7 19.35l-4.4 3.2M29.3 19.35l4.4 3.2M20.7 25.6l-2 6.3M27.3 25.6l2 6.3" fill="none" />
      </g>
    </svg>
  );
}

const ICON_MAP: Record<string, (props: { size?: number; className?: string }) => JSX.Element> = {
  popcorn: PopcornIcon,
  coffee: (p) => <Coffee {...p} strokeWidth={1.75} />,
  'vr-headset': VRHeadsetIcon,
  laptop: (p) => <Laptop {...p} strokeWidth={1.75} />,
  burger: BurgerIcon,
  spaghetti: (p) => <Utensils {...p} strokeWidth={1.75} />,
  armchair: (p) => <Armchair {...p} strokeWidth={1.75} />,
  tennis: TennisIcon,
  painting: (p) => <ImageIcon {...p} strokeWidth={1.75} />,
  waterfall: (p) => <Sparkles {...p} strokeWidth={1.75} />,
  cupcake: (p) => <Sparkles {...p} strokeWidth={1.75} />,
  moon: (p) => <Moon {...p} strokeWidth={1.75} />,
  'dog-house': (p) => <Dog {...p} strokeWidth={1.75} />,
  glasses: (p) => <Glasses {...p} strokeWidth={1.75} />,
  phone: (p) => <Smartphone {...p} strokeWidth={1.75} />,
  headphones: (p) => <Headphones {...p} strokeWidth={1.75} />,
  watch: (p) => <Watch {...p} strokeWidth={1.75} />,
  camera: (p) => <Camera {...p} strokeWidth={1.75} />,
  backpack: (p) => <Backpack {...p} strokeWidth={1.75} />,
  trophy: (p) => <Trophy {...p} strokeWidth={1.75} />,
  guitar: (p) => <Guitar {...p} strokeWidth={1.75} />,
  'soccer-ball': SoccerBall,
};

export default function RewardIcon({ itemId, size = 48, className = '' }: { itemId: string; size?: number; className?: string }) {
  const Icon = ICON_MAP[itemId] || Trophy;
  return <Icon size={size} className={className} />;
}

