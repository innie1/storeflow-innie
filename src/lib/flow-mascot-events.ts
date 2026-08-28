export type FlowMascotEventType =
  | 'streak_tap'
  | 'streak_day'
  | 'streak_milestone'
  | 'streak_reward'
  | 'streak_freeze'
  | 'streak_lightning';

export interface FlowMascotEventDetail {
  type: FlowMascotEventType;
  streak?: number;
  reward?: string;
  message?: string;
}

export const FLOW_MASCOT_EVENT = 'storeflow:flow-mascot-event';

export function emitFlowMascotEvent(detail: FlowMascotEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FlowMascotEventDetail>(FLOW_MASCOT_EVENT, { detail }));
}

export function onFlowMascotEvent(
  listener: (detail: FlowMascotEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<FlowMascotEventDetail>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(FLOW_MASCOT_EVENT, handler);
  return () => window.removeEventListener(FLOW_MASCOT_EVENT, handler);
}
