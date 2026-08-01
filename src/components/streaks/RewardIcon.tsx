import { Glasses, Smartphone, Headphones, Watch, Camera, Backpack, Trophy, Guitar } from 'lucide-react';

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
      <path d="M24 3v6M45 24h-6M24 45v-6M3 24h6M38.5 9.5l-4.2 4.2M38.5 38.5l-4.2-4.2M9.5 38.5l4.2-4.2M9.5 9.5l4.2 4.2" stroke="#0b0b12" strokeWidth="1" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

const ICON_MAP: Record<string, (props: { size?: number; className?: string }) => JSX.Element> = {
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
