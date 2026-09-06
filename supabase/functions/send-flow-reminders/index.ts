// send-flow-reminders
//
// Handles background Web Push notifications for StoreFlow merchants when their app
// is closed or not running in the background.
// Supports three main categories of reminders:
// 1) Streak Reminders: Encourages merchants to open StoreFlow and maintain their daily usage streak & Flow rewards.
// 2) Sales Check-In: Reminds merchants to track daily sales, check margins, and review performance.
// 3) Debt & Bill Reminders: Prompts merchants to review overdue customer balances and recurring bills.
// 4) Streak Targeted: Per-store pre-loss warning — only fires for stores where it's 7pm+ local and they haven't opened today.
// 5) Savings: Per-store confirmation that money was set aside, with what it was and where the goal now stands.
// 6) Stock Loss: Per-store shrinkage warning, deliberately infrequent — see the notes on that branch.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Already-available secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@storeflow.app";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for the given timezone (IANA string like "Africa/Lagos"). */
function todayInTimezone(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const d = parts.find((p) => p.type === "day")!.value;
    return `${y}-${m}-${d}`;
  } catch {
    // Fallback to UTC if timezone string is invalid
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
}

/** Returns the current hour (0-23) in the given IANA timezone. */
function currentHourInTimezone(tz: string): number {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    return parseInt(hourStr, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY secrets");
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    let storeId: string | null = null;
    let reminderType: "streak" | "sales" | "debt" | "auto" | "streak_targeted" | "savings" | "stock_loss" = "auto";
    let customTitle: string | null = null;
    let customBody: string | null = null;

    if (req.method === "POST" || req.method === "PUT") {
      try {
        const bodyJson = await req.json();
        if (bodyJson.store_id || bodyJson.storeId) storeId = bodyJson.store_id || bodyJson.storeId;
        if (bodyJson.reminder_type || bodyJson.reminderType || bodyJson.type) {
          reminderType = bodyJson.reminder_type || bodyJson.reminderType || bodyJson.type;
        }
        if (bodyJson.title) customTitle = bodyJson.title;
        if (bodyJson.body) customBody = bodyJson.body;
      } catch (e) {
        console.log("No JSON body in request, defaulting to auto batch reminder mode.");
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ─────────────────────────────────────────────────────────────────────
    // STREAK TARGETED: per-store pre-loss push with local-time gating
    // ─────────────────────────────────────────────────────────────────────
    if (reminderType === "streak_targeted") {
      // 1. Pull all stores that have push subscriptions AND have a streak
      //    We join via store_id and pull the store's data JSONB + timezone.
      const { data: storeRows, error: storeErr } = await supabase
        .from("stores")
        .select("id, timezone, data")
        .not("data", "is", null);

      if (storeErr) {
        return new Response(JSON.stringify({ error: storeErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      if (!storeRows || storeRows.length === 0) {
        return new Response(JSON.stringify({ message: "No stores with data found", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 2. Filter to stores that qualify for a streak warning
      interface TargetedStore {
        storeId: string;
        count: number;
        tz: string;
        todayStr: string;
      }
      const targetedStores: TargetedStore[] = [];

      for (const row of storeRows) {
        const storeData = row.data as any;
        const streak = storeData?.streak;
        if (!streak || !streak.count || streak.count <= 0) continue;

        const tz = row.timezone || "UTC";
        const todayStr = todayInTimezone(tz);
        const hour = currentHourInTimezone(tz);

        // Skip if already opened today
        if (streak.lastOpenDate === todayStr) continue;
        // Skip if warning already sent today
        if (streak.lastWarningDate === todayStr) continue;
        // Skip if not yet 7pm local
        if (hour < 19) continue;

        targetedStores.push({ storeId: row.id, count: streak.count, tz, todayStr });
      }

      if (targetedStores.length === 0) {
        return new Response(JSON.stringify({ message: "No stores need streak warnings right now", sent: 0, checked: storeRows.length }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      // 3. Fetch push subscriptions for the targeted store IDs
      const targetStoreIds = targetedStores.map((s) => s.storeId);
      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("id, store_id, endpoint, p256dh, auth")
        .in("store_id", targetStoreIds);

      if (subsErr) {
        return new Response(JSON.stringify({ error: subsErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ message: "Targeted stores have no push subscriptions", sent: 0, targeted: targetedStores.length }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      // 4. Build a lookup for per-store count
      const countByStoreId: Record<string, number> = {};
      const todayByStoreId: Record<string, string> = {};
      for (const ts of targetedStores) {
        countByStoreId[ts.storeId] = ts.count;
        todayByStoreId[ts.storeId] = ts.todayStr;
      }

      // 5. Send per-store personalised push notifications
      const sendResults = await Promise.allSettled(
        subs.map((sub: any) => {
          const count = countByStoreId[sub.store_id] || 0;
          const payload = JSON.stringify({
            title: "🔥 Streak Reminder",
            body: `Don't forget to open the shop today — your ${count}-day streak is waiting.`,
            tag: `streak-warning-${sub.store_id}`,
            url: "/?tab=dashboard",
            actions: [{ action: "open", title: "🔥 Protect Streak" }],
          });
          return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        })
      );

      // 6. Clean up dead subscriptions (reuse existing pattern)
      const deadSubIds: string[] = [];
      sendResults.forEach((r, i) => {
        if (r.status === "rejected") {
          const statusCode = (r.reason && (r.reason.statusCode || r.reason.status)) || null;
          if (statusCode === 404 || statusCode === 410) {
            deadSubIds.push(subs[i].id);
          } else {
            console.error(`Push send failed for store ${subs[i].store_id}:`, r.reason?.message || r.reason);
          }
        }
      });

      if (deadSubIds.length > 0) {
        await supabase.from("push_subscriptions").delete().in("id", deadSubIds);
        console.log(`Cleaned up ${deadSubIds.length} expired push subscriptions.`);
      }

      // 7. Mark lastWarningDate on each successfully-reached store so we
      //    don't send again today. Collect unique store IDs that had at
      //    least one successful send.
      const sentStoreIds = new Set<string>();
      sendResults.forEach((r, i) => {
        if (r.status === "fulfilled") {
          sentStoreIds.add(subs[i].store_id);
        }
      });

      for (const sid of sentStoreIds) {
        const todayStr = todayByStoreId[sid];
        if (!todayStr) continue;
        // Patch data->'streak'->'lastWarningDate' without overwriting the rest
        // Using raw SQL via rpc would be cleaner, but jsonb_set works via update:
        const { error: patchErr } = await supabase.rpc("set_streak_warning_date", {
          p_store_id: sid,
          p_date: todayStr,
        });
        if (patchErr) {
          // Fallback: read-modify-write (slightly racy but acceptable for warnings)
          const { data: storeRow } = await supabase.from("stores").select("data").eq("id", sid).maybeSingle();
          if (storeRow?.data) {
            const updatedData = { ...storeRow.data as any };
            if (updatedData.streak) {
              updatedData.streak.lastWarningDate = todayStr;
              await supabase.from("stores").update({ data: updatedData }).eq("id", sid);
            }
          }
        }
      }

      const sent = sendResults.filter((r) => r.status === "fulfilled").length;
      return new Response(
        JSON.stringify({
          target: "streak_targeted",
          sent,
          total: subs.length,
          targeted_stores: targetedStores.length,
          removed: deadSubIds.length,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────
    // PER-STORE MODES: savings / stock_loss
    //
    // Unlike the generic reminders below, these two say something specific
    // about one shop, so they read that shop's own record and send a different
    // message to each. A merchant seeing "your savings was deducted" with no
    // figure attached would have to open the app to learn anything, which
    // defeats the point of telling them at all.
    // ─────────────────────────────────────────────────────────────────────
    if (reminderType === "savings" || reminderType === "stock_loss") {
      const { data: storeRows, error: storeErr } = await supabase
        .from("stores")
        .select("id, timezone, data")
        .not("data", "is", null);

      if (storeErr) {
        return new Response(JSON.stringify({ error: storeErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      interface Targeted {
        storeId: string;
        title: string;
        body: string;
        tag: string;
        url: string;
        /** Written back so the same fact is not announced twice. */
        mark: Record<string, unknown>;
      }
      const targeted: Targeted[] = [];
      const money = (n: number) => `\u20a6${Math.round(n).toLocaleString("en-NG")}`;

      for (const row of (storeRows || [])) {
        const storeData = (row.data || {}) as any;
        const tz = row.timezone || "UTC";
        const todayStr = todayInTimezone(tz);
        const hour = currentHourInTimezone(tz);

        if (reminderType === "savings") {
          // Auto-save runs inside the app; this reports what it did. Only
          // deposits since the last time we mentioned one are new news.
          const goals: any[] = Array.isArray(storeData.savingsGoals) ? storeData.savingsGoals : [];
          const lastToldIso = storeData.lastSavingsPushAt || null;
          const lastTold = lastToldIso ? new Date(lastToldIso).getTime() : 0;

          let newest = 0;
          let deposited = 0;
          let goalLabel = "Savings";
          let saved = 0;
          let target = 0;

          for (const goal of goals) {
            if (!goal?.autoSaveEnabled || !goal.lastDeductionTime) continue;
            const at = new Date(goal.lastDeductionTime).getTime();
            if (!at || at <= lastTold) continue;
            if (at > newest) {
              newest = at;
              goalLabel = goal.label || "Savings";
              saved = Number(goal.saved) || 0;
              target = Number(goal.amount) || 0;
            }
            deposited += Number(goal.saved) || 0;
          }
          if (!newest) continue;

          // Nothing is gained by waking someone at 3am to say they saved money.
          if (hour < 8 || hour >= 21) continue;

          const progress = target > 0
            ? ` ${money(saved)} of ${money(target)} saved so far.`
            : ` ${money(saved)} set aside so far.`;
          targeted.push({
            storeId: row.id,
            title: "\ud83c\udfe6 Money set aside",
            body: `Your ${goalLabel} auto-save ran.${progress}`,
            tag: `savings-${row.id}`,
            url: "/?tab=dashboard",
            mark: { lastSavingsPushAt: new Date(newest).toISOString() },
          });
        } else {
          // Shrinkage. This is the one category where being talked at is worse
          // than being uninformed, so the bar is high on purpose: only recent
          // counts, only losses worth a real share of a day's profit, only one
          // mention a week, and never again once the merchant has said they
          // understand it (recorded by the app as stockLossAcknowledgedAt).
          const audits: any[] = Array.isArray(storeData.stockCountAudits) ? storeData.stockCountAudits : [];
          const since = Date.now() - 30 * 86400000;
          const recent = audits.filter((a) => Number(a?.variance) < 0 && new Date(a.date).getTime() >= since);
          if (recent.length === 0) continue;

          const products: any[] = Array.isArray(storeData.products) ? storeData.products : [];
          const priced = products.filter((p) => !p.discontinued && Number(p.costPrice) > 0);
          const avgCost = priced.length
            ? priced.reduce((sum, p) => sum + Number(p.costPrice), 0) / priced.length
            : 0;

          const units = recent.reduce((sum, a) => sum + Math.abs(Number(a.variance)), 0);
          const value = recent.reduce((sum, a) => {
            const match = products.find((p) => p.name === a.product);
            return sum + Math.abs(Number(a.variance)) * (Number(match?.costPrice) || avgCost);
          }, 0);
          if (value <= 0) continue;

          const sales: any[] = Array.isArray(storeData.sales) ? storeData.sales : [];
          const profit30 = sales
            .filter((sale) => new Date(sale.date).getTime() >= since)
            .reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0);
          const dailyProfit = profit30 / 30;
          if (dailyProfit > 0 && value < dailyProfit * 0.25) continue;

          // The exact shortfalls this is about, so acknowledging today's does
          // not silence a different one next month.
          const signature = recent.map((a) => `${a.id}:${a.variance}`).sort().join("|");
          if (storeData.stockLossAcknowledgedSignature === signature) continue;

          const lastTold = storeData.lastStockLossPushAt ? new Date(storeData.lastStockLossPushAt).getTime() : 0;
          if (lastTold && Date.now() - lastTold < 7 * 86400000) continue;
          if (hour < 8 || hour >= 21) continue;

          targeted.push({
            storeId: row.id,
            title: "\u26a0\ufe0f Stock has gone missing",
            body: `${units} unit${units === 1 ? "" : "s"} unaccounted for since your last counts, worth about ${money(value)}.`,
            tag: `stock-loss-${row.id}`,
            url: "/?tab=inventory",
            mark: { lastStockLossPushAt: new Date().toISOString(), lastStockLossSignature: signature },
          });
        }
      }

      if (targeted.length === 0) {
        return new Response(JSON.stringify({ message: `No stores need a ${reminderType} notice right now`, sent: 0, checked: (storeRows || []).length }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("id, store_id, endpoint, p256dh, auth")
        .in("store_id", targeted.map((t) => t.storeId));

      if (subsErr) {
        return new Response(JSON.stringify({ error: subsErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ message: "Targeted stores have no push subscriptions", sent: 0, targeted: targeted.length }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }

      const byStoreId: Record<string, Targeted> = {};
      for (const t of targeted) byStoreId[t.storeId] = t;

      const sendResults = await Promise.allSettled(
        subs.map((sub: any) => {
          const t = byStoreId[sub.store_id];
          const payload = JSON.stringify({
            title: t.title,
            body: t.body,
            tag: t.tag,
            url: t.url,
            // The service worker turns this into the right buttons: both of
            // these get "I understand", which closes the subject from the
            // notification shade without opening the app.
            category: reminderType,
          });
          return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        })
      );

      const deadSubIds: string[] = [];
      const deliveredStoreIds = new Set<string>();
      sendResults.forEach((r, i) => {
        if (r.status === "fulfilled") {
          deliveredStoreIds.add(subs[i].store_id);
          return;
        }
        const statusCode = (r.reason && (r.reason.statusCode || r.reason.status)) || null;
        if (statusCode === 404 || statusCode === 410) {
          deadSubIds.push(subs[i].id);
        } else {
          console.error(`Push send failed for store ${subs[i].store_id}:`, r.reason?.message || r.reason);
        }
      });

      if (deadSubIds.length > 0) {
        await supabase.from("push_subscriptions").delete().in("id", deadSubIds);
      }

      // Only record having told a shop something once it actually went out —
      // otherwise a failed send would silence the subject for a week.
      for (const storeId of deliveredStoreIds) {
        const t = byStoreId[storeId];
        if (!t) continue;
        const row = (storeRows || []).find((r) => r.id === storeId);
        if (!row) continue;
        await supabase
          .from("stores")
          .update({ data: { ...(row.data as any), ...t.mark } })
          .eq("id", storeId);
      }

      return new Response(JSON.stringify({
        message: `${reminderType} notices sent`,
        sent: deliveredStoreIds.size,
        targeted: targeted.length,
        removed: deadSubIds.length,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // EXISTING MODES: streak / sales / debt / auto (unchanged)
    // ─────────────────────────────────────────────────────────────────────

    // Query active merchant push subscriptions from database
    let query = supabase.from("push_subscriptions").select("id, store_id, endpoint, p256dh, auth");
    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data: subs, error: subsErr } = await query;
    if (subsErr) {
      return new Response(JSON.stringify({ error: subsErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: "No active push subscriptions found", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Determine payload based on reminder type or daily rotation
    // In 'auto' mode, pick based on day of year to cycle between streak, sales, and debt reminders
    let actualType = reminderType;
    if (actualType === "auto") {
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const types: ("streak" | "sales" | "debt")[] = ["streak", "sales", "streak", "debt"];
      actualType = types[dayOfYear % types.length];
    }

    let title = "⚡ StoreFlow Alert";
    let bodyText = "Take 60 seconds to review your inventory and cash flow today!";
    let tag = "flow-reminder";
    let url = "/?tab=dashboard";
    let actions = [{ action: "open", title: "⚡ Open StoreFlow" }];

    if (actualType === "streak") {
      title = "🔥 Protect Your Flow Streak!";
      bodyText = "Don't let your daily streak reset! Tap to log in today, record your progress, and earn Flow rewards.";
      tag = "flow-streak-reminder";
      url = "/?tab=dashboard";
      actions = [{ action: "open", title: "🔥 Protect Streak" }];
    } else if (actualType === "sales") {
      title = "📈 Daily Flow Sales Check-In";
      bodyText = "How is your store tracking today? Open StoreFlow to check your margins and restock score.";
      tag = "flow-sales-reminder";
      url = "/?tab=history";
      actions = [{ action: "open", title: "📈 Check Sales" }];
    } else if (actualType === "debt") {
      title = "⏰ Pending Balance & Repayment Reminder";
      bodyText = "Flow noticed pending balances or bills due soon. Tap to send 1-click WhatsApp collection reminders!";
      tag = "flow-debt-reminder";
      url = "/?tab=pending";
      actions = [{ action: "open", title: "💰 View Pending" }];
    }

    if (customTitle) title = customTitle;
    if (customBody) bodyText = customBody;

    const payload = JSON.stringify({
      title,
      body: bodyText,
      tag,
      url,
      actions
    });

    const results = await Promise.allSettled(
      subs.map((sub: any) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    );

    const deadSubIds: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const statusCode = (r.reason && (r.reason.statusCode || r.reason.status)) || null;
        if (statusCode === 404 || statusCode === 410) {
          deadSubIds.push(subs[i].id);
        } else {
          console.error(`Push send failed for store ${subs[i].store_id}:`, r.reason?.message || r.reason);
        }
      }
    });

    if (deadSubIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", deadSubIds);
      console.log(`Cleaned up ${deadSubIds.length} expired push subscriptions.`);
    }

    const sent = results.filter(r => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ target: "merchant_reminders", type: actualType, sent, total: subs.length, removed: deadSubIds.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-flow-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
