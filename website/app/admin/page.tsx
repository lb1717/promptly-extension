import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminDashboardPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminDashboardClient />;
}
