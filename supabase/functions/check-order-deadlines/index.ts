// check-order-deadlines
//
// Runs on a schedule (pg_cron, every 15 min). Checks orders still in
// Pending/Preparing and nudges the MERCHANT — never the customer — if:
//
//   1. "stale"     — no pickup_time set, order has sat 30+ min untouched
//   2. "approaching"— pickup_time set, within 15 min of it, not yet Ready
//   3. "passed"     — pickup_time set, already passed, not yet Ready
//
// Each stage fires at most ONCE per order (tracked via boolean columns
// added on orders: notified_stale, notified_deadline_approaching,
// notified_deadline_passed). After stage 3 an order goes silent — no
// repeat nagging on the same order, by design.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Already-available: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@storeflow.app";

const STALE_MINUTES = 30;        // no pickup_time set — nudge after this long untouched
const APPROACHING_MINUTES = 15;  // how close to pickup_time counts as "approaching"

interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendAndCleanup(supabase: any, subs: PushTarget[], payload: string): Promise<number> {
  if (!subs || subs.length === 0) return 0;
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    )
  );
  const deadIds: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent++;
    else {
      const code = (r.reason as any)?.statusCode || (r.reason as any)?.status;
      if (code === 404 || code === 410) deadIds.push(subs[i].id);
    }
  });
  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }
  return sent;
}

Deno.serve(async (_req: Request) => {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 });
    }
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, store_id, order_number, pickup_time, created_at, notified_stale, notified_deadline_approaching, notified_deadline_passed")
      .in("status", ["Pending", "Preparing"])
      .or("notified_deadline_passed.is.false,notified_deadline_passed.is.null");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    let notifiedCount = 0;
    const subsCache: Record<string, PushTarget[]> = {};

    for (const order of orders || []) {
      const orderRef = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 8)}`;
      const createdAt = new Date(order.created_at);
      const pickupTime = order.pickup_time ? new Date(order.pickup_time) : null;

      let stage: "stale" | "approaching" | "passed" | null = null;

      if (!pickupTime) {
        const ageMin = (now.getTime() - createdAt.getTime()) / 60000;
        if (ageMin >= STALE_MINUTES && !order.notified_stale) stage = "stale";
      } else {
        const minsToDeadline = (pickupTime.getTime() - now.getTime()) / 60000;
        if (minsToDeadline <= 0 && !order.notified_deadline_passed) {
          stage = "passed";
        } else if (minsToDeadline <= APPROACHING_MINUTES && minsToDeadline > 0 && !order.notified_deadline_approaching) {
          stage = "approaching";
        }
      }

      if (!stage) continue;

      if (!subsCache[order.store_id]) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("store_id", order.store_id);
        subsCache[order.store_id] = subs || [];
      }
      const subs = subsCache[order.store_id];

      const content = {
        stale: {
          title: "⏳ Order Waiting",
          body: `Order ${orderRef} has been sitting for a while — take a look when you can.`,
        },
        approaching: {
          title: "⏰ Pickup Time Approaching",
          body: `Order ${orderRef} is due soon. Might want to check on it.`,
        },
        passed: {
          title: "🔔 Pickup Time Passed",
          body: `Order ${orderRef}'s pickup time has passed and it's still open.`,
        },
      }[stage];

      const notificationId = `order-deadline-${order.id}-${stage}`;
      const payload = JSON.stringify({
        title: content.title,
        body: content.body,
        tag: notificationId,
        notification_id: notificationId,
        url: "/?tab=orders",
        orderId: order.id,
        priority: stage === "passed" ? "critical" : "normal",
      });

      if (subs.length > 0) {
        await sendAndCleanup(supabase, subs, payload);
      }

      const updateField = stage === "stale" ? "notified_stale" : stage === "approaching" ? "notified_deadline_approaching" : "notified_deadline_passed";
      await supabase.from("orders").update({ [updateField]: true }).eq("id", order.id);

      notifiedCount++;
    }

    return new Response(JSON.stringify({ checked: (orders || []).length, notified: notifiedCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("check-order-deadlines error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
