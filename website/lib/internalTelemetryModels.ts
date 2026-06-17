/** Install verification events — stored for pipeline checks, excluded from user stats. */
export const INTERNAL_TELEMETRY_MODEL_BUCKETS = new Set(["test-send", "fix-account-verify"]);

export function isInternalTelemetryModelBucket(bucket: string | null | undefined): boolean {
  const value = String(bucket ?? "").trim().toLowerCase();
  return INTERNAL_TELEMETRY_MODEL_BUCKETS.has(value);
}
