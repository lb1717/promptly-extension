/**
 * Server-only admin password check (API routes only — not imported by middleware).
 * Password is hardcoded for now (change here when you move to env/secrets).
 */
const ADMIN_PASSWORD_HARDCODED = "oat123";

export function getExpectedAdminPassword(): string {
  return ADMIN_PASSWORD_HARDCODED;
}

export function isValidAdminPassword(password: string): boolean {
  const expected = getExpectedAdminPassword();
  if (!password || !expected) {
    return false;
  }
  // Constant-time-ish compare for same length (simple mitigation)
  if (password.length !== expected.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < password.length; i += 1) {
    result |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
