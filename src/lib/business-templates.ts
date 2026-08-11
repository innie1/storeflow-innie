import type { StoreData, StoreType } from '@/types/store';

/**
 * Lean business templates. These are starter defaults, not a technical
 * configuration screen. Owners should normally only edit ordinary things
 * such as products, services and prices.
 */
export type BusinessMode = 'products' | 'services' | 'appointments' | 'sessions' | 'metered';
export type BusinessModule =
  | 'inventory' | 'sales' | 'orders' | 'customers' | 'suppliers' | 'finance' | 'reports'
  | 'staff' | 'delivery' | 'pickup' | 'attachments' | 'scheduling' | 'measurements'
  | 'sessions' | 'queue' | 'metering';

export interface BusinessOfferingTemplate {
  id: string;
  name: string;
  icon: string;
  mode: BusinessMode;
  pricing?: 'fixed' | 'item' | 'weight' | 'volume' | 'time' | 'custom';
  price?: number;
  options?: string[];
}

export interface BusinessTemplate {
  type: StoreType;
  name: string;
  icon: string;
  description: string;
  modes: BusinessMode[];
  modules: BusinessModule[];
  offerings: BusinessOfferingTemplate[];
  labels: { primaryAction: string; orderNoun: string; offeringNoun: string };
  customerFeatures: {
    quantity?: boolean;
    clothingTypes?: boolean;
    photos?: boolean;
    files?: boolean;
    notes?: boolean;
    pickup?: boolean;
    delivery?: boolean;
    scheduling?: boolean;
    sessions?: boolean;
    metering?: boolean;
  };
  workflow: string[];
}

const commerce: BusinessModule[] = ['customers', 'finance', 'reports', 'staff'];

export const BUSINESS_TEMPLATES: Record<StoreType, BusinessTemplate> = {
  provision: {
    type: 'provision', name: 'Provision / Supermarket', icon: '🛒',
    description: 'Sell everyday products with inventory, sales, customers and suppliers.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' },
    customerFeatures: { quantity: true }, workflow: ['cart', 'checkout', 'complete']
  },
  clothing: {
    type: 'clothing', name: 'Clothing / Fashion', icon: '👕',
    description: 'Sell clothing and fashion products.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Order', offeringNoun: 'Product' },
    customerFeatures: { quantity: true, photos: true }, workflow: ['cart', 'checkout', 'complete']
  },
  food: {
    type: 'food', name: 'Food Business', icon: '🍲',
    description: 'Sell food and prepared items with simple ordering.',
    modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'delivery', 'pickup', 'queue'], offerings: [],
    labels: { primaryAction: 'Take Order', orderNoun: 'Order', offeringNoun: 'Menu Item' },
    customerFeatures: { quantity: true, notes: true, pickup: true, delivery: true }, workflow: ['received', 'preparing', 'ready', 'completed']
  },
  electronics: {
    type: 'electronics', name: 'Electronics', icon: '📱',
    description: 'Sell electronics and accessories.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' },
    customerFeatures: { quantity: true, photos: true }, workflow: ['cart', 'checkout', 'complete']
  },
  laundry: {
    type: 'laundry', name: 'Laundry', icon: '🧺',
    description: 'Take laundry orders by number of clothes, item type or weight.',
    modes: ['services'], modules: ['orders', ...commerce, 'pickup', 'delivery', 'attachments', 'queue'],
    offerings: [
      { id: 'wash-iron', name: 'Wash & Iron', icon: '🧺', mode: 'services', pricing: 'item' },
      { id: 'wash-only', name: 'Wash Only', icon: '🫧', mode: 'services', pricing: 'item' },
      { id: 'iron-only', name: 'Ironing', icon: '👔', mode: 'services', pricing: 'item' },
      { id: 'dry-cleaning', name: 'Dry Cleaning', icon: '✨', mode: 'services', pricing: 'item' },
      { id: 'express', name: 'Express Laundry', icon: '⚡', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Laundry Order', orderNoun: 'Laundry Order', offeringNoun: 'Service' },
    customerFeatures: { quantity: true, clothingTypes: true, photos: true, files: true, notes: true, pickup: true, delivery: true },
    workflow: ['received', 'washing', 'drying', 'ironing', 'ready', 'collected']
  },
  gas_filling: {
    type: 'gas_filling', name: 'Gas Filling', icon: '⛽',
    description: 'Sell gas by quantity and manage cylinders and delivery.',
    modes: ['metered', 'products'], modules: ['inventory', 'sales', 'orders', ...commerce, 'suppliers', 'delivery', 'pickup', 'metering'],
    offerings: [
      { id: 'gas-refill', name: 'Gas Refill', icon: '⛽', mode: 'metered', pricing: 'weight' },
      { id: 'cylinder', name: 'Cylinder', icon: '🛢️', mode: 'products', pricing: 'fixed' },
      { id: 'delivery', name: 'Gas Delivery', icon: '🚚', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Gas Sale', orderNoun: 'Gas Order', offeringNoun: 'Gas / Service' },
    customerFeatures: { quantity: true, notes: true, delivery: true, pickup: true, metering: true },
    workflow: ['received', 'confirmed', 'ready', 'delivered']
  },
  restaurant: {
    type: 'restaurant', name: 'Restaurant / Food', icon: '🍔',
    description: 'Take food orders, manage menu items and preparation.',
    modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'suppliers', 'delivery', 'pickup', 'queue'],
    offerings: [], labels: { primaryAction: 'New Order', orderNoun: 'Food Order', offeringNoun: 'Menu Item' },
    customerFeatures: { quantity: true, notes: true, pickup: true, delivery: true }, workflow: ['received', 'preparing', 'ready', 'completed']
  },
  games: {
    type: 'games', name: 'Gaming Centre', icon: '🎮',
    description: 'Run timed gaming sessions and track players and revenue.',
    modes: ['sessions', 'products'], modules: ['sessions', ...commerce, 'queue'],
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
    customerFeatures: { sessions: true, scheduling: true }, workflow: ['booked', 'active', 'completed']
  },
  other: {
    type: 'other', name: 'Other Business', icon: '🏪',
    description: 'Start simple and add products or services as needed.',
    modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'attachments'], offerings: [],
    labels: { primaryAction: 'Get Started', orderNoun: 'Order', offeringNoun: 'Item / Service' },
    customerFeatures: { quantity: true, photos: true, files: true, notes: true }, workflow: ['received', 'completed']
  },
};

export function getBusinessTemplate(type?: StoreType): BusinessTemplate {
  return BUSINESS_TEMPLATES[type || 'provision'] || BUSINESS_TEMPLATES.provision;
}

export function getBusinessPrimaryAction(type?: StoreType): string {
  return getBusinessTemplate(type).labels.primaryAction;
}

export function getBusinessTemplateOptions() {
  return Object.values(BUSINESS_TEMPLATES).map(({ type, name, icon, description }) => ({ type, name, icon, description }));
}

/** Safe adapter for existing stores. It never removes inventory, sales or finance data. */
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
      customerFeatures: template.customerFeatures,
      workflow: template.workflow,
    },
  } as StoreData;
}
