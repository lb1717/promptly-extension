import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { AdminCompanionPromptEngineeringClient } from "@/components/admin/AdminCompanionPromptEngineeringClient";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminCompanionPromptEngineeringPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminCompanionPromptEngineeringClient />;
}
