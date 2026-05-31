import { isStripeCheckoutAvailableForTier, isStripeConfigured } from "@/lib/server/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public billing capability check (no auth). Used by sales invite checkout UI. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    stripeConfigured: isStripeConfigured(),
    tiers: {
      pro: isStripeCheckoutAvailableForTier("pro"),
      student: isStripeCheckoutAvailableForTier("student"),
      enterprise: isStripeCheckoutAvailableForTier("enterprise")
    }
  });
}
