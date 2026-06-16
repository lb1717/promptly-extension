import { AdminCompaniesClient } from "@/components/admin/AdminCompaniesClient";
import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminCompaniesPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminCompaniesClient />;
}
