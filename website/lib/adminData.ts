import { ADMIN_COOKIE_NAME } from "@/lib/adminSession";
import { cookies } from "next/headers";
import {
  adminSetUserDailyTokenLimit,
  getAdminStats,
  getAdminUserDetail,
  getAdminUsers
} from "@/lib/server/promptlyBackend";
import {
  adminUpdateUserCompanyMembership,
  assignEmailToCompany,
  createCompany,
  getCompanyAdminDetail,
  listCompanies,
  removeCompanyPendingInvite,
  removeUserFromCompany
} from "@/lib/server/companyData";

export function requireAdminSession() {
  return Boolean(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export {
  adminSetUserDailyTokenLimit,
  adminUpdateUserCompanyMembership,
  assignEmailToCompany,
  createCompany,
  getAdminStats,
  getAdminUserDetail,
  getAdminUsers,
  getCompanyAdminDetail,
  listCompanies,
  removeCompanyPendingInvite,
  removeUserFromCompany
};
