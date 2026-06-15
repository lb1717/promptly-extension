import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type StoredVendorTokens = {
  claude_code?: { access_token: string; refresh_token?: string | null };
  codex?: { access_token: string; account_id?: string | null };
  cursor?: { access_token: string; plan_slug?: string | null; email?: string | null };
};

function encryptionKey(): Buffer {
  const secret =
    process.env.VENDOR_USAGE_TOKEN_SECRET?.trim() ||
    String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim() ||
    "promptly-vendor-usage-dev-key";
  return createHash("sha256").update(secret).digest();
}

export function hasEncryptedVendorTokens(blob: string | null | undefined): boolean {
  return typeof blob === "string" && blob.length > 40;
}

export function encryptVendorTokens(tokens: StoredVendorTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, payload]).toString("base64");
}

export function decryptVendorTokens(blob: string | null | undefined): StoredVendorTokens | null {
  if (!blob || typeof blob !== "string") return null;
  try {
    const raw = Buffer.from(blob, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as StoredVendorTokens;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
