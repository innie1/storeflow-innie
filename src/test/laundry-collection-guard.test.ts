import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The last moment anyone can ask for the money.
 *
 * Everything needed was already on the row: a "₦1,500 owing" badge, a "Take
 * ₦1,500" button, and a balance computed from what was actually paid at
 * drop-off. Nothing made anyone look at it. At a busy counter you hand over
 * the bundle, tap Collected, and find out days later that it was never paid in
 * full — which is exactly how a laundry loses money it has already earned.
 *
 * So the app asks once, at handover. It does not refuse: a shop that cannot
 * hand a regular their clothes because the app says no is worse than the
 * problem it is solving.
 */

const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');

describe('handing over a bundle with money owed', () => {
  it('stops and asks before marking it collected', () => {
    expect(workspace).toContain("if (stage === 'collected' && record.balance > 0 && !force)");
    expect(workspace).toContain('setCollectGuard(record)');
  });

  it('does not ask when nothing is owed', () => {
    // The guard is on the balance, so a fully paid bundle goes straight
    // through and the counter is not slowed down for nothing.
    expect(workspace).toContain('record.balance > 0 && !force');
  });

  it('offers to take the money and collect in one tap', () => {
    expect(workspace).toContain('Take ₦{collectGuard.balance.toLocaleString()} and collect');
    expect(workspace).toContain('const settleAndCollect');
    expect(workspace).toContain('collectPayment(record)');
  });

  it('still lets the clothes go, deliberately', () => {
    expect(workspace).toContain('Hand over unpaid');
    expect(workspace).toContain("changeStage(record, 'collected', true)");
  });

  it('says what happens to the money if they hand it over anyway', () => {
    expect(workspace).toContain('keeps the ₦{collectGuard.balance.toLocaleString()} on their account');
  });

  it('can be backed out of', () => {
    expect(workspace).toContain('Cancel');
    expect(workspace).toContain('setCollectGuard(null)');
  });
});

describe('marking a bundle ready', () => {
  it('reminds the attendant to ask, before the customer is standing there', () => {
    expect(workspace).toContain("if (stage === 'ready' && record.balance > 0)");
    expect(workspace).toContain('still owes ₦${record.balance.toLocaleString()} — ask for it at collection.');
  });

  it('does not block the stage change to say it', () => {
    // Ready is a workflow step, not a handover; the reminder rides along
    // after the stage has already moved.
    const readyBlock = workspace.slice(workspace.indexOf("if (stage === 'ready'"));
    expect(readyBlock.slice(0, 400)).toContain('showToast');
    expect(readyBlock.slice(0, 400)).not.toContain('return;');
  });
});

describe('the lookup that makes this usable', () => {
  it('searches by tag code, name and phone', () => {
    const search = readSource('src/lib/laundry-workspace.ts');
    expect(search).toContain('order?.customer_name');
    expect(search).toContain('order?.customer_phone');
    expect(search).toContain('meta?.tag_code');
  });

  it('shows what is owed on the row itself', () => {
    expect(workspace).toContain('owing');
    // The balance is worked out in laundry-records now, so the workspace and
    // the home screen's day board cannot disagree about what is owed.
    expect(readSource('src/lib/laundry-records.ts')).toContain('laundryBalance(store, clientRef)');
  });
});
