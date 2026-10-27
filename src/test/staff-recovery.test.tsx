import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ rpcAheadOfTypes: (...args: unknown[]) => rpc(...args) }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import JoinStore from '@/components/staff/JoinStore';
import WorkerSignIn from '@/components/staff/WorkerSignIn';
import { joinErrorText, normaliseRecoveryCode, readJoin } from '@/lib/staff-join';
import { inAppBrowser, openInChromeLink } from '@/lib/phone-keep';

/**
 * A worker's phone that forgot the shop gets back in with Store ID, PIN and
 * the recovery code it was shown once - no owner, no 6-digit code. The cloud
 * side is supabase/migrations/20261027120000_staff_recovery_code.sql; here
 * the app's half, with the cloud's answers stood in.
 */

const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const no = (error: string) => ({ data: { ok: false, error }, error: null });

function answer(map: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>) {
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    const value = map[fn];
    return Promise.resolve(typeof value === 'function' ? (value as (a: Record<string, unknown>) => unknown)(args) : value ?? no('offline'));
  });
}

const WHATSAPP = 'Mozilla/5.0 (Linux; Android 13; TECNO KM4 Build/TP1A; wv) AppleWebKit/537.36 Chrome/118.0 Mobile Safari/537.36 WhatsApp/2.23';
const CHROME = 'Mozilla/5.0 (Linux; Android 13; TECNO KM4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Mobile Safari/537.36';

beforeEach(() => { rpc.mockReset(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('small things', () => {
  it('reads a recovery code however it is typed', () => {
    expect(normaliseRecoveryCode('k7qm 4xtr 9bwp')).toBe('K7QM-4XTR-9BWP');
    expect(normaliseRecoveryCode('K7QM4XTR9BWPEXTRA')).toBe('K7QM-4XTR-9BWP');
    expect(normaliseRecoveryCode('k7q')).toBe('K7Q');
    expect(joinErrorText('wrong_recovery')).toMatch(/recovery code/);
  });

  it("knows a page opened inside WhatsApp from one opened in Chrome", () => {
    expect(inAppBrowser(WHATSAPP)).toBe('WhatsApp');
    expect(inAppBrowser('Mozilla/5.0 [FBAN/FB4A;FBAV/400.0]')).toBe('Facebook');
    expect(inAppBrowser(CHROME)).toBe('');
    expect(openInChromeLink('https://shop.example/?join=SF-WSH001', CHROME))
      .toBe('intent://shop.example/?join=SF-WSH001#Intent;scheme=https;package=com.android.chrome;end');
    expect(openInChromeLink('https://shop.example/', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('');
  });
});

describe('back in with the recovery code', () => {
  const open = () => {
    render(<JoinStore onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'I joined before and have a recovery code' }));
    fireEvent.change(screen.getByPlaceholderText('SF-XXXXXX'), { target: { value: 'SF-WSH001' } });
    fireEvent.change(screen.getByPlaceholderText('4 digits'), { target: { value: '1234' } });
  };

  it('approves the phone straight away and shows the next code to keep', async () => {
    answer({
      staff_join_recover: (args: Record<string, unknown>) => args.p_recovery_code === 'K7QM-4XTR-9BWP'
        ? ok({ request_id: 'r1', status: 'authorized', store_name: 'Washlie', staff_id: 's1', staff_name: 'Destiny', staff_role: 'manager', recovery_code: 'NEWC-ODE2-3456' })
        : no('wrong_recovery'),
    });
    open();
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX'), { target: { value: 'AAAA-BBBB-CCCC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get back in' }));
    await screen.findByText(/That recovery code is not right/);
    expect(readJoin()).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX'), { target: { value: 'k7qm4xtr9bwp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get back in' }));
    await screen.findByText('This phone is approved');
    expect(readJoin()).toMatchObject({ requestId: 'r1', staffName: 'Destiny', staffRole: 'manager', status: 'authorized' });
    expect(screen.getByTestId('recovery-code').textContent).toBe('NEWC-ODE2-3456');
    expect(screen.getByRole('button', { name: "I've taken a screenshot - sign in" })).toBeTruthy();
    // Neither the PIN nor any recovery code is kept on the phone.
    const stored = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!)).join(' ');
    expect(stored).not.toMatch(/1234|K7QM|NEWC/);
  });

  it('never asks the owner, and never calls the request door', async () => {
    answer({ staff_join_recover: ok({ request_id: 'r1', status: 'authorized', store_name: 'Washlie', staff_id: 's1', staff_name: 'Destiny', recovery_code: 'NEWC-ODE2-3456' }) });
    open();
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX'), { target: { value: 'K7QM-4XTR-9BWP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get back in' }));
    await screen.findByText('This phone is approved');
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['staff_join_recover']);
  });
});

describe('the code after the owner lets a phone in', () => {
  it('is shown once the 6-digit code is accepted', async () => {
    localStorage.setItem('storeflow_staff_join', JSON.stringify({ requestId: 'r2', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Faith', status: 'approved' }));
    answer({
      staff_join_status: ok({ status: 'approved', code_ready: true, store_name: 'Washlie', staff_name: 'Faith' }),
      staff_join_redeem: ok({ status: 'authorized', staff_id: 's1', staff_name: 'Faith' }),
      staff_recovery_issue: (args: Record<string, unknown>) => args.p_request_id === 'r2' ? ok({ recovery_code: 'FIRS-TCOD-E234' }) : no('not_found'),
    });
    render(<JoinStore onBack={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '482731' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter code' }));
    expect((await screen.findByTestId('recovery-code')).textContent).toBe('FIRS-TCOD-E234');
  });

  it('can be had again on the sign-in card, for a phone approved before codes', async () => {
    localStorage.setItem('storeflow_staff_join', JSON.stringify({ requestId: 'r3', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Destiny', status: 'authorized' }));
    answer({ staff_recovery_issue: ok({ recovery_code: 'LATE-RCOD-E234' }) });
    render(<WorkerSignIn onSignedIn={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'No recovery code saved? Get a new one' }));
    expect((await screen.findByTestId('recovery-code')).textContent).toBe('LATE-RCOD-E234');
  });
});

describe('opened inside WhatsApp', () => {
  it('warns before joining, and offers Chrome', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(WHATSAPP);
    render(<JoinStore onBack={() => {}} />);
    expect(screen.getByText(/This opened inside WhatsApp/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in Chrome' }).getAttribute('href')).toMatch(/^intent:\/\/.*package=com\.android\.chrome;end$/);
  });

  it('says nothing in Chrome', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME);
    render(<JoinStore onBack={() => {}} />);
    expect(screen.queryByText(/This opened inside/)).toBeNull();
  });
});
