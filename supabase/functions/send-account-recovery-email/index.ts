import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "StoreFlow <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedTypes = new Set(["verification_code", "security_backup", "new_account"]);

type StoreRow = {
  id: string;
  business_name: string | null;
  access_code: string | null;
  store_id: string | null;
  qr_code: string | null;
  owner_id: string | null;
  data: Record<string, any> | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!name || !domain) return "your recovery email";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

function recoveryEmailFromStore(store: StoreRow): string {
  const data = store.data || {};
  return normalizeEmail(
    data?.managerSettings?.recoveryEmail ||
    data?.profile?.email ||
    ""
  );
}

async function ownerEmailForStore(supabase: any, store: StoreRow): Promise<string> {
  if (!store.owner_id) return "";
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", store.owner_id)
    .maybeSingle();
  return normalizeEmail(data?.email || "");
}

async function lookupStore(supabase: any, body: Record<string, any>): Promise<StoreRow | null> {
  const accessCode = String(body.accessCode || "").trim().toUpperCase();
  if (accessCode) {
    const { data, error } = await supabase
      .from("stores")
      .select("id,business_name,access_code,store_id,qr_code,owner_id,data")
      .eq("access_code", accessCode)
      .maybeSingle();
    if (error) console.warn("Recovery store lookup by code failed:", error.message);
    return (data as StoreRow | null) || null;
  }

  // Legacy recovery UI sends storeName + the email it displays, but not the
  // access code. The email is only a match hint: it is never used as the send
  // destination unless it independently matches server-side store/profile data.
  const storeName = String(body.storeName || "").trim();
  const requestedEmail = normalizeEmail(body.to);
  if (!storeName || !requestedEmail || !isEmail(requestedEmail)) return null;

  const { data: candidates, error } = await supabase
    .from("stores")
    .select("id,business_name,access_code,store_id,qr_code,owner_id,data")
    .eq("business_name", storeName)
    .limit(10);
  if (error || !candidates?.length) return null;

  const direct = (candidates as StoreRow[]).filter(
    (candidate) => recoveryEmailFromStore(candidate) === requestedEmail,
  );
  if (direct.length === 1) return direct[0];

  const ownerIds = (candidates as StoreRow[])
    .map((candidate) => candidate.owner_id)
    .filter(Boolean) as string[];
  if (!ownerIds.length) return null;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email")
    .in("id", ownerIds);
  const matchingOwnerIds = new Set(
    (profiles || [])
      .filter((profile: any) => normalizeEmail(profile.email) === requestedEmail)
      .map((profile: any) => profile.id),
  );
  const ownerMatches = (candidates as StoreRow[]).filter(
    (candidate) => candidate.owner_id && matchingOwnerIds.has(candidate.owner_id),
  );
  return ownerMatches.length === 1 ? ownerMatches[0] : null;
}

async function requireAuthenticatedOwner(req: Request, supabase: any, store: StoreRow) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.id || profile.id !== store.owner_id) return null;

  return {
    user: userData.user,
    profile,
  };
}

async function enforceRateLimit(supabase: any, type: string, storeId: string) {
  const maxAttempts = type === "verification_code" ? 5 : 3;
  const windowSeconds = type === "verification_code" ? 15 * 60 : 60 * 60;
  const { error } = await supabase.rpc("check_rate_limit", {
    p_scope: `recovery_email_${type}`,
    p_key: storeId,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("RATE_LIMITED");
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], subject, html }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend API failed:", response.status, detail.slice(0, 300));
    throw new Error("EMAIL_DELIVERY_FAILED");
  }
}

function verificationHtml(storeName: string, code: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:32px">
  <div style="max-width:520px;margin:auto;background:#18181b;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 8px">StoreFlow verification</h1>
    <p style="color:#a1a1aa">A recovery code was requested for <strong>${escapeHtml(storeName)}</strong>.</p>
    <div style="font-family:monospace;font-size:34px;font-weight:800;letter-spacing:6px;text-align:center;padding:20px;background:#27272a;border-radius:12px">${escapeHtml(code)}</div>
    <p style="color:#71717a;font-size:13px">If you did not request this code, ignore this email. StoreFlow will never ask you to send this code to another person.</p>
  </div></body></html>`;
}

function storeDetailsHtml(storeName: string, accessCode: string, storeUrl: string, isNewAccount: boolean) {
  const safeName = escapeHtml(storeName);
  const safeCode = escapeHtml(accessCode);
  const safeUrl = escapeHtml(storeUrl);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:32px">
  <div style="max-width:560px;margin:auto;background:#18181b;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 8px">${isNewAccount ? "Welcome to StoreFlow" : "StoreFlow security details"}</h1>
    <p style="color:#a1a1aa">Store: <strong>${safeName}</strong></p>
    <p style="color:#a1a1aa">Access code: <strong style="font-family:monospace">${safeCode}</strong></p>
    ${safeUrl ? `<p style="color:#a1a1aa">Customer storefront: <a style="color:#60a5fa" href="${safeUrl}">${safeUrl}</a></p>` : ""}
    <p style="color:#71717a;font-size:13px">Passwords, recovery answers and emergency recovery keys are intentionally not included in email.</p>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!RESEND_API_KEY) return json({ error: "Email service is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || "");
    if (!allowedTypes.has(type)) return json({ error: "Unsupported email type" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = await lookupStore(supabase, body);
    if (!store) return json({ error: "Unable to verify recovery destination" }, 400);

    await enforceRateLimit(supabase, type, store.id);

    const serverRecoveryEmail = recoveryEmailFromStore(store);
    const serverOwnerEmail = await ownerEmailForStore(supabase, store);
    const storeName = store.business_name || store.data?.storeName || "StoreFlow Business";
    const accessCode = store.access_code || "";
    const storeUrl = store.qr_code || "";

    let recipient = serverRecoveryEmail || serverOwnerEmail;
    let subject = "";
    let html = "";

    if (type === "verification_code") {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return json({ error: "Invalid verification request" }, 400);
      if (!recipient || !isEmail(recipient)) return json({ error: "Recovery email is not configured" }, 400);
      subject = `${code} is your StoreFlow verification code`;
      html = verificationHtml(storeName, code);
    } else if (type === "new_account") {
      const owner = await requireAuthenticatedOwner(req, supabase, store);
      if (!owner) return json({ error: "Authentication required" }, 401);
      recipient = normalizeEmail(owner.user.email || owner.profile.email || serverOwnerEmail);
      if (!recipient || !isEmail(recipient)) return json({ error: "Account email is not available" }, 400);
      subject = `Welcome to StoreFlow — ${storeName}`;
      html = storeDetailsHtml(storeName, accessCode, storeUrl, true);
    } else {
      // security_backup may be requested by the local recovery/security screen,
      // which can exist before a cloud-auth session is active. It is safe
      // without JWT because the destination and all emailed details come from
      // server-side store data, never from caller-supplied `to`/secret fields.
      if (!recipient || !isEmail(recipient)) return json({ error: "Recovery email is not configured" }, 400);
      subject = `StoreFlow security details — ${storeName}`;
      html = storeDetailsHtml(storeName, accessCode, storeUrl, false);
    }

    await sendEmail(recipient, subject, html);
    console.log(`Recovery email sent for store ${store.id}, type ${type}`);
    return json({ success: true, sentTo: maskEmail(recipient) });
  } catch (error: any) {
    if (error?.message === "RATE_LIMITED") return json({ error: "Too many recovery emails. Try again later." }, 429);
    console.error("send-account-recovery-email failed:", error?.message || error);
    return json({ error: "Could not send recovery email" }, 500);
  }
});
