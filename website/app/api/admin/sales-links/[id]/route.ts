import { requireAdminSession } from "@/lib/adminData";
import { adminDeleteSalesLink, adminUpdateSalesLink } from "@/lib/server/salesLinks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const result = await adminUpdateSalesLink(params.id, {
      recipientName: typeof b.recipient_name === "string" ? b.recipient_name : undefined,
      tier: typeof b.tier === "string" ? b.tier : undefined,
      offerTitle: typeof b.offer_title === "string" ? b.offer_title : undefined,
      offerDescription: typeof b.offer_description === "string" ? b.offer_description : undefined,
      stripePromotionCodeId:
        b.stripe_promotion_code_id === null
          ? null
          : typeof b.stripe_promotion_code_id === "string"
            ? b.stripe_promotion_code_id
            : undefined,
      stripePromotionCodeLabel:
        b.stripe_promotion_code_label === null
          ? null
          : typeof b.stripe_promotion_code_label === "string"
            ? b.stripe_promotion_code_label
            : undefined,
      offerFreeTrial: typeof b.offer_free_trial === "boolean" ? b.offer_free_trial : undefined,
      trialDays:
        b.trial_days === null
          ? null
          : b.trial_days != null && b.trial_days !== ""
            ? Number(b.trial_days)
            : undefined,
      skipPaymentMethod: typeof b.skip_payment_method === "boolean" ? b.skip_payment_method : undefined,
      internalNote:
        b.internal_note === null ? null : typeof b.internal_note === "string" ? b.internal_note : undefined,
      active: typeof b.active === "boolean" ? b.active : undefined
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await adminDeleteSalesLink(params.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
