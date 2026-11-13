import {
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Home,
  Landmark,
  Moon,
  Package,
  PartyPopper,
  PiggyBank,
  Receipt,
  Rocket,
  Shirt,
  ShoppingCart,
  Siren,
  Smile,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wand2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

/*
 * Flow's advice, insights and alerts carry an emoji each ("💳", "🧾"), set
 * where the advice is worked out. Drawn as they were, Flow was the one place in
 * the app with keyboard pictures beside the line icons every other screen uses,
 * so "Chase outstanding payments" wore a cartoon bank card while Pending
 * Payments, two taps away, wore the app's own.
 *
 * The emoji stays the key, because it already says what kind of message each
 * one is; this turns it into the app's icon.
 */
const BY_EMOJI: Record<string, LucideIcon> = {
  '💳': CreditCard,
  '🧾': Receipt,
  '📦': Package,
  '😴': Moon,
  '🚨': Siren,
  '📈': TrendingUp,
  '📉': TrendingDown,
  '💰': PiggyBank,
  '💸': Wallet,
  '🧺': Shirt,
  '🌟': Star,
  '⭐': Star,
  '🪄': Wand2,
  '🤔': HelpCircle,
  '🛒': ShoppingCart,
  '🚀': Rocket,
  '😎': Smile,
  '🕺': PartyPopper,
  '🎉': PartyPopper,
  '🗄': Archive,
  '🗃': Archive,
  '🔔': Bell,
  '🏦': Landmark,
  '🏠': Home,
  '⚠': AlertTriangle,
  '❌': XCircle,
  '✨': Sparkles,
  '✅': CheckCircle2,
};

/** The app's icon for one of Flow's emoji; a sparkle for any it does not know. */
export function iconForMessage(emoji: string | undefined | null): LucideIcon {
  // Without the variation selector, so "⚠️" and "⚠" are one key.
  const key = String(emoji || '').replace(/️/g, '').trim();
  return BY_EMOJI[key] || Sparkles;
}

export default function MessageIcon({ emoji, className = 'w-4 h-4' }: { emoji?: string | null; className?: string }) {
  const Icon = iconForMessage(emoji);
  return <Icon className={className} aria-hidden="true" />;
}
