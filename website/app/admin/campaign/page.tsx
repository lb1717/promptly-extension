import { AdminCampaignClient } from "@/components/admin/AdminCampaignClient";
import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminCampaignPage() {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  return <AdminCampaignClient />;
}
