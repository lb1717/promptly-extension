/** Shared admin session cookie settings (no secrets — safe for middleware bundle). */
export const ADMIN_COOKIE_NAME = "promptly_admin_session";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
