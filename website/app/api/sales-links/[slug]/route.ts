import { getPublicSalesLinkBySlug } from "@/lib/server/salesLinks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: { slug: string } };

export async function GET(_request: Request, { params }: Params) {
  const link = await getPublicSalesLinkBySlug(params.slug);
  if (!link) {
    return NextResponse.json({ error: "This invite link is invalid or no longer active." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, link }, { status: 200 });
}
