import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { AdminSalesClient } from "@/components/admin/AdminSalesClient";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminSalesPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminSalesClient />;
}
