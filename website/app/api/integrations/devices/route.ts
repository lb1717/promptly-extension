import { NextResponse } from "next/server";
import { listIntegrationDevices, requireWebFirebaseUser, revokeIntegrationDevice } from "@/lib/server/promptlyBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const devices = await listIntegrationDevices(user);
    return NextResponse.json({ ok: true, devices }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 401 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireWebFirebaseUser(request);
    const payload = await request.json().catch(() => ({}));
    const deviceId = String((payload as { device_id?: unknown }).device_id || (payload as { deviceId?: unknown }).deviceId || "").trim();
    if (!deviceId) {
      return NextResponse.json({ error: "device_id is required" }, { status: 400 });
    }
    const revoked = await revokeIntegrationDevice(user, deviceId);
    if (!revoked) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
