/**
 * Reading a supplier's receipt: the parts that need no network.
 *
 * Kept apart from index.ts so they can be tested on a developer's machine -
 * index.ts only runs inside Supabase, with a key, against a real photo.
 */

export const CATEGORIES = ["Groceries", "Beverages", "Toiletries", "Snacks", "Bakery", "Baby", "General"] as const;

/** About 5 MB of picture. The app shrinks a photo well below this before sending. */
export const MAX_IMAGE_BASE64_CHARS = 7_000_000;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * What kind of picture this is, read from its first bytes.
 *
 * The old function told the model every picture was a JPEG. A phone's
 * screenshot is a PNG and the app's own shrinking produces WebP, and a
 * picture sent under the wrong name is refused outright.
 */
export function imageMediaType(base64: string): ImageMediaType | null {
  const head = String(base64 || "").slice(0, 16);
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("R0lGOD")) return "image/gif";
  return null;
}

/** A "data:image/png;base64,...." string, or the bare base64, down to the bare base64. */
export function bareBase64(value: unknown): string {
  const text = String(value || "").trim();
  const comma = text.startsWith("data:") ? text.indexOf(",") : -1;
  return (comma >= 0 ? text.slice(comma + 1) : text).replace(/\s+/g, "");
}

export const RECEIPT_INSTRUCTIONS = `You read photographs of supplier receipts and invoices for small shops in Nigeria, so the shop can add what it bought to its stock. Prices are in naira.

Return every line that is a product the shop bought. For each one:
- name: the product as a shopkeeper would say it, cleaned of codes and abbreviations where the meaning is clear ("PK MLK 400G" is "Peak Milk 400g"). Keep the size or pack when it is printed.
- quantity: how many were bought, as printed on that line. Use 1 when no quantity is shown.
- costPrice: what the shop paid for that whole line. When only a price for one is printed, multiply it by the quantity.
- sellingPrice: the same figure as costPrice. The shop sets its own selling price afterwards; a receipt from a supplier does not show it.
- category: the closest of the allowed categories, or "General".

Leave out lines that are not products: subtotals, totals, VAT, discounts, delivery, change, and the supplier's own details.

Only report what is written on the receipt. When a figure cannot be read, leave that line out rather than guess it, because the shop will stock and price from these numbers. When nothing on the picture can be read as a receipt, return no items and say why in "error".`;

/** The shape the model must answer in. */
export const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          costPrice: { type: "number" },
          sellingPrice: { type: "number" },
          quantity: { type: "number" },
          category: { type: "string", enum: [...CATEGORIES] },
        },
        required: ["name", "costPrice", "sellingPrice", "quantity", "category"],
        additionalProperties: false,
      },
    },
    error: { type: "string" },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

export interface ReceiptItem {
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
}

/**
 * The model's answer, made safe to hand to the app.
 *
 * The schema already constrains it, but this is what stands between a reply
 * and a shop's stock list: a line with no name, a price that is not a number
 * or a quantity of nothing is dropped here rather than stocked.
 */
export function cleanReceipt(raw: unknown): { items: ReceiptItem[]; error?: string } {
  const body = (raw && typeof raw === "object" ? raw : {}) as { items?: unknown; error?: unknown };
  const list = Array.isArray(body.items) ? body.items : [];
  const items: ReceiptItem[] = [];
  for (const entry of list) {
    const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const name = String(row.name || "").trim().slice(0, 120);
    const quantity = Number(row.quantity);
    const costPrice = Number(row.costPrice);
    if (!name) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(costPrice) || costPrice < 0) continue;
    const selling = Number(row.sellingPrice);
    const category = (CATEGORIES as readonly string[]).includes(String(row.category)) ? String(row.category) : "General";
    items.push({
      name,
      quantity,
      costPrice,
      sellingPrice: Number.isFinite(selling) && selling >= 0 ? selling : costPrice,
      category,
    });
  }
  const error = typeof body.error === "string" && body.error.trim() ? body.error.trim().slice(0, 200) : undefined;
  return error && !items.length ? { items, error } : { items };
}
