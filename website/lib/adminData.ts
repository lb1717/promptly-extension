import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";
import {
  adminSetUserDailyTokenLimit,
  getAdminStats,
  getAdminUserDetail,
  getAdminUsers
} from "@/lib/server/promptlyBackend";

export function requireAdminSession() {
  return Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export { adminSetUserDailyTokenLimit, getAdminStats, getAdminUserDetail, getAdminUsers };
