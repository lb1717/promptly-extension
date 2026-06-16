import {
  adminUpdateUserCompanyMembership,
  assignEmailToCompany,
  getCompanyAdminDetail,
  removeCompanyPendingInvite,
  removeUserFromCompany,
  requireAdminSession
} from "@/lib/adminData";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: { companyId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const companyId = decodeURIComponent(context.params.companyId);
    const body = await request.json().catch(() => null);
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    if (typeof b.user_id === "string" && b.user_id.trim()) {
      const result = await adminUpdateUserCompanyMembership(b.user_id.trim(), {
        company_id: companyId,
        company_role: b.role
      });
      return NextResponse.json(result, { status: 200 });
    }

    if (typeof b.email === "string" && b.email.trim()) {
      const result = await assignEmailToCompany(companyId, b.email, b.role);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ error: "Provide email or user_id" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: { companyId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const companyId = decodeURIComponent(context.params.companyId);
    const body = await request.json().catch(() => null);
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    if (typeof b.user_id === "string" && b.user_id.trim()) {
      const userId = b.user_id.trim();
      const detail = await getCompanyAdminDetail(companyId);
      if (!detail.members.some((member) => member.user_id === userId)) {
        return NextResponse.json({ error: "User is not a member of this company" }, { status: 400 });
      }
      const result = await removeUserFromCompany(userId);
      return NextResponse.json(result, { status: 200 });
    }

    if (typeof b.email === "string" && b.email.trim()) {
      await removeCompanyPendingInvite(companyId, b.email);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Provide email or user_id" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: { companyId: string } }) {
  if (!requireAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (typeof b.user_id !== "string" || !b.user_id.trim()) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }
    const result = await adminUpdateUserCompanyMembership(b.user_id.trim(), {
      company_id: decodeURIComponent(context.params.companyId),
      company_role: b.role
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
