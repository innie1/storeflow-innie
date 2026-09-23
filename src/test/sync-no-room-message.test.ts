import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

/**
 * "Saved on this device, but sync recovery storage is unavailable. Export a
 * backup." - in red, on every save, for a shop whose saves were all fine.
 *
 * What it meant: the shop was saved, but the spare copy kept for the cloud
 * could not be written, most likely because the phone's storage for the app
 * was full. Worth knowing once; not worth shouting on every sale.
 */

const toasts: { message: string; tone?: string }[] = [];
vi.mock('@/components/Toast', () => ({
  showToast: (message: string, tone?: string) => { toasts.push({ message, tone }); },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}));

const shop = (code: string) => ({ storeName: 'Corner Shop', accessCode: code, products: [], sales: [] } as unknown as StoreData);
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

beforeEach(() => {
  toasts.length = 0;
  localStorage.clear();
  const realSetItem = localStorage.setItem.bind(localStorage);
  // The phone refuses the spare copy, as it does when its storage is full.
  vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key.startsWith('storeflow_sync_pending_')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return realSetItem(key, value);
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('when the phone has no room for the cloud copy', () => {
  it('says so once, quietly, however many saves follow', async () => {
    const { queueStoreSync } = await import('@/lib/store-cloud-sync');
    for (let save = 0; save < 5; save += 1) {
      queueStoreSync(shop('ROOM01'));
      await settle();
    }

    expect(toasts).toHaveLength(1);
    expect(toasts[0].tone, 'not red').toBe('quiet');
    expect(toasts[0].message).toContain('Saved on this phone');
    expect(toasts[0].message).not.toMatch(/recovery storage|unavailable/i);
  });

  it('tells each shop on the phone, not just the first', async () => {
    const { queueStoreSync } = await import('@/lib/store-cloud-sync');
    // A moment apart: the test runner's stand-in for the message box only
    // registers one of two raised in the very same instant.
    queueStoreSync(shop('ROOM02'));
    await settle();
    queueStoreSync(shop('ROOM03'));
    await settle();

    expect(toasts).toHaveLength(2);
  });

  it('never stops the save it follows', async () => {
    const { queueStoreSync } = await import('@/lib/store-cloud-sync');
    expect(() => queueStoreSync(shop('ROOM04'))).not.toThrow();
  });
});

describe('the quiet tone', () => {
  it('is grey, with no warning symbol', async () => {
    const { readSource } = await import('./helpers/source');
    const toast = readSource('src/components/Toast.tsx');
    expect(toast).toContain("t.type === 'quiet' ? 'bg-surface-2 border-border text-muted-foreground");
    expect(toast).toContain("t.type === 'quiet' ? t.message :");
  });
});
