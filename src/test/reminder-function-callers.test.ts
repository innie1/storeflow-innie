import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * send-flow-reminders checked nobody: the public anon key ships in every copy
 * of the app, so anybody could put words of their own on every merchant's
 * phone. Only the scheduler may send to every shop or choose the wording;
 * anyone else must own the one shop named and gets the fixed reminder.
 */

const fn = readSource('supabase/functions/send-flow-reminders/index.ts');
const gate = fn.indexOf('const fromScheduler');

describe('who may send a reminder', () => {
  it('decides before anything is read or sent', () => {
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(fn.indexOf('if (reminderType === "streak_targeted")'));
    expect(gate).toBeLessThan(fn.indexOf('if (reminderType === "savings" || reminderType === "stock_loss")'));
    expect(gate).toBeLessThan(fn.indexOf('let query = supabase.from("push_subscriptions")'));
  });

  it('keeps the every-shop modes for the scheduler alone', () => {
    expect(fn).toContain('token === serviceRoleKey');
    expect(fn).toContain('if (!["streak", "sales", "debt"].includes(reminderType)) return deny(403');
  });

  it('needs the owner of the one shop named, signed in', () => {
    const check = fn.slice(gate, fn.indexOf('// STREAK TARGETED'));
    expect(check).toContain('if (!storeId) return deny(400');
    expect(check).toContain('supabase.auth.getUser(token)');
    expect(check).toContain('.eq("id", storeId).in("owner_id", profileIds)');
    expect(check).toContain('if (!owned) return deny(403');
  });

  it('never lets a caller choose the words', () => {
    const check = fn.slice(gate, fn.indexOf('// STREAK TARGETED'));
    expect(check).toContain('customTitle = null;');
    expect(check).toContain('customBody = null;');
  });
});
