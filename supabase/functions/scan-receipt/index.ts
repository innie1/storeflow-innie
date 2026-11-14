// scan-receipt
//
// Reads a photograph of a supplier's receipt and returns the products on it,
// so a shop can add what it bought to its stock without typing each line.
//
// The picture is read by Claude. Only a signed-in merchant may call this: it
// spends the project's AI credit, and an open endpoint would let anybody with
// the address spend it too.
//
// Required secret: ANTHROPIC_API_KEY
// Already-available secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import {
  bareBase64,
  cleanReceipt,
  imageMediaType,
  MAX_IMAGE_BASE64_CHARS,
  RECEIPT_INSTRUCTIONS,
  RECEIPT_SCHEMA,
} from "./receipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Send the receipt as a POST" });

  try {
    // Who is asking. The anonymous key every visitor holds is not a person.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = token ? await supabase.auth.getUser(token) : { data: null };
    if (!userData?.user?.id) return reply(401, { error: "Sign in to your StoreFlow account to scan receipts." });

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return reply(503, { error: "Receipt scanning is not switched on yet." });

    const body = await req.json().catch(() => null);
    const image = bareBase64(body?.imageBase64);
    if (!image) return reply(400, { error: "No image provided" });
    if (image.length > MAX_IMAGE_BASE64_CHARS) return reply(413, { error: "That picture is too large. Take it again a little further away." });
    const mediaType = imageMediaType(image);
    if (!mediaType) return reply(415, { error: "That file is not a picture this can read. Use a photo or a screenshot." });

    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A declined request is retried on another model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: RECEIPT_INSTRUCTIONS,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RECEIPT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "List the products on this receipt." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return reply(200, { items: [], error: "This picture could not be read as a receipt." });
    }
    if (response.stop_reason === "max_tokens") {
      return reply(200, { items: [], error: "This receipt is too long to read in one go. Photograph it in two halves." });
    }

    const text = response.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("scan-receipt: reply was not JSON", text.slice(0, 200));
      return reply(200, { items: [], error: "Could not read the receipt. Try a clearer picture." });
    }
    return reply(200, cleanReceipt(parsed));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return reply(429, { error: "Too many receipts at once. Try again in a moment." });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("scan-receipt: the AI key was refused", error.status);
      return reply(503, { error: "Receipt scanning is not switched on yet." });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("scan-receipt: request refused", error.message);
      return reply(400, { error: "That picture could not be read. Try a clearer one." });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("scan-receipt: AI error", error.status, error.message);
      return reply(502, { error: "Receipt scanning is having trouble. Try again shortly." });
    }
    console.error("scan-receipt error:", error);
    return reply(500, { error: "Could not scan the receipt." });
  }
});
