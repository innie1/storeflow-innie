import { emitFlowMascotEvent } from './flow-mascot-events';

export function notifyStreakTap(streak: number) {
  emitFlowMascotEvent({ type: 'streak_tap', streak });
}

export function notifyStreakDay(streak: number) {
  emitFlowMascotEvent({ type: 'streak_day', streak });
}

export function notifyStreakMilestone(streak: number) {
  emitFlowMascotEvent({ type: 'streak_milestone', streak });
}

export function notifyStreakReward(streak: number, reward?: string) {
  emitFlowMascotEvent({ type: 'streak_reward', streak, reward });
}

export function notifyStreakFreeze(streak: number) {
  emitFlowMascotEvent({ type: 'streak_freeze', streak });
}

export function notifyStreakLightning(streak: number) {
  emitFlowMascotEvent({ type: 'streak_lightning', streak, message: 'Charged up!' });
}
