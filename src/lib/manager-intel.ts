/*
 * Flow's reasoning about a shop: forecasts, health, advice, notifications,
 * insights and reports.
 *
 * Each topic lives in its own file in ./manager-intel; this file gathers
 * them so everything keeps importing from '@/lib/manager-intel'.
 */

export * from './manager-intel/dates';
export * from './manager-intel/forecast';
export * from './manager-intel/health';
export * from './manager-intel/sales';
export * from './manager-intel/stock';
export * from './manager-intel/costs';
export * from './manager-intel/advice';
export * from './manager-intel/flow-notes';
export * from './manager-intel/notifications';
export * from './manager-intel/insights';
export * from './manager-intel/activity';
export * from './manager-intel/average-job';
export * from './manager-intel/flow-report';
export * from './manager-intel/opportunities';
export * from './manager-intel/seasonal';
export * from './manager-intel/repayments';
export * from './manager-intel/weekly-recap';
export * from './manager-intel/dismissed-advice';
export * from './manager-intel/product-intelligence';
