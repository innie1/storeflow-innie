import type { StoreData, StoreType } from '@/types/store';

/**
 * Manchant's business engine is configuration-driven, but the configuration is
 * intentionally hidden from owners. A business template is the small amount
 * of information the app needs to automatically prepare the right experience.
 *
 * Keep this file declarative. Do not add business-specific React components
 * here. New business types should normally be a template, not a new engine.
 */

export type BusinessMode = 'products' | 'services' | 'appointments' | 'sessions' | 'metered';

export type BusinessModule =
  | 'inventory'
  | 'sales'
  | 'orders'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'reports'
  | 'staff'
  | 'delivery'
  | 'pickup'
  | 'attachments'
  | 'scheduling'
  | 'measurements'
  | 'sessions'
  | 'queue'
  | 'metering';

export interface BusinessOfferingTemplate {
  id: string;
  name: string;
  icon: string;
  mode: BusinessMode;
  /** Optional starter choices shown in the owner/customer UI. */
  options?: string[];
  /** Whether the owner normally charges by item, kg, litre, time or fixed job. */
  pricing?: 'fixed' | 'item' | 'weight' | 'volume' | 'time' | 'custom';
  /** Starter price is deliberately absent unless the price is intrinsic to the mode. */
  price?: number;
}

export interface BusinessTemplate {
  type: StoreType;
  name: string;
  icon: string;
  description: string;
  modes: BusinessMode[];
  modules: BusinessModule[];
  offerings: BusinessOfferingTemplate[];
  /** Friendly labels used by the UI; no technical terms should leak to owners. */
  labels: {
    primaryAction: string;
    orderNoun: string;
    offeringNoun: string;
  };
}

const commonCommerce: BusinessModule[] = [
  'customers', 'finance', 'reports', 'staff',
];

export const BUSINESS_TEMPLATES: Record<StoreType, BusinessTemplate> = {
  provision: {
    type: 'provision', name: 'Provision / Supermarket', icon: '🛒',
    description: 'Sell everyday products with inventory, sales, customers and suppliers.',
    modes: ['products'],
    modules: ['inventory', 'sales', 'suppliers', ...commonCommerce],
    offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' },
  },
  clothing: {
    type: 'clothing', name: 'Clothing / Fashion', icon: '👕',
    description: 'Sell clothing and fashion products with stock and customer orders.',
    modes: ['products'],
    modules: ['inventory', 'sales', 'suppliers', ...commonCommerce],
    offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Order', offeringNoun: 'Product' },
  },
  food: {
    type: 'food', name: 'Food Business', icon: '🍲',
    description: 'Sell food and prepared items with simple customer ordering.',
    modes: ['products', 'services'],
    modules: ['inventory', 'sales', 'orders', 'customers', 'finance', 'reports', 'staff', 'delivery', 'pickup'],
    offerings: [
      { id: 'food-order', name: 'Food Order', icon: '🍲', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'Take Order', orderNoun: 'Order', offeringNoun: 'Menu Item' },
  },
  electronics: {
    type: 'electronics', name: 'Electronics', icon: '📱',
    description: 'Sell electronics and accessories with stock and product sales.',
    modes: ['products'],
    modules: ['inventory', 'sales', 'suppliers', ...commonCommerce],
    offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' },
  },
  laundry: {
    type: 'laundry', name: 'Laundry', icon: '🧺',
    description: 'Take laundry orders by clothes, weight or service and track every job.',
    modes: ['services'],
    modules: ['orders', 'customers', 'finance', 'reports', 'staff', 'pickup', 'delivery', 'attachments', 'queue'],
    offerings: [
      { id: 'wash-iron', name: 'Wash & Iron', icon: '🧺', mode: 'services', pricing: 'item' },
      { id: 'wash-only', name: 'Wash Only', icon: '🫧', mode: 'services', pricing: 'item' },
      { id: 'iron-only', name: 'Ironing', icon: '👔', mode: 'services', pricing: 'item' },
      { id: 'dry-cleaning', name: 'Dry Cleaning', icon: '✨', mode: 'services', pricing: 'item' },
      { id: 'express', name: 'Express Laundry', icon: '⚡', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Laundry Order', orderNoun: 'Laundry Order', offeringNoun: 'Service' },
  },
  gas_filling: {
    type: 'gas_filling', name: 'Gas', icon: '⛽',
    description: 'Sell gas by quantity and manage cylinders, delivery and customer orders.',
    modes: ['metered', 'products'],
    modules: ['inventory', 'sales', 'orders', 'customers', 'suppliers', 'finance', 'reports', 'staff', 'delivery', 'pickup', 'metering'],
    offerings: [
      { id: 'gas-refill', name: 'Gas Refill', icon: '⛽', mode: 'metered', pricing: 'weight' },
      { id: 'cylinder', name: 'Cylinder', icon: '🛢️', mode: 'products', pricing: 'fixed' },
      { id: 'delivery', name: 'Gas Delivery', icon: '🚚', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Gas Sale', orderNoun: 'Gas Order', offeringNoun: 'Gas / Service' },
  },
  restaurant: {
    type: 'restaurant', name: 'Restaurant / Food', icon: '🍔',
    description: 'Take food orders, manage menu items and track preparation and delivery.',
    modes: ['products', 'services'],
    modules: ['inventory', 'sales', 'orders', 'customers', 'suppliers', 'finance', 'reports', 'staff', 'delivery', 'pickup', 'queue'],
    offerings: [
      { id: 'menu', name: 'Menu', icon: '🍽️', mode: 'products', pricing: 'fixed' },
      { id: 'delivery', name: 'Delivery', icon: '🚚', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Order', orderNoun: 'Food Order', offeringNoun: 'Menu Item' },
  },
  games: {
    type: 'games', name: 'Gaming Centre', icon: '🎮',
    description: 'Run timed gaming sessions, track players, resources and revenue.',
    modes: ['sessions', 'products'],
    modules: ['sessions', 'customers', 'finance', 'reports', 'staff', 'queue'],
    offerings: [
      { id: 'playstation', name: 'PlayStation', icon: '🎮', mode: 'sessions', pricing: 'time' },
      { id: 'snooker', name: 'Snooker', icon: '🎱', mode: 'sessions', pricing: 'time' },
      { id: 'xbox', name: 'Xbox', icon: '🎮', mode: 'sessions', pricing: 'time' },
      { id: 'table-tennis', name: 'Table Tennis', icon: '🏓', mode: 'sessions', pricing: 'time' },
      { id: 'darts', name: 'Darts', icon: '🎯', mode: 'sessions', pricing: 'time' },
      { id: 'karaoke', name: 'Karaoke', icon: '🎤', mode: 'sessions', pricing: 'time' },
      { id: 'vr', name: 'VR Games', icon: '🥽', mode: 'sessions', pricing: 'time' },
    ],
    labels: { primaryAction: 'Start Session', orderNoun: 'Session', offeringNoun: 'Game / Resource' },
  },
  other: {
    type: 'other', name: 'Other Business', icon: '🏪',
    description: 'Start with a simple business setup and add products or services as needed.',
    modes: ['products', 'services'],
    modules: ['inventory', 'sales', 'orders', ...commonCommerce, 'attachments'],
    offerings: [],
    labels: { primaryAction: 'Get Started', orderNoun: 'Order', offeringNoun: 'Item / Service' },
  },
};

export function getBusinessTemplate(type?: StoreType): BusinessTemplate {
  return BUSINESS_TEMPLATES[type || 'provision'] || BUSINESS_TEMPLATES.provision;
}

/**
 * Attach the business template to a store without changing existing product,
 * sales, inventory or finance data. This makes the feature safe for existing
 * stores and gives the UI one source of truth for what should be shown.
 */
export function applyBusinessTemplate(store: StoreData, type?: StoreType): StoreData {
  const template = getBusinessTemplate(type || store.storeType);
  return {
    ...store,
    storeType: template.type,
    businessTemplate: {
      version: 1,
      type: template.type,
      modes: template.modes,
      modules: template.modules,
      offerings: template.offerings,
      labels: template.labels,
    },
  } as StoreData;
}

export function getBusinessPrimaryAction(type?: StoreType): string {
  return getBusinessTemplate(type).labels.primaryAction;
}

export function getBusinessTemplateOptions() {
  return Object.values(BUSINESS_TEMPLATES).map(({ type, name, icon, description }) => ({
    type,
    name,
    icon,
    description,
  }));
}
