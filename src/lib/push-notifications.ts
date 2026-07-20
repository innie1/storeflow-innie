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
const VAPID_PUBLIC_KEY = 'BEnmYSggm6gVfMWSLWXo_EJybECM-GutmdrJSnrpj9i6xYpLULD2WtAmqh1xbpAz-h87IPb51Ys2c_7ZJMWeSe4';

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

export async function getPushSubscriptionState(): Promise<'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    return sub ? 'subscribed' : 'not-subscribed';
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
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { success: false, message: 'Could not read push subscription details.' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        store_id: storeId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) return { success: false, message: error.message };

    return { success: true, message: 'You\u2019ll now get a notification when a new order comes in.' };
  } catch (err: any) {
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
