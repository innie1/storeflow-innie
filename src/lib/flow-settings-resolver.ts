import { DEFAULT_MANAGER_SETTINGS, ManagerSettings, StoreData } from '@/types/store';

export interface FlowSettingResult {
  handled: boolean;
  store?: StoreData;
  label?: string;
  value?: string | number | boolean;
  message?: string;
  needsConfirmation?: boolean;
}

type BooleanKey = keyof ManagerSettings;
type NumericKey = 'defaultMargin' | 'criticalStockThreshold' | 'graphInterval' | 'defaultPurchaseQty' | 'defaultRestockQty' | 'minStockThreshold' | 'autoApplyMaxChangeAmount' | 'autoDiscountValue' | 'autoDiscountMinSubtotal' | 'autoDiscountMaxSubtotal';
type SelectKey = 'voiceGender' | 'restockFrequency' | 'autoDiscountType';

const BOOLEAN_ALIASES: Array<[RegExp, BooleanKey, string]> = [
  [/^(?:mascot|flow)\s+animations?$/, 'mascotAnimations', 'Mascot animations'],
  [/^(?:number|numeric|value)\s+animations?$/, 'numericAnimations', 'Number animations'],
  [/^(?:reduce|reduced)\s+motion$/, 'reduceMotion', 'Reduced motion'],
  [/^(?:compact|compact\s+mode)$/, 'compactMode', 'Compact mode'],
  [/^(?:voice|flow\s+voice|voice\s+features?)$/, 'voiceFeatures', 'Voice features'],
  [/^(?:auto\s+voice|automatic\s+voice|auto\s+listen)$/, 'autoVoiceListen', 'Auto voice listening'],
  [/^(?:weekly\s+recap|weekly\s+report)$/, 'weeklyRecap', 'Weekly recap'],
  [/^(?:customer\s+requests?|customer\s+request\s+notifications?)$/, 'notifyCustomerRequests', 'Customer request notifications'],
  [/^(?:low\s+stock|low\s+stock\s+alerts?)$/, 'notifyLowStock', 'Low-stock notifications'],
  [/^(?:insights?|insight\s+notifications?)$/, 'notifyInsights', 'Insight notifications'],
  [/^(?:recommendations?|recommendation\s+notifications?)$/, 'notifyRecommendations', 'Recommendation notifications'],
  [/^(?:alerts?|alert\s+notifications?)$/, 'notifyAlerts', 'Alert notifications'],
  [/^(?:monthly\s+reports?|monthly\s+report\s+notifications?)$/, 'notifyMonthlyReports', 'Monthly reports'],
  [/^(?:savings?|savings\s+reminders?)$/, 'notifySavingsReminders', 'Savings reminders'],
  [/^(?:revenue\s+forecasts?|revenue\s+forecast)$/, 'revenueForecasts', 'Revenue forecasts'],
  [/^(?:profit\s+forecasts?|profit\s+forecast)$/, 'profitForecasts', 'Profit forecasts'],
  [/^(?:inventory\s+forecasts?|inventory\s+forecast)$/, 'inventoryForecasts', 'Inventory forecasts'],
  [/^(?:expense\s+analysis|expense\s+analytics)$/, 'expenseAnalysis', 'Expense analysis'],
  [/^(?:smart\s+pricing|pricing\s+assistant)$/, 'smartPricing', 'Smart pricing'],
  [/^(?:product\s+suggestions?|product\s+recommendations?)$/, 'productSuggestions', 'Product suggestions'],
  [/^(?:savings\s+planner|savings\s+planning)$/, 'savingsPlanner', 'Savings planner'],
  [/^(?:customer\s+requests?)$/, 'customerRequests', 'Customer requests'],
  [/^(?:business\s+advice|business\s+advisor)$/, 'businessAdvice', 'Business advice'],
  [/^(?:business\s+expansion|expansion\s+advice)$/, 'businessExpansion', 'Business expansion'],
  [/^(?:business\s+questions?)$/, 'businessQuestions', 'Business questions'],
  [/^(?:auto\s+suggest\s+prices?|price\s+suggestions?)$/, 'autoSuggestPrices', 'Automatic price suggestions'],
  [/^(?:auto\s+apply\s+prices?|automatic\s+price\s+changes?)$/, 'autoApplyPrices', 'Automatic price changes'],
  [/^(?:show\s+product\s+profit|product\s+profit)$/, 'showProductProfit', 'Product profit display'],
  [/^(?:restock\s+suggestions?|restock\s+advice)$/, 'restockSuggestions', 'Restock suggestions'],
  [/^(?:inventory\s+alerts?|stock\s+alerts?)$/, 'inventoryAlerts', 'Inventory alerts'],
  [/^(?:auto\s+backups?|automatic\s+backups?)$/, 'autoBackupsEnabled', 'Automatic backups'],
  [/^(?:auto\s+discounts?|automatic\s+discounts?)$/, 'autoDiscountEnabled', 'Automatic discounts'],
  [/^(?:weather\s+impact|weather\s+insights?)$/, 'weatherImpactEnabled', 'Weather impact insights'],
  [/^(?:auto\s+restock|automatic\s+restock|auto\s+suggest\s+restock)$/, 'autoSuggestRestock', 'Automatic restock suggestions'],
  [/^(?:multi\s+device\s+sync|device\s+sync)$/, 'multiDeviceSync', 'Multi-device sync'],
  [/^(?:auto\s+print|automatic\s+printing|auto\s+print\s+receipts?)$/, 'autoPrintReceipt', 'Automatic receipt printing'],
  [/^(?:receipt\s+logo|show\s+receipt\s+logo)$/, 'receiptLogoEnabled', 'Receipt logo'],
  [/^(?:biometric|biometric\s+lock)$/, 'biometricLock', 'Biometric lock'],
  [/^(?:pin|pin\s+lock|app\s+pin)$/, 'pinLock', 'PIN lock'],
];

const NUMERIC_ALIASES: Array<[RegExp, NumericKey, string]> = [
  [/^(?:default\s+)?margin$/, 'defaultMargin', 'Default margin'],
  [/^(?:critical\s+stock|critical\s+stock\s+threshold)$/, 'criticalStockThreshold', 'Critical stock threshold'],
  [/^(?:minimum|min|reorder)\s+stock(?:\s+threshold)?$/, 'minStockThreshold', 'Minimum stock threshold'],
  [/^(?:default\s+purchase\s+quantity|purchase\s+quantity)$/, 'defaultPurchaseQty', 'Default purchase quantity'],
  [/^(?:default\s+restock\s+quantity|restock\s+quantity)$/, 'defaultRestockQty', 'Default restock quantity'],
  [/^(?:graph|chart)\s+(?:interval|refresh)$/, 'graphInterval', 'Graph interval'],
  [/^(?:maximum\s+automatic\s+price\s+change|auto\s+price\s+change\s+limit|price\s+change\s+limit)$/, 'autoApplyMaxChangeAmount', 'Automatic price-change limit'],
  [/^(?:discount\s+value|automatic\s+discount\s+value)$/, 'autoDiscountValue', 'Automatic discount value'],
  [/^(?:minimum\s+discount\s+subtotal|discount\s+minimum)$/, 'autoDiscountMinSubtotal', 'Discount minimum subtotal'],
  [/^(?:maximum\s+discount\s+subtotal|discount\s+maximum)$/, 'autoDiscountMaxSubtotal', 'Discount maximum subtotal'],
];

const SELECT_ALIASES: Array<[RegExp, SelectKey, string]> = [
  [/^(?:voice\s+gender|voice)$/, 'voiceGender', 'Flow voice'],
  [/^(?:restock\s+frequency|restock\s+schedule)$/, 'restockFrequency', 'Restock frequency'],
  [/^(?:discount\s+type|automatic\s+discount\s+type)$/, 'autoDiscountType', 'Automatic discount type'],
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function manager(store: StoreData): ManagerSettings {
  return { ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) };
}

function result(store: StoreData, key: keyof ManagerSettings, value: any, label: string): FlowSettingResult {
  const next = { ...store, managerSettings: { ...manager(store), [key]: value } };
  return { handled: true, store: next, label, value, message: `${label} is ${typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value)}.` };
}

function parseOperation(q: string) {
  const m = q.match(/^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+(.+)$|^(?:please\s+)?(?:enable|disable)\s+(.+)$|^(?:please\s+)?toggle\s+(.+)$|^(?:please\s+)?(?:set|change)\s+(.+?)\s+(?:to|=)\s+(.+)$/);
  if (!m) return null;
  if (m[1]) return { mode: 'bool' as const, enabled: m[1] === 'on', target: m[2] };
  if (m[3]) return { mode: 'bool' as const, enabled: !q.startsWith('disable'), target: m[3] };
  if (m[4]) return { mode: 'toggle' as const, target: m[4] };
  return { mode: 'value' as const, target: m[5], value: m[6] };
}

export function resolveFlowSettingCommand(store: StoreData, raw: string): FlowSettingResult {
  const q = normalize(raw);
  const op = parseOperation(q);
  if (!op) return { handled: false };
  const target = normalize(op.target);

  const bool = BOOLEAN_ALIASES.find(([pattern]) => pattern.test(target));
  if (bool && (op.mode === 'bool' || op.mode === 'toggle')) {
    const current = Boolean(manager(store)[bool[1]]);
    const enabled = op.mode === 'toggle' ? !current : op.enabled;
    const sensitive = bool[1] === 'biometricLock' || bool[1] === 'pinLock' || bool[1] === 'autoApplyPrices' || bool[1] === 'autoBackupsEnabled';
    const r = result(store, bool[1], enabled, bool[2]);
    if (sensitive && enabled) r.needsConfirmation = true;
    return r;
  }

  const numeric = NUMERIC_ALIASES.find(([pattern]) => pattern.test(target));
  if (numeric && op.mode === 'value') {
    const n = Number(String(op.value).replace(/[₦,% ,]/g, ''));
    if (!Number.isFinite(n)) return { handled: true, message: `Give me a valid number for ${numeric[2]}.` };
    if (numeric[1] === 'graphInterval' && ![10, 30, 60].includes(n)) return { handled: true, message: 'Graph interval can be 10, 30 or 60 minutes.' };
    if (numeric[1] === 'defaultMargin' && (n < 0 || n > 100)) return { handled: true, message: 'Default margin must be between 0% and 100%.' };
    if (n < 0) return { handled: true, message: `${numeric[2]} cannot be negative.` };
    return result(store, numeric[1], n, numeric[2]);
  }

  const select = SELECT_ALIASES.find(([pattern]) => pattern.test(target));
  if (select && op.mode === 'value') {
    const value = normalize(String(op.value));
    if (select[1] === 'voiceGender' && !['male', 'female', 'young male', 'young-male'].includes(value)) return { handled: true, message: 'Voice can be male, female or young-male.' };
    if (select[1] === 'restockFrequency' && !['daily', 'weekly', 'monthly'].includes(value)) return { handled: true, message: 'Restock frequency can be daily, weekly or monthly.' };
    if (select[1] === 'autoDiscountType' && !['flat', 'percentage', 'percent'].includes(value)) return { handled: true, message: 'Discount type can be flat or percentage.' };
    const normalizedValue = select[1] === 'voiceGender' && value === 'young male' ? 'young-male' : select[1] === 'autoDiscountType' && value === 'percent' ? 'percentage' : value;
    return result(store, select[1], normalizedValue, select[2]);
  }

  return { handled: false };
}

export function flowSettingsHelp() {
  return [
    'I can operate your StoreFlow settings, including:',
    '• Turn mascot, number or reduced-motion animations on/off',
    '• Turn voice, auto-listening and sounds on/off',
    '• Control low-stock, insight, recommendation, alert and report notifications',
    '• Turn forecasts, smart pricing, savings and business tools on/off',
    '• Control automatic backups, discounts and receipt printing',
    '• Turn biometric/PIN lock and other security controls on/off',
    '• Change margins, stock thresholds, graph intervals and restock quantities',
    '• Change voice gender, restock frequency and discount type',
  ].join('\n');
}
