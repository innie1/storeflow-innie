import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContactPickButton from '@/components/ContactPickButton';
import { showToast } from '@/components/Toast';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * The contacts button on a phone field, on a phone that will not share them.
 *
 * It used to hide itself there, which sounded right and was not: the shop owner
 * saw no icon at all and could not tell whether the app had the feature, had
 * lost it, or had never shipped it. A missing thing cannot explain itself. It
 * is drawn everywhere now and says why when it cannot work.
 */

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('the contacts button on a phone that cannot share contacts', () => {
  // jsdom has no contacts API, which is the answer every iPhone and most
  // desktop browsers give.
  it('is still on the screen', () => {
    render(<ContactPickButton onPick={() => {}} />);
    expect(screen.getByLabelText('Choose from contacts')).toBeTruthy();
  });

  it('says why rather than doing nothing', () => {
    render(<ContactPickButton onPick={() => {}} />);
    fireEvent.click(screen.getByLabelText('Choose from contacts'));
    expect(vi.mocked(showToast)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(showToast).mock.calls[0][0])).toMatch(/contacts/i);
  });

  it('does not pretend it picked somebody', () => {
    const onPick = vi.fn();
    render(<ContactPickButton onPick={onPick} />);
    fireEvent.click(screen.getByLabelText('Choose from contacts'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
