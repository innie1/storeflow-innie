import { beforeEach, describe, expect, it } from 'vitest';
import {
  compileBackupPayload,
  decryptBackup,
  encryptBackup,
  isDeviceSecretKey,
  restoreBackupPayload,
} from '@/lib/backup-system';

/**
 * A backup is the one thing in StoreFlow that is meant to leave the phone.
 *
 * It used to carry the app-lock PIN, the fingerprint credential and the
 * signed-in session, scrambled with a XOR against the owner's password that
 * anybody can undo. And it did not bring a shop's bundles back: restore wrote
 * only the store record, so a new phone got the shop with none of its work.
 */

const shop = (code: string, name: string) => JSON.stringify({
  accessCode: code, storeName: name, storeType: 'laundry',
  products: [], sales: [], expenses: [], pendingPayments: [], customers: [],
});

function seedPhone() {
  localStorage.clear();
  localStorage.setItem('storeflow_index', JSON.stringify([{ code: 'SHOPA1', name: 'Shop A' }, { code: 'SHOPB2', name: 'Shop B' }]));
  localStorage.setItem('storeflow_SHOPA1', shop('SHOPA1', 'Shop A'));
  localStorage.setItem('storeflow_SHOPB2', shop('SHOPB2', 'Shop B'));
  localStorage.setItem('storeflow_laundry_local_records_SHOPA1', JSON.stringify([{ clientRef: 'r1', tagCode: 'AAAAA1' }]));
  localStorage.setItem('storeflow_day_history_SHOPA1', JSON.stringify([{ key: '2026-09-15', received: 4200 }]));
  localStorage.setItem('storeflow_theme', 'dark');
  localStorage.setItem('storeflow_low_stock', '5');
  localStorage.setItem('storeflow_lock_timer', '4h');
  // This device's own guard, and whoever is signed in right now.
  localStorage.setItem('storeflow_lock_pin', '4821');
  localStorage.setItem('storeflow_lock_credential', 'CREDENTIAL-BLOB');
  localStorage.setItem('storeflow_lock_attempts', '2');
  localStorage.setItem('storeflow_active_user', JSON.stringify({ id: 'w1', role: 'attendant' }));
  localStorage.setItem('storeflow_session', JSON.stringify({ accessCode: 'SHOPA1' }));
}

/** A backup written the old way, so an existing file still has to open. */
function legacyFile(payload: unknown, dataKey: string, password: string, recoveryKey: string) {
  const xor = (text: string, key: string) => {
    let result = '';
    for (let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return btoa(unescape(encodeURIComponent(result)));
  };
  return {
    version: '1.0-encrypted',
    encryptedData: xor(JSON.stringify(payload), dataKey),
    pwHeader: xor(dataKey, password),
    rkHeader: xor(dataKey, recoveryKey),
  };
}

beforeEach(seedPhone);

describe('what a backup carries', () => {
  it('leaves the lock, the credential and the session on the phone', () => {
    const file = JSON.stringify(compileBackupPayload());
    expect(file).not.toContain('4821');
    expect(file).not.toContain('CREDENTIAL-BLOB');
    expect(file).not.toContain('storeflow_lock_pin');
    expect(file).not.toContain('storeflow_active_user');
    expect(file).not.toContain('storeflow_session');
  });

  it('knows a device secret from a shop record', () => {
    for (const key of ['storeflow_lock_pin', 'storeflow_lock_credential', 'storeflow_lock_attempts', 'storeflow_session', 'storeflow_active_user']) {
      expect(isDeviceSecretKey(key), key).toBe(true);
    }
    for (const key of ['storeflow_SHOPA1', 'storeflow_low_stock', 'storeflow_day_history_SHOPA1', 'storeflow_laundry_local_records_SHOPA1']) {
      expect(isDeviceSecretKey(key), key).toBe(false);
    }
    // Not on the list, but it reads like one, which is what protects whatever
    // gets added next.
    expect(isDeviceSecretKey('storeflow_owner_password')).toBe(true);
    expect(isDeviceSecretKey('storeflow_api_token')).toBe(true);
  });

  it('carries both shops and everything they own', () => {
    const payload = compileBackupPayload();
    expect(Object.keys(payload.stores)).toEqual(expect.arrayContaining([
      'storeflow_SHOPA1', 'storeflow_SHOPB2', 'storeflow_laundry_local_records_SHOPA1', 'storeflow_day_history_SHOPA1',
    ]));
  });

  it('puts the device settings in their own fields instead of among the shops', () => {
    // These branches could never run before: the sweep above them took the keys.
    const payload = compileBackupPayload();
    expect(payload.theme).toBe('dark');
    expect(payload.lowStock).toBe('5');
    expect(payload.lockTimer).toBe('4h');
    expect(payload.stores['storeflow_theme']).toBeUndefined();
  });
});

describe('restoring onto a phone', () => {
  it('brings back the bundles and day records, not only the shop', () => {
    const payload = compileBackupPayload();
    localStorage.clear();

    const result = restoreBackupPayload(payload);

    expect(result.storesRestoredCount).toBe(2);
    expect(result.domainsRestored).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('storeflow_laundry_local_records_SHOPA1') || '[]')).toHaveLength(1);
    expect(localStorage.getItem('storeflow_day_history_SHOPA1')).toBeTruthy();
  });

  it('never writes over work already on this phone', () => {
    const payload = compileBackupPayload();
    localStorage.setItem('storeflow_laundry_local_records_SHOPA1', JSON.stringify([{ clientRef: 'newer' }]));

    restoreBackupPayload(payload);

    expect(JSON.parse(localStorage.getItem('storeflow_laundry_local_records_SHOPA1') || '[]')[0].clientRef).toBe('newer');
  });

  it('refuses to put a lock or a session back from an old file', () => {
    const payload = compileBackupPayload();
    const older = { ...payload, stores: { ...payload.stores, storeflow_lock_pin: '4821', storeflow_active_user: '{"role":"owner"}' } };
    localStorage.clear();

    restoreBackupPayload(older);

    expect(localStorage.getItem('storeflow_lock_pin')).toBeNull();
    expect(localStorage.getItem('storeflow_active_user')).toBeNull();
  });
});

describe('the encryption', () => {
  it('opens with the owner password, and with the recovery key', async () => {
    const payload = compileBackupPayload();
    const file = await encryptBackup(payload, 'owner-pass', 'recovery-key');

    // Nothing readable is left in the file itself.
    expect(JSON.stringify(file)).not.toContain('SHOPA1');
    expect((await decryptBackup(file, 'owner-pass')).stores['storeflow_SHOPA1']).toBeTruthy();
    expect((await decryptBackup(file, 'recovery-key')).stores['storeflow_SHOPB2']).toBeTruthy();
  });

  it('refuses the wrong key', async () => {
    const file = await encryptBackup(compileBackupPayload(), 'owner-pass');
    await expect(decryptBackup(file, 'guess')).rejects.toThrow(/Incorrect decryption key/);
  });

  it('refuses a file somebody has changed', async () => {
    const file: any = await encryptBackup(compileBackupPayload(), 'owner-pass');
    const text = file.data.ciphertext as string;
    file.data.ciphertext = text.slice(0, 8) + (text[8] === 'A' ? 'B' : 'A') + text.slice(9);

    await expect(decryptBackup(file, 'owner-pass')).rejects.toThrow();
  });

  it('still opens a backup written the old way', async () => {
    const payload = compileBackupPayload();
    const file = legacyFile(payload, 'oldkey12', 'owner-pass', 'recovery-key');

    const opened = await decryptBackup(file, 'owner-pass');

    expect(opened.stores['storeflow_SHOPA1']).toBeTruthy();
  });
});
