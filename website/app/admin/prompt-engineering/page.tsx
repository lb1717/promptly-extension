import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { AdminPromptEngineeringClient } from "@/components/admin/AdminPromptEngineeringClient";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminPromptEngineeringPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminPromptEngineeringClient />;
}
