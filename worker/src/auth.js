const encoder = new TextEncoder();

export function readBearerToken(request) {
  const header = request.headers.get("Authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim();
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashUserApiKey(rawKey, salt) {
  return sha256Hex(`${salt}:${rawKey}`);
}

export async function validateUserKey(request, env) {
  const rawKey = readBearerToken(request);
  if (!rawKey) {
    return { ok: false, code: 401, error: "Missing Authorization bearer token" };
  }
  if (!env.USER_KEY_SALT) {
    return { ok: false, code: 500, error: "Missing USER_KEY_SALT secret" };
  }

  const hashed = await hashUserApiKey(rawKey, env.USER_KEY_SALT);
  const recordRaw = await env.USER_KEYS.get(hashed);
  if (!recordRaw) {
    return { ok: false, code: 401, error: "Invalid API key" };
  }

  let record;
  try {
    record = JSON.parse(recordRaw);
  } catch (_error) {
    return { ok: false, code: 500, error: "Corrupt API key record" };
  }
  if (record.status !== "active") {
    return { ok: false, code: 401, error: "API key is revoked" };
  }

  return {
    ok: true,
    keyHash: hashed,
    keyId: record.id || hashed.slice(0, 12),
    label: record.label || null
  };
}

export async function createUserApiKey(env, label = "default") {
  if (!env.USER_KEY_SALT) {
    throw new Error("Missing USER_KEY_SALT secret");
  }
  const id = crypto.randomUUID();
  const rawKey = `prmpt_${crypto.randomUUID().replace(/-/g, "")}`;
  const hashed = await hashUserApiKey(rawKey, env.USER_KEY_SALT);
  const now = new Date().toISOString();
  await env.USER_KEYS.put(
    hashed,
    JSON.stringify({
      id,
      label,
      status: "active",
      createdAt: now
    })
  );
  return { id, apiKey: rawKey, createdAt: now, label };
}

export async function revokeUserApiKey(env, rawKey) {
  if (!rawKey) {
    throw new Error("api_key is required");
  }
  const hashed = await hashUserApiKey(rawKey, env.USER_KEY_SALT);
  const recordRaw = await env.USER_KEYS.get(hashed);
  if (!recordRaw) {
    return { revoked: false };
  }
  const record = JSON.parse(recordRaw);
  record.status = "revoked";
  record.revokedAt = new Date().toISOString();
  await env.USER_KEYS.put(hashed, JSON.stringify(record));
  return { revoked: true, id: record.id || null };
}
