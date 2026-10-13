import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, QrCode, RefreshCw, Share2, Smartphone } from 'lucide-react';
import type { StoreData } from '@/types/store';
import {
  approveDevice, inviteLink, lastSeen, listDevices, rejectDevice, revokeAllDevices, revokeDevice, spacedCode, type DeviceRow,
} from '@/lib/staff-join';
import { drawSimpleQR } from '@/lib/qr-code';
import ConfirmModal from '@/components/ConfirmModal';
import { STAFF_PAGE_REFRESH_MS, storeRefOf } from '@/lib/device-request-watch';
import { hasCloudSession } from '@/lib/cloud-reach';
import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';

/**
 * Workers' own phones asking to use the shop, on the owner's Staff page.
 *
 * Approve gives a 6-digit code for the owner to read out or send; the worker
 * types it on their phone within 5 minutes and that phone is let in. Reject
 * closes the request. The list comes from the cloud, so it needs the owner
 * signed in to their StoreFlow account on this phone.
 *
 * Approved phones are listed under each worker with when they were last
 * seen. Revoke takes one back and Revoke all every one a worker has; the
 * phone is signed out the next time it reaches the cloud. The invite QR only
 * fills in the Store ID on the worker's phone - approval and the code still
 * apply - so it is safe to show or send.
 *
 * The invite is offered only once the cloud has answered for this shop. A
 * worker's phone finds the shop by asking the cloud, so a shop kept only on
 * this phone - Cloud Sync never turned on - sent every invited worker to "No
 * shop has that Store ID". Until the cloud knows the shop, the owner is told
 * to put it online first instead.
 */

interface Props {
  store: StoreData;
}

interface ShownCode {
  id: string;
  code: string;
  expiresAt: number;
  name: string;
  device?: string;
}

const roleLabel = (role?: string) => role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

const when = (iso?: string) => iso
  ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : '';

type Revoking = { kind: 'one'; device: DeviceRow } | { kind: 'all'; staffId: string; name: string; count: number };

export default function DeviceRequests({ store }: Props) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'signin' | 'notOnline' | 'offline'>('loading');
  const [busy, setBusy] = useState('');
  const [shown, setShown] = useState<ShownCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [revoking, setRevoking] = useState<Revoking | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const qrCanvas = useRef<HTMLCanvasElement>(null);
  const ref = storeRefOf(store);
  const invite = store.storeId ? inviteLink(store.storeId) : '';

  const load = useCallback(async () => {
    if (!(await hasCloudSession())) return setState('signin');
    const result = await listDevices(ref);
    // Signed in, yet the cloud has no shop of this account's under this Store ID.
    if ('error' in result) return setState(result.error === 'not_owner' ? 'notOnline' : 'offline');
    setDevices(result.devices);
    setState('ready');
  }, [ref]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, STAFF_PAGE_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    if (!shown) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [shown]);

  const approve = async (device: DeviceRow) => {
    setBusy(device.id);
    const result = await approveDevice(device.id);
    setBusy('');
    if ('error' in result) return showToast(result.error === 'decided' ? 'That request was already answered' : 'Could not approve. Check the internet.', 'error');
    setNow(Date.now());
    setShown({ id: device.id, code: result.code, expiresAt: new Date(result.expires_at).getTime(), name: device.staff_name, device: device.device_label });
    void load();
  };

  const reject = async (device: DeviceRow) => {
    setBusy(device.id);
    const result = await rejectDevice(device.id);
    setBusy('');
    if ('error' in result) return showToast('Could not reject. Check the internet.', 'error');
    showToast(`${device.staff_name}'s request rejected`);
    void load();
  };

  const revoke = async (target: Revoking) => {
    setRevoking(null);
    const key = target.kind === 'one' ? target.device.id : `all:${target.staffId}`;
    setBusy(key);
    const result = target.kind === 'one' ? await revokeDevice(target.device.id) : await revokeAllDevices(ref, target.staffId);
    setBusy('');
    if ('error' in result) {
      return showToast(result.error === 'decided' ? 'That phone was already removed' : 'Could not remove the phone. Check the internet.', 'error');
    }
    const name = target.kind === 'one' ? target.device.staff_name : target.name;
    showToast(result.revoked === 1 ? `${name}'s phone removed` : `${result.revoked} of ${name}'s phones removed`);
    void load();
  };

  useEffect(() => {
    if (!showInvite || !invite || !qrCanvas.current) return;
    void drawSimpleQR(invite, qrCanvas.current).catch(() => showToast('Could not draw the QR. Send the link instead.', 'error'));
  }, [showInvite, invite]);

  const shareInvite = async () => {
    const text = `Join ${store.storeName} on StoreFlow: ${invite}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(invite); showToast('Invite link copied'); }
    } catch { /* closed the share sheet */ }
  };

  const message = (code: ShownCode) => `Your StoreFlow code for ${store.storeName}: ${spacedCode(code.code)}. It works for 5 minutes.`;

  const copy = async (code: ShownCode) => {
    try { await navigator.clipboard.writeText(code.code); showToast('Code copied'); } catch { showToast('Could not copy. Read it out instead.', 'error'); }
  };

  const share = async (code: ShownCode) => {
    try {
      if (navigator.share) await navigator.share({ text: message(code) });
      else await copy(code);
    } catch { /* closed the share sheet */ }
  };

  const pending = devices.filter(d => d.status === 'pending');
  const waitingForCode = devices.filter(d => d.status === 'approved');
  // A worker taken off the staff list is already shut out by the cloud.
  const onStaff = new Set((store.staffMembers || []).map(member => String(member.id)));
  const approved = devices.filter(d => d.status === 'authorized' && (!store.staffMembers || onStaff.has(d.staff_id)));
  const byWorker = [...approved.reduce((groups, device) => {
    const list = groups.get(device.staff_id) || [];
    list.push(device);
    return groups.set(device.staff_id, list);
  }, new Map<string, DeviceRow[]>())];
  const secondsLeft = shown ? Math.max(0, Math.round((shown.expiresAt - now) / 1000)) : 0;

  return (
    <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-bold text-base text-foreground">Workers' phones</h3>
          {pending.length > 0 && <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-background text-[10px] font-black">{pending.length} new</span>}
        </div>
        <button type="button" onClick={() => void load()} aria-label="Refresh" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        A worker can use the shop on their own phone: on the opening screen they tap <span className="font-semibold">Join a Store</span> and
        enter your Store ID <span className="font-mono font-semibold text-foreground">{store.storeId || '—'}</span> and their own PIN.
        Never give them your email, password or access code.
      </p>
      {invite && state === 'ready' && (
        <button type="button" onClick={() => setShowInvite(true)} className="w-full h-10 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold flex items-center justify-center gap-1.5">
          <QrCode className="w-4 h-4" /> Show invite QR
        </button>
      )}

      {state === 'loading' && <p className="text-xs text-muted-foreground">Checking…</p>}
      {state === 'signin' && <p className="text-xs text-muted-foreground">Sign in to your StoreFlow account on this phone to invite workers and approve their phones.</p>}
      {state === 'notOnline' && (
        <p className="text-xs text-amber-600">
          Workers can't join yet: this shop is only on this phone, so their phones can't find it. Turn on
          <span className="font-semibold"> Settings → Security → Multi-device Cloud Sync</span>, then come back here to invite them.
        </p>
      )}
      {state === 'offline' && <p className="text-xs text-muted-foreground">Could not reach StoreFlow. Requests show here when you are online.</p>}

      {state === 'ready' && devices.length === 0 && <p className="text-xs text-muted-foreground">No requests yet.</p>}

      {pending.map(device => (
        <div key={device.id} className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/5">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-600">New device requesting access</p>
          <p className="mt-1 font-display font-bold">{device.staff_name}</p>
          <p className="text-xs text-muted-foreground">
            {[roleLabel(device.staff_role), device.device_label, `Requested ${when(device.requested_at)}`].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy === device.id} onClick={() => reject(device)} className="h-10 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold">Reject</button>
            <button type="button" disabled={busy === device.id} onClick={() => approve(device)} className="h-10 rounded-xl bg-success text-success-foreground text-sm font-display font-bold">Approve</button>
          </div>
        </div>
      ))}

      {waitingForCode.map(device => (
        <div key={device.id} className="p-3 rounded-xl border border-border bg-surface-2">
          <p className="font-display font-bold text-sm">{device.staff_name} · {device.device_label || 'Phone'}</p>
          <p className="text-xs text-muted-foreground">
            {device.code_live ? 'Approved. Waiting for them to type the code.' : 'The code ran out before it was used.'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy === device.id} onClick={() => reject(device)} className="h-9 rounded-xl bg-card border border-border text-xs font-display font-bold">Cancel</button>
            <button type="button" disabled={busy === device.id} onClick={() => approve(device)} className="h-9 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold">New code</button>
          </div>
        </div>
      ))}

      {byWorker.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Approved phones</p>
          {byWorker.map(([staffId, phones]) => (
            <div key={staffId} className="rounded-xl bg-surface-2 border border-border divide-y divide-border">
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <p className="text-sm font-display font-bold truncate">
                  <span>{phones[0].staff_name}</span>
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{phones.length === 1 ? '1 phone' : `${phones.length} phones`}</span>
                </p>
                {phones.length > 1 && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setRevoking({ kind: 'all', staffId, name: phones[0].staff_name, count: phones.length })}
                    className="shrink-0 h-8 px-2.5 rounded-lg border border-destructive/30 text-destructive text-xs font-display font-bold disabled:opacity-60"
                  >
                    {busy === `all:${staffId}` ? 'Removing…' : 'Revoke all'}
                  </button>
                )}
              </div>
              {phones.map(device => (
                <div key={device.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{device.device_label || 'Phone'}</p>
                    <p className="text-[11px] text-muted-foreground">Approved {when(device.authorized_at)} · {lastSeen(device.last_seen_at)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setRevoking({ kind: 'one', device })}
                    className="shrink-0 h-8 px-2.5 rounded-lg bg-card border border-border text-xs font-display font-bold disabled:opacity-60"
                  >
                    {busy === device.id ? 'Removing…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {revoking && (
        <ConfirmModal
          isOpen
          title={revoking.kind === 'one' ? `Remove ${revoking.device.staff_name}'s phone?` : `Remove all ${revoking.count} of ${revoking.name}'s phones?`}
          description={revoking.kind === 'one'
            ? 'It is signed out of the shop the next time it goes online, and nothing recorded on it from now on is accepted. To use the shop again it has to ask to join, and you approve it with a new code.'
            : 'They are signed out of the shop the next time they go online, and nothing recorded on them from now on is accepted. To use the shop again each has to ask to join, and you approve it with a new code.'}
          confirmText={revoking.kind === 'one' ? 'Revoke' : 'Revoke all'}
          variant="danger"
          icon="📵"
          onConfirm={() => void revoke(revoking)}
          onCancel={() => setRevoking(null)}
        />
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <ScrollLock />
          <div role="dialog" aria-label="Staff invite" className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 text-center space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-black text-lg">Invite a worker</h3>
            <p className="text-sm text-muted-foreground">They scan this with their phone camera. It opens StoreFlow on Join a Store with your Store ID filled in.</p>
            <canvas ref={qrCanvas} width={220} height={220} className="mx-auto rounded-xl bg-white p-2" aria-label="Invite QR code" />
            <p className="font-mono text-sm font-semibold">{store.storeId}</p>
            <p className="text-[11px] text-muted-foreground">It holds no password. You still approve each phone and give it a code.</p>
            <button type="button" onClick={() => void shareInvite()} className="w-full h-10 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" /> Send link</button>
            <button type="button" onClick={() => setShowInvite(false)} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-black">Done</button>
          </div>
        </div>
      )}

      {shown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm" onClick={() => setShown(null)}>
          <ScrollLock />
          <div role="dialog" aria-label="Approval code" className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 text-center space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-muted-foreground">Give this code to <span className="font-semibold text-foreground">{shown.name}</span>{shown.device ? ` for ${shown.device}` : ''}</p>
            <p className="font-display font-black text-5xl tracking-wider tabular-nums">{spacedCode(shown.code)}</p>
            {secondsLeft > 0 ? (
              <p className="text-xs text-muted-foreground">Works once, for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} more</p>
            ) : (
              <p className="text-xs text-destructive">This code has run out. Tap New code on the request.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => copy(shown)} className="h-10 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold flex items-center justify-center gap-1.5"><Copy className="w-4 h-4" /> Copy</button>
              <button type="button" onClick={() => share(shown)} className="h-10 rounded-xl bg-surface-2 border border-border text-sm font-display font-bold flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" /> Send</button>
            </div>
            <button type="button" onClick={() => setShown(null)} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-black">Done</button>
          </div>
        </div>
      )}
    </section>
  );
}
