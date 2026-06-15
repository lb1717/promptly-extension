import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type StoredVendorTokens = {
  claude_code?: { access_token: string; refresh_token?: string | null };
  codex?: { access_token: string; account_id?: string | null };
  cursor?: { access_token: string; plan_slug?: string | null; email?: string | null };
};

function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptionSecretCandidates(): string[] {
  const out: string[] = [];
  const add = (value: string | undefined | null) => {
    const s = String(value || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  add(process.env.VENDOR_USAGE_TOKEN_SECRET);
  add(process.env.FIREBASE_ADMIN_PROJECT_ID);
  add(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  add(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  add("promptly-vendor-usage-dev-key");
  return out;
}

function primaryEncryptionKey(): Buffer {
  return hashSecret(encryptionSecretCandidates()[0] ?? "promptly-vendor-usage-dev-key");
}

function tryDecryptWithKey(blob: string, key: Buffer): StoredVendorTokens | null {
  try {
    const raw = Buffer.from(blob, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as StoredVendorTokens;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function hasEncryptedVendorTokens(blob: string | null | undefined): boolean {
  return typeof blob === "string" && blob.length > 40;
}

export function encryptVendorTokens(tokens: StoredVendorTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primaryEncryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, payload]).toString("base64");
}

export function decryptVendorTokens(blob: string | null | undefined): StoredVendorTokens | null {
  if (!blob || typeof blob !== "string") return null;
  const keys = encryptionSecretCandidates().map(hashSecret);
  for (const key of keys) {
    const parsed = tryDecryptWithKey(blob, key);
    if (parsed) return parsed;
  }
  return null;
}

export function canDecryptVendorTokensWithPrimaryKey(blob: string | null | undefined): boolean {
  if (!blob || typeof blob !== "string") return false;
  return Boolean(tryDecryptWithKey(blob, primaryEncryptionKey()));
}
