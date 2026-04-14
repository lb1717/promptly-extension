import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { AdminTierLimitsClient } from "@/components/admin/AdminTierLimitsClient";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminPlanLimitsPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminTierLimitsClient />;
}
