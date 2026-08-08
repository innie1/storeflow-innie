import { TabId } from '@/types/store';

export type FlowAppSetting = 'dark_mode' | 'light_mode' | 'system_mode' | 'voice' | 'sound' | 'notifications' | 'compact_mode' | 'reduced_motion' | 'customer_ordering';
const KEY = 'storeflow_flow_controls';
type Controls = Record<string, boolean>;
function load(): Controls { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save(v: Controls) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }
export function setFlowControl(name: FlowAppSetting, enabled: boolean) { const c = load(); c[name] = enabled; save(c); window.dispatchEvent(new CustomEvent('storeflow:flow-control', { detail: { name, enabled } })); }
export function getFlowControl(name: FlowAppSetting, fallback = true) { const c = load(); return typeof c[name] === 'boolean' ? c[name] : fallback; }
export function toggleFlowControl(name: FlowAppSetting) { const next = !getFlowControl(name, true); setFlowControl(name, next); return next; }
export function tabLabel(tab: TabId) { return tab.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
export function appControlHelp() { return ['I can control StoreFlow too:','• Turn dark mode on/off','• Turn sound, voice or notifications on/off','• Turn compact mode on/off','• Reduce motion','• Turn customer ordering on/off','• Open any StoreFlow section'].join('\n'); }
