import { requireAdminSession } from "@/lib/adminData";
import { adminCreateSalesLink, adminListSalesLinks } from "@/lib/server/salesLinks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await adminListSalesLinks();
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: Request) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const result = await adminCreateSalesLink({
      recipientName: typeof b.recipient_name === "string" ? b.recipient_name : "",
      tier: typeof b.tier === "string" ? b.tier : "",
      offerTitle: typeof b.offer_title === "string" ? b.offer_title : "",
      offerDescription: typeof b.offer_description === "string" ? b.offer_description : "",
      stripePromotionCodeId:
        typeof b.stripe_promotion_code_id === "string" ? b.stripe_promotion_code_id : null,
      stripePromotionCodeLabel:
        typeof b.stripe_promotion_code_label === "string" ? b.stripe_promotion_code_label : null,
      internalNote: typeof b.internal_note === "string" ? b.internal_note : null,
      slug: typeof b.slug === "string" ? b.slug : null,
      active: b.active !== false
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
