export type LaundryWorkspaceView = 'record' | 'records';

export const LAUNDRY_WORKSPACE_VIEW_STORAGE = 'storeflow-laundry-workspace-view';
export const LAUNDRY_INTAKE_OPEN_STORAGE = 'storeflow-open-laundry-intake';
export const LAUNDRY_INTAKE_OPEN_SIGNAL = 'storeflow:open-laundry-intake';

export function getLaundryActionView(label: string): LaundryWorkspaceView | null {
  if (label === 'Record Laundry') return 'record';
  if (label === 'Laundry Records') return 'records';
  return null;
}

export function resolveLaundryWorkspaceView(value: string | null | undefined): LaundryWorkspaceView {
  return value === 'record' ? 'record' : 'records';
}

export function requestLaundryWorkspace(view: LaundryWorkspaceView): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(LAUNDRY_WORKSPACE_VIEW_STORAGE, view);
  if (view === 'record') {
    // Persist the intent so a newly mounted intake can consume it, and also
    // broadcast immediately so an intake that is already mounted opens too.
    // This makes every Record Laundry control behave identically.
    window.sessionStorage.setItem(LAUNDRY_INTAKE_OPEN_STORAGE, '1');
    window.dispatchEvent(new CustomEvent(LAUNDRY_INTAKE_OPEN_SIGNAL));
  } else {
    window.sessionStorage.removeItem(LAUNDRY_INTAKE_OPEN_STORAGE);
  }
}

export function consumeLaundryWorkspaceView(): LaundryWorkspaceView {
  if (typeof window === 'undefined') return 'records';
  const view = resolveLaundryWorkspaceView(window.sessionStorage.getItem(LAUNDRY_WORKSPACE_VIEW_STORAGE));
  window.sessionStorage.removeItem(LAUNDRY_WORKSPACE_VIEW_STORAGE);
  return view;
}

export function parseLaundryRecordMetadata(order: any): Record<string, any> {
  const serviceMetadata = order?.service_metadata && typeof order.service_metadata === 'object'
    ? order.service_metadata
    : {};

  if (!order?.notes) return serviceMetadata;
  if (typeof order.notes === 'object') return { ...serviceMetadata, ...order.notes };

  try {
    const notes = JSON.parse(order.notes);
    return notes && typeof notes === 'object' ? { ...serviceMetadata, ...notes } : serviceMetadata;
  } catch {
    return { ...serviceMetadata, instructions: String(order.notes) };
  }
}

export function getLaundryRecordSearchText(order: any): string {
  const meta = parseLaundryRecordMetadata(order);
  const itemNames = (order?.order_items || []).map((item: any) => item?.item_name || item?.product_name || '').join(' ');
  return [
    order?.order_number,
    order?.customer_name,
    order?.customer_phone,
    order?.status,
    meta?.service_name,
    meta?.garment_summary,
    meta?.tag_code,
    meta?.customer_address,
    meta?.wash_method_name,
    meta?.dry_method_name,
    itemNames,
  ].filter(Boolean).join(' ').toLowerCase();
}
