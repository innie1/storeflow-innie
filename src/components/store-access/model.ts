import { StoreData, StoreCategory } from '@/types/store';

export interface StoreAccessProps {
  onStoreLoaded: (store: StoreData) => void;
}

export const CATEGORIES: { id: StoreCategory; label: string; icon: string; desc: string }[] = [
  { id: 'retail', label: 'Retail & Products', icon: '🛒', desc: 'Sell products, manage stock and sales' },
  { id: 'restaurant', label: 'Food & Restaurant', icon: '🍽️', desc: 'Menus, orders and delivery' },
  { id: 'games', label: 'Games & Entertainment', icon: '🎮', desc: 'Gaming, sessions and bookings' },
  { id: 'other', label: 'Services & Other', icon: '🛠️', desc: 'Laundry, barber, tailoring and more' },
];

export const QUESTIONS = [
  'What is your favorite food?',
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the name of your primary school?',
];
