import { AdminIntegrationsClient } from "@/components/admin/AdminIntegrationsClient";
import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminIntegrationsPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminIntegrationsClient />;
}
