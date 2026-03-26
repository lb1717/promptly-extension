import { AdminUserDetailClient } from "@/components/admin/AdminUserDetailClient";
import { AdminInlineGateForm } from "@/components/admin/AdminInlineGateForm";
import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";

export default function AdminUserDetailPage({ params }: { params: { userId: string } }) {
  const hasSession = Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
  if (!hasSession) {
    return <AdminInlineGateForm />;
  }

  const userId = decodeURIComponent(params.userId || "");
  if (!userId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-violet-200">
        <p>Invalid user.</p>
      </main>
    );
  }

  return <AdminUserDetailClient userId={userId} />;
}
