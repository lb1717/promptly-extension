import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";
import {
  adminSetUserDailyTokenLimit,
  getAdminStats,
  getAdminUserDetail,
  getAdminUsers
} from "@/lib/server/promptlyBackend";
import { adminUpdateUserCompanyMembership, createCompany, listCompanies } from "@/lib/server/companyData";

export function requireAdminSession() {
  return Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export {
  adminSetUserDailyTokenLimit,
  adminUpdateUserCompanyMembership,
  createCompany,
  getAdminStats,
  getAdminUserDetail,
  getAdminUsers,
  listCompanies
};
