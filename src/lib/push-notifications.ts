import { supabase } from '@/integrations/supabase/client';

// Public key is safe to ship in client code — it's the whole point of the
// VAPID public/private keypair. The matching private key lives only as a
// Supabase Edge Function secret (VAPID_PRIVATE_KEY) and is never sent to
// the browser. IMPORTANT: this is a placeholder keypair generated for
// development — before shipping to real merchants, generate a fresh pair
// with `npx web-push generate-vapid-keys`, update this constant with the
// new public key, and set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY as Supabase
// secrets to match. The public and private key must always be from the
// same generated pair.
const VAPID_PUBLIC_KEY = 'BPynrw1Xha05EzgzG_YEMdVyRGsuSlG62pPzLxprxWumTfVetPfAe5kyBM_yLbH_PDId9QjVwdoElfUDtljmGTQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

// Checks BOTH sides: does this browser have a live push subscription, AND
// is that same subscription actually saved server-side? A browser-only
// "subscribed" is not good enough — if the row never made it to Supabase
// (RLS error, network blip, etc.) the send-order-push function has nothing
// to send to, so we treat that case as not-subscribed and let the user
// retry, instead of showing a toggle that's silently lying to them.
export async function getPushSubscriptionState(): Promise<'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return 'not-subscribed';

    const endpoint = sub.toJSON().endpoint;
    if (!endpoint) return 'not-subscribed';

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .maybeSingle();

    if (error || !data) {
      // Browser thinks it's subscribed but our database has no matching
      // row — this is exactly the "toggle says on, nothing arrives" bug.
      return 'not-subscribed';
    }
    return 'subscribed';
  } catch {
    return 'not-subscribed';
  }
}

// Subscribes this device to push notifications for new orders on the given
// store, and saves the subscription server-side so the send-order-push
// edge function can reach it. Safe to call again on a device that's
// already subscribed — it just re-saves the same endpoint (upsert).
export async function subscribeToOrderPush(storeId: string): Promise<{ success: boolean; message: string }> {
  if (!isPushSupported()) {
    return { success: false, message: 'Push notifications aren\u2019t supported on this browser/device.' };
  }
  if (!storeId) {
    return { success: false, message: 'Store isn\u2019t fully loaded yet \u2014 try again in a moment.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Notification permission was not granted.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // NOTE: even if a subscription already exists in the browser (e.g. left
    // over from an earlier attempt where the Supabase save failed), we still
    // fall through and re-run the upsert below every time. That's the fix —
    // previously an existing local subscription with no saved DB row would
    // short-circuit here and the user could tap "on" forever with nothing
    // ever getting saved.
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { success: false, message: 'Could not read push subscription details \u2014 try toggling again.' };
    }

    const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
      {
        store_id: storeId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (upsertError) {
      console.error('[push] save to Supabase failed:', upsertError);
      return { success: false, message: `Couldn\u2019t save this device: ${upsertError.message}` };
    }

    // Re-read it back to confirm it actually landed, rather than trusting a
    // response with no error. This is the check that was missing before.
    const { data: verifyRow, error: verifyError } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', json.endpoint)
      .maybeSingle();

    if (verifyError || !verifyRow) {
      console.error('[push] verify-after-save failed:', verifyError);
      return { success: false, message: 'Saved locally but couldn\u2019t confirm with the server \u2014 try again in a moment.' };
    }

    return { success: true, message: 'You\u2019ll now get a notification when a new order comes in.' };
  } catch (err: any) {
    console.error('[push] subscribe failed:', err);
    return { success: false, message: err.message || 'Failed to subscribe to push notifications.' };
  }
}

export async function unsubscribeFromOrderPush(): Promise<{ success: boolean; message: string }> {
  if (!isPushSupported()) return { success: false, message: 'Push notifications aren\u2019t supported here.' };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { success: true, message: 'Already unsubscribed.' };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);

    return { success: true, message: 'Order push notifications turned off on this device.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to unsubscribe.' };
  }
}

// Silently checks if notification permission was previously granted and ensures
// the device's Web Push endpoint is actively registered and saved to Supabase
// push_subscriptions so background delivery never fails when the app is closed.
export async function autoSubscribeIfGranted(storeId: string): Promise<void> {
  if (!isPushSupported() || !storeId) return;
  if (Notification.permission !== 'granted') return;
  try {
    const state = await getPushSubscriptionState();
    if (state !== 'subscribed') {
      console.log('[push] Auto-healing Web Push subscription for store:', storeId);
      await subscribeToOrderPush(storeId);
    }
  } catch (err) {
    console.warn('[push] autoSubscribeIfGranted error:', err);
  }
}

// Clear system tray notifications for a specific order (e.g. when viewing it)
export async function clearNotificationsForOrder(orderId: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'CLEAR_NOTIFICATIONS', orderId });
  } catch (err) {
    console.warn('[push] clearNotificationsForOrder error:', err);
  }
}

// Clear all StoreFlow notifications from system tray (e.g. on app focus)
export async function clearAllStoreFlowNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
  } catch (err) {
    console.warn('[push] clearAllStoreFlowNotifications error:', err);
  }
}
