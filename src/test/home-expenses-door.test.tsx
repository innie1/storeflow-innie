import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

vi.mock('@/components/FlowStrategyCard', () => ({ default: () => null }));
vi.mock('@/components/CelebrationRibbon', () => ({ default: () => null }));
vi.mock('@/components/laundry/LaundryDayBoard', () => ({ default: () => null }));
vi.mock('@/components/BreakEvenWatcher', () => ({ default: () => null }));

import BusinessSimpleHome from '@/components/simple/BusinessSimpleHome';
import Expenses from '@/components/Expenses';
import { readSource } from './helpers/source';

/**
 * The expense book has a door on Home for whoever may open it. It used to be
 * reachable only from More, so an owner looking at Home concluded the app
 * could not record spending at all.
 */

const laundry = (): StoreData => ({
  storeName: 'Washlie', accessCode: 'ABC123', storeId: 'SF-WSH001', storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], expenses: [], customers: [], staffMembers: [], managerSettings: {},
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

const quickActions = () => screen.getByText('Quick actions').closest('div.rounded-2xl') as HTMLElement;

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe('Expenses on the Home screen', () => {
  it('is there for the owner as Record Expense, and opens the book on its form', () => {
    const onNavigate = vi.fn();
    render(<BusinessSimpleHome store={laundry()} onNavigate={onNavigate} currentUser={{ id: 'o', role: 'owner' } as never} orders={[]} />);
    fireEvent.click(within(quickActions()).getByText('Record Expense'));
    expect(onNavigate).toHaveBeenCalledWith('expenses');
    cleanup();
    render(<Expenses store={laundry()} onUpdate={() => {}} currentUser={{ role: 'owner', name: 'Owner' }} />);
    expect(screen.getByText('New Expense')).toBeTruthy();
  });

  it('opens the book on its list when reached any other way', () => {
    render(<Expenses store={laundry()} onUpdate={() => {}} currentUser={{ role: 'owner', name: 'Owner' }} />);
    expect(screen.queryByText('New Expense')).toBeNull();
  });

  it('is not there for an attendant, who has their own Record Expense button', () => {
    render(<BusinessSimpleHome store={laundry()} onNavigate={() => {}} currentUser={{ id: 'a', role: 'attendant' } as never} orders={[]} />);
    expect(within(quickActions()).queryByText('Record Expense')).toBeNull();
  });

  it('sits on the other home screens too', () => {
    expect(readSource('src/components/dashboards/BusinessOwnerDashboard.tsx')).toMatch(/canOpenTab\('expenses', currentUser\)/);
    expect(readSource('src/components/simple/SimpleModeHome.tsx')).toMatch(/canOpenTab\('expenses', currentUser\)[\s\S]{0,200}onNavigate\('expenses'\)/);
  });
});
