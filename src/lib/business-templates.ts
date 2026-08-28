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

export interface BusinessCustomerExperience {
  primaryAction: string;
  intro: string;
  intake: ('quantity' | 'itemType' | 'options' | 'notes' | 'photo' | 'file' | 'date' | 'time' | 'pickup' | 'delivery' | 'meteredQuantity' | 'duration')[];
  simpleChoiceLabel?: string;
  simpleChoiceHint?: string;
}

export interface BusinessTemplate {
  type: string;
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
  customerExperience: BusinessCustomerExperience;
  workflow: string[];
}

const commerce: BusinessModule[] = ['customers', 'finance', 'reports', 'staff'];
const serviceCommerce: BusinessModule[] = ['orders', ...commerce, 'queue'];

export const BUSINESS_TEMPLATES: Record<string, BusinessTemplate> = {
  provision: {
    type: 'provision', name: 'Provision / Supermarket', icon: '🛒', description: 'Sell everyday products with inventory, sales, customers and suppliers.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' }, customerFeatures: { quantity: true },
    customerExperience: { primaryAction: 'Shop', intro: 'Choose what you want to buy.', intake: ['quantity'] }, workflow: ['cart', 'checkout', 'complete']
  },
  pharmacy: {
    type: 'pharmacy', name: 'Pharmacy / Chemist', icon: '💊', description: 'Manage medicines, health products, sales and customer records.',
    modes: ['products'], modules: ['inventory', 'sales', 'customers', 'suppliers', 'finance', 'reports', 'staff'], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' }, customerFeatures: { quantity: true, notes: true },
    customerExperience: { primaryAction: 'Shop', intro: 'Choose the health products you need.', intake: ['quantity', 'options', 'notes'] }, workflow: ['cart', 'checkout', 'complete']
  },
  clothing: {
    type: 'clothing', name: 'Clothing / Fashion', icon: '👕', description: 'Sell clothing and fashion products.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Order', offeringNoun: 'Product' }, customerFeatures: { quantity: true, photos: true },
    customerExperience: { primaryAction: 'Shop', intro: 'Browse products and choose what you want.', intake: ['quantity', 'options', 'photo'] }, workflow: ['cart', 'checkout', 'complete']
  },
  food: {
    type: 'food', name: 'Food Business', icon: '🍲', description: 'Sell food and prepared items with simple ordering.',
    modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'delivery', 'pickup', 'queue'], offerings: [],
    labels: { primaryAction: 'Take Order', orderNoun: 'Order', offeringNoun: 'Menu Item' }, customerFeatures: { quantity: true, notes: true, pickup: true, delivery: true },
    customerExperience: { primaryAction: 'Order Food', intro: 'Choose your food and how you want to receive it.', intake: ['quantity', 'options', 'notes', 'pickup', 'delivery'] }, workflow: ['received', 'preparing', 'ready', 'completed']
  },
  electronics: {
    type: 'electronics', name: 'Electronics', icon: '📱', description: 'Sell electronics and accessories.',
    modes: ['products'], modules: ['inventory', 'sales', 'suppliers', ...commerce], offerings: [],
    labels: { primaryAction: 'Sell', orderNoun: 'Sale', offeringNoun: 'Product' }, customerFeatures: { quantity: true, photos: true },
    customerExperience: { primaryAction: 'Shop', intro: 'Browse electronics and accessories.', intake: ['quantity', 'options'] }, workflow: ['cart', 'checkout', 'complete']
  },
  laundry: {
    type: 'laundry', name: 'Laundry', icon: '🧺', description: 'Take laundry orders by number of clothes, item type or weight.',
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
    customerExperience: { primaryAction: 'Book Laundry', intro: 'Tell us how many clothes you have. You can specify the types if you want.', intake: ['quantity', 'itemType', 'options', 'notes', 'photo', 'file', 'pickup', 'delivery'], simpleChoiceLabel: 'How many clothes?', simpleChoiceHint: 'You can just enter the total number. Details are optional.' },
    workflow: ['received', 'washing', 'drying', 'ironing', 'ready', 'collected']
  },
  gas_filling: {
    type: 'gas_filling', name: 'Gas Filling', icon: '⛽', description: 'Sell gas by quantity and manage cylinders and delivery.',
    modes: ['metered', 'products'], modules: ['inventory', 'sales', 'orders', ...commerce, 'suppliers', 'delivery', 'pickup', 'metering'],
    offerings: [
      { id: 'gas-refill', name: 'Gas Refill', icon: '⛽', mode: 'metered', pricing: 'weight' },
      { id: 'cylinder', name: 'Cylinder', icon: '🛢️', mode: 'products', pricing: 'fixed' },
      { id: 'delivery', name: 'Gas Delivery', icon: '🚚', mode: 'services', pricing: 'custom' },
    ],
    labels: { primaryAction: 'New Gas Sale', orderNoun: 'Gas Order', offeringNoun: 'Gas / Service' }, customerFeatures: { quantity: true, notes: true, delivery: true, pickup: true, metering: true },
    customerExperience: { primaryAction: 'Order Gas', intro: 'Choose how much gas you need and how you want to receive it.', intake: ['meteredQuantity', 'options', 'notes', 'pickup', 'delivery'], simpleChoiceLabel: 'How much gas?', simpleChoiceHint: 'Enter a KG amount or choose a cylinder size.' }, workflow: ['received', 'confirmed', 'ready', 'delivered']
  },
  restaurant: {
    type: 'restaurant', name: 'Restaurant / Food', icon: '🍔', description: 'Take food orders, manage menu items and preparation.',
    modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'suppliers', 'delivery', 'pickup', 'queue'], offerings: [],
    labels: { primaryAction: 'New Order', orderNoun: 'Food Order', offeringNoun: 'Menu Item' }, customerFeatures: { quantity: true, notes: true, pickup: true, delivery: true },
    customerExperience: { primaryAction: 'Order Food', intro: 'Choose your meal, extras and how you want it delivered or prepared for pickup.', intake: ['quantity', 'options', 'notes', 'pickup', 'delivery'] }, workflow: ['received', 'preparing', 'ready', 'completed']
  },
  games: {
    type: 'games', name: 'Gaming Centre', icon: '🎮', description: 'Run timed gaming sessions and track players and revenue.',
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
    labels: { primaryAction: 'Start Session', orderNoun: 'Session', offeringNoun: 'Game / Resource' }, customerFeatures: { sessions: true, scheduling: true },
    customerExperience: { primaryAction: 'Play', intro: 'Choose a game, machine or activity and reserve your time.', intake: ['options', 'duration', 'date', 'time'] }, workflow: ['booked', 'active', 'completed']
  },
  barber: {
    type: 'barber', name: 'Barber Shop', icon: '💈', description: 'Manage haircuts, grooming services, customers and appointments.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling'],
    offerings: [
      { id: 'haircut', name: 'Haircut', icon: '✂️', mode: 'services', pricing: 'fixed' },
      { id: 'beard', name: 'Beard Trim', icon: '🪒', mode: 'services', pricing: 'fixed' },
      { id: 'cut-beard', name: 'Haircut + Beard', icon: '💈', mode: 'services', pricing: 'fixed' },
    ],
    labels: { primaryAction: 'New Appointment', orderNoun: 'Appointment', offeringNoun: 'Service' }, customerFeatures: { scheduling: true, notes: true },
    customerExperience: { primaryAction: 'Book Appointment', intro: 'Choose a grooming service and a time that works for you.', intake: ['options', 'date', 'time', 'notes'] }, workflow: ['booked', 'in_service', 'ready', 'completed']
  },
  salon: {
    type: 'salon', name: 'Salon / Beauty', icon: '💇‍♀️', description: 'Manage beauty services, appointments and customer preferences.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling', 'attachments'],
    offerings: [], labels: { primaryAction: 'New Appointment', orderNoun: 'Appointment', offeringNoun: 'Service' }, customerFeatures: { scheduling: true, notes: true, photos: true },
    customerExperience: { primaryAction: 'Book Appointment', intro: 'Choose a beauty service and your preferred time.', intake: ['options', 'date', 'time', 'notes', 'photo'] }, workflow: ['booked', 'in_service', 'ready', 'completed']
  },
  tailoring: {
    type: 'tailoring', name: 'Tailoring / Fashion Design', icon: '🧵', description: 'Track clothing jobs, measurements, deadlines and reference files.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling', 'measurements', 'attachments'],
    offerings: [], labels: { primaryAction: 'New Tailoring Job', orderNoun: 'Tailoring Job', offeringNoun: 'Service' }, customerFeatures: { scheduling: true, notes: true, photos: true, files: true },
    customerExperience: { primaryAction: 'Start a Job', intro: 'Tell the tailor what you need and attach a reference if you have one.', intake: ['options', 'notes', 'photo', 'file', 'date'] }, workflow: ['received', 'measuring', 'cutting', 'sewing', 'fitting', 'ready', 'collected']
  },
  repair: {
    type: 'repair', name: 'Repair Shop', icon: '🛠️', description: 'Track repair jobs, customer devices, parts, photos and approvals.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'attachments', 'queue'],
    offerings: [], labels: { primaryAction: 'New Repair Job', orderNoun: 'Repair Job', offeringNoun: 'Repair Service' }, customerFeatures: { notes: true, photos: true, files: true },
    customerExperience: { primaryAction: 'Request Repair', intro: 'Describe the problem and add a photo or file if it helps.', intake: ['options', 'notes', 'photo', 'file'] }, workflow: ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready', 'collected']
  },
  printing: {
    type: 'printing', name: 'Printing / Cyber Cafe', icon: '🖨️', description: 'Manage print jobs, documents, pages, copies and customer files.', modes: ['services', 'products'], modules: [...serviceCommerce, 'attachments', 'queue'],
    offerings: [], labels: { primaryAction: 'New Print Job', orderNoun: 'Print Job', offeringNoun: 'Service' }, customerFeatures: { quantity: true, notes: true, files: true },
    customerExperience: { primaryAction: 'Send Print Job', intro: 'Upload your file, choose pages and tell us how many copies you need.', intake: ['file', 'quantity', 'options', 'notes'] }, workflow: ['received', 'printing', 'ready', 'collected']
  },
  cyber_cafe: {
    type: 'cyber_cafe', name: 'Cyber Cafe', icon: '💻', description: 'Manage computer sessions, browsing time, printing and other services.', modes: ['sessions', 'services'], modules: [...serviceCommerce, 'sessions', 'queue', 'attachments'],
    offerings: [], labels: { primaryAction: 'Start Session', orderNoun: 'Session', offeringNoun: 'Service' }, customerFeatures: { sessions: true, scheduling: true, files: true },
    customerExperience: { primaryAction: 'Book Computer', intro: 'Choose a computer service or session and how long you need it.', intake: ['options', 'duration', 'date', 'time', 'file'] }, workflow: ['booked', 'active', 'completed']
  },
  car_wash: {
    type: 'car_wash', name: 'Car Wash', icon: '🚗', description: 'Manage wash packages, extras, queues and customers.', modes: ['services'], modules: [...serviceCommerce, 'queue'],
    offerings: [], labels: { primaryAction: 'New Wash', orderNoun: 'Wash', offeringNoun: 'Service' }, customerFeatures: { notes: true },
    customerExperience: { primaryAction: 'Book Car Wash', intro: 'Choose a wash package and any extras.', intake: ['options', 'notes'] }, workflow: ['queued', 'washing', 'ready', 'collected']
  },
  photography: {
    type: 'photography', name: 'Photography', icon: '📸', description: 'Manage photo sessions, packages, dates and reference files.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling', 'attachments'],
    offerings: [], labels: { primaryAction: 'New Shoot', orderNoun: 'Shoot', offeringNoun: 'Package' }, customerFeatures: { scheduling: true, notes: true, photos: true, files: true },
    customerExperience: { primaryAction: 'Book Shoot', intro: 'Choose a photography package and your preferred date.', intake: ['options', 'date', 'time', 'notes', 'photo', 'file'] }, workflow: ['booked', 'shooting', 'editing', 'ready', 'completed']
  },
  cleaning: {
    type: 'cleaning', name: 'Cleaning Service', icon: '🧹', description: 'Manage cleaning jobs, schedules, locations and customer notes.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling', 'queue'],
    offerings: [], labels: { primaryAction: 'New Cleaning Job', orderNoun: 'Cleaning Job', offeringNoun: 'Service' }, customerFeatures: { scheduling: true, notes: true },
    customerExperience: { primaryAction: 'Book Cleaning', intro: 'Choose a cleaning service and tell us when and where.', intake: ['options', 'date', 'time', 'notes'] }, workflow: ['booked', 'assigned', 'in_progress', 'completed']
  },
  spa: {
    type: 'spa', name: 'Spa / Wellness', icon: '🧖', description: 'Manage treatments, appointments and customer preferences.', modes: ['services', 'appointments'], modules: [...serviceCommerce, 'scheduling'],
    offerings: [], labels: { primaryAction: 'New Appointment', orderNoun: 'Appointment', offeringNoun: 'Treatment' }, customerFeatures: { scheduling: true, notes: true },
    customerExperience: { primaryAction: 'Book Treatment', intro: 'Choose a treatment and your preferred time.', intake: ['options', 'date', 'time', 'notes'] }, workflow: ['booked', 'in_service', 'completed']
  },
  other: {
    type: 'other', name: 'Other Business', icon: '🏪', description: 'Start simple and add products or services as needed.', modes: ['products', 'services'], modules: ['inventory', 'sales', 'orders', ...commerce, 'attachments'], offerings: [],
    labels: { primaryAction: 'Get Started', orderNoun: 'Order', offeringNoun: 'Item / Service' }, customerFeatures: { quantity: true, photos: true, files: true, notes: true },
    customerExperience: { primaryAction: 'Get Started', intro: 'Choose what you need from this business.', intake: ['quantity', 'options', 'notes', 'photo', 'file'] }, workflow: ['received', 'completed']
  },
};

export function getBusinessTemplate(type?: string): BusinessTemplate {
  return BUSINESS_TEMPLATES[type || 'provision'] || BUSINESS_TEMPLATES.provision;
}

export function getBusinessPrimaryAction(type?: string): string {
  return getBusinessTemplate(type).labels.primaryAction;
}

export function getBusinessTemplateOptions() {
  return Object.values(BUSINESS_TEMPLATES).map(({ type, name, icon, description }) => ({ type, name, icon, description }));
}

/** Safe adapter for existing stores. It never removes inventory, sales or finance data. */
export function applyBusinessTemplate(store: StoreData, type?: string): StoreData {
  const template = getBusinessTemplate(type || store.storeType);
  return {
    ...store,
    storeType: template.type as StoreType,
    businessTemplate: {
      version: 1,
      type: template.type,
      modes: template.modes,
      modules: template.modules,
      offerings: template.offerings,
      labels: template.labels,
      customerFeatures: template.customerFeatures,
      customerExperience: template.customerExperience,
      workflow: template.workflow,
    },
  } as StoreData;
}
