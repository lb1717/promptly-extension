import { parseAllowedOrigins, handlePreflight, isOriginAllowed, createCorsHeaders } from "./cors.js";
import { validateUserKey, createUserApiKey, revokeUserApiKey } from "./auth.js";
import { optimizePromptThroughProvider, resolveOptimizeModeFromPayload } from "./optimize.js";
import {
  buildCreditsEnvelope,
  conservativeBillFromEstimatedInput,
  CREDIT_MAX_ESTIMATED_INPUT_TOKENS,
  CREDIT_MAX_INSTRUCTION_CHARS,
  CREDIT_MAX_PROMPT_CHARS,
  DAILY_API_TOKEN_LIMIT_DEFAULT,
  DAILY_API_TOKEN_LIMIT_ENV_MIN,
  estimateBundledInputTokens
} from "./creditsEnvelope.js";
export { RateLimiterDO } from "./rateLimiter.js";

const REQUIRED_CLIENT_HEADER = "promptly-extension";
const identityEncoder = new TextEncoder();

function parseEstimateLengthHeader(request, headerName, cap) {
  const raw = String(request.headers.get(headerName) || "").trim();
  if (!raw) {
    return null;
  }
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.min(cap, n);
}

function resolveDailyTokenLimit(env) {
  const raw = Number(String(env.DAILY_TOKEN_LIMIT ?? "").trim());
  const candidate =
    Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DAILY_API_TOKEN_LIMIT_DEFAULT;
  return Math.max(DAILY_API_TOKEN_LIMIT_ENV_MIN, candidate);
}

function jsonResponse(status, body, origin = null, extraHeaders = null) {
  const headers = { "Content-Type": "application/json", ...(extraHeaders || {}) };
  if (origin) {
    Object.assign(headers, createCorsHeaders(origin));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function enforceRateLimit(env, scope, key, minuteLimit, hourLimit) {
  const id = env.RATE_LIMITER.idFromName(`${scope}:${key}`);
  const stub = env.RATE_LIMITER.get(id);
  const response = await stub.fetch("https://internal/rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, key, minuteLimit, hourLimit })
  });
  const data = await response.json();
  return data;
}

function getUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", identityEncoder.encode(text));
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyGoogleIdTokenViaTokeninfo(idToken) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error_description || body.error || "Google ID token verification failed";
    throw new Error(String(reason));
  }
  return body;
}

async function verifyGoogleAccessTokenViaTokeninfo(accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error_description || body.error || "Google access token verification failed";
    throw new Error(String(reason));
  }
  return body;
}

async function verifyFirebaseIdTokenViaLookup(idToken, firebaseWebApiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      firebaseWebApiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error?.message || body?.error || "Firebase token verification failed";
    throw new Error(String(reason));
  }
  const firstUser = Array.isArray(body?.users) ? body.users[0] : null;
  if (!firstUser || !firstUser.localId) {
    throw new Error("Firebase token has no user payload");
  }
  return {
    uid: String(firstUser.localId),
    email: String(firstUser.email || "").trim().toLowerCase(),
    emailVerified: !!firstUser.emailVerified
  };
}

async function resolveUserIdentityFromGoogleIdToken(request, env, googleIdToken, expectedAud) {
  let ti;
  try {
    ti = await verifyGoogleIdTokenViaTokeninfo(googleIdToken);
  } catch (error) {
    return { ok: false, code: 401, error: String(error?.message || error || "Invalid Google ID token") };
  }
  const aud = String(ti.aud || "").trim();
  if (!aud || aud !== expectedAud) {
    return {
      ok: false,
      code: 403,
      error: "Google token audience does not match GOOGLE_OAUTH_WEB_CLIENT_ID on the server"
    };
  }
  const email = String(ti.email || "")
    .trim()
    .toLowerCase();
  const emailVerified = ti.email_verified === true || String(ti.email_verified) === "true";
  if (!email || !emailVerified) {
    return { ok: false, code: 403, error: "Google account email missing or not verified" };
  }
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
    return { ok: false, code: 403, error: "Only Gmail users are allowed" };
  }
  const headerEmail = String(request.headers.get("x-promptly-user-email") || "")
    .trim()
    .toLowerCase();
  if (headerEmail && headerEmail !== email) {
    return { ok: false, code: 403, error: "Chrome email does not match Google sign-in" };
  }
  const sub = String(ti.sub || "").trim();
  if (!sub) {
    return { ok: false, code: 401, error: "Invalid Google token (no subject)" };
  }
  const salt = String(env.USER_ID_SALT || env.USER_KEY_SALT || "").trim();
  if (!salt) {
    return { ok: false, code: 500, error: "Missing USER_ID_SALT secret" };
  }
  const userHash = await sha256Hex(`${salt}:${sub}`);
  return { ok: true, userHash, email, uid: sub };
}

async function resolveUserIdentityFromGoogleAccessToken(request, env, googleAccessToken, expectedAud) {
  let ti;
  try {
    ti = await verifyGoogleAccessTokenViaTokeninfo(googleAccessToken);
  } catch (error) {
    return { ok: false, code: 401, error: String(error?.message || error || "Invalid Google access token") };
  }
  const aud = String(ti.audience || ti.issued_to || "").trim();
  if (!aud || aud !== expectedAud) {
    return {
      ok: false,
      code: 403,
      error: "Google token audience does not match GOOGLE_OAUTH_WEB_CLIENT_ID on the server"
    };
  }

  const email = String(ti.email || "")
    .trim()
    .toLowerCase();
  const verifiedEmail = String(ti.verified_email || "").toLowerCase() === "true";
  if (!email || !verifiedEmail) {
    return { ok: false, code: 403, error: "Google account email missing or not verified" };
  }
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
    return { ok: false, code: 403, error: "Only Gmail users are allowed" };
  }

  const headerEmail = String(request.headers.get("x-promptly-user-email") || "")
    .trim()
    .toLowerCase();
  if (headerEmail && headerEmail !== email) {
    return { ok: false, code: 403, error: "Chrome email does not match Google sign-in" };
  }

  const sub = String(ti.user_id || "").trim();
  if (!sub) {
    return { ok: false, code: 401, error: "Invalid Google token (no subject)" };
  }
  const salt = String(env.USER_ID_SALT || env.USER_KEY_SALT || "").trim();
  if (!salt) {
    return { ok: false, code: 500, error: "Missing USER_ID_SALT secret" };
  }
  const userHash = await sha256Hex(`${salt}:${sub}`);
  return { ok: true, userHash, email, uid: sub };
}

async function resolveUserIdentityFromFirebaseToken(request, env, firebaseToken, firebaseWebApiKey) {
  let verified;
  try {
    verified = await verifyFirebaseIdTokenViaLookup(firebaseToken, firebaseWebApiKey);
  } catch (error) {
    return { ok: false, code: 401, error: String(error?.message || error || "Invalid Firebase token") };
  }
  if (!verified.email || !verified.emailVerified) {
    return { ok: false, code: 403, error: "Firebase account email is missing or not verified" };
  }
  if (!verified.email.endsWith("@gmail.com") && !verified.email.endsWith("@googlemail.com")) {
    return { ok: false, code: 403, error: "Only Gmail users are allowed" };
  }

  const headerEmail = String(request.headers.get("x-promptly-user-email") || "")
    .trim()
    .toLowerCase();
  if (headerEmail && headerEmail !== verified.email) {
    return { ok: false, code: 403, error: "Chrome email does not match Firebase account" };
  }

  const salt = String(env.USER_ID_SALT || env.USER_KEY_SALT || "").trim();
  if (!salt) {
    return { ok: false, code: 500, error: "Missing USER_ID_SALT secret" };
  }
  const userHash = await sha256Hex(`${salt}:${verified.uid}`);
  return { ok: true, userHash, email: verified.email, uid: verified.uid };
}

async function resolveUserIdentity(request, env) {
  const googleAccessToken = String(request.headers.get("x-promptly-google-access-token") || "").trim();
  const googleIdToken = String(request.headers.get("x-promptly-google-id-token") || "").trim();
  const googleAud = String(env.GOOGLE_OAUTH_WEB_CLIENT_ID || "").trim();
  if (googleAccessToken && googleAud) {
    return resolveUserIdentityFromGoogleAccessToken(request, env, googleAccessToken, googleAud);
  }
  if (googleIdToken && googleAud) {
    return resolveUserIdentityFromGoogleIdToken(request, env, googleIdToken, googleAud);
  }

  const firebaseToken = String(request.headers.get("x-promptly-firebase-token") || "").trim();
  const firebaseWebApiKey = String(env.FIREBASE_WEB_API_KEY || "").trim();
  if (firebaseToken && firebaseWebApiKey) {
    return resolveUserIdentityFromFirebaseToken(request, env, firebaseToken, firebaseWebApiKey);
  }

  if (googleIdToken && !googleAud) {
    return { ok: false, code: 500, error: "Server missing GOOGLE_OAUTH_WEB_CLIENT_ID" };
  }
  if (firebaseToken && !firebaseWebApiKey) {
    return { ok: false, code: 500, error: "Missing FIREBASE_WEB_API_KEY secret" };
  }
  return { ok: false, code: 401, error: "Missing Google or Firebase identity token" };
}

async function resolveUserIdentityLegacyEmail(request, env) {
  const email = String(request.headers.get("x-promptly-user-email") || "")
    .trim()
    .toLowerCase();
  if (!email) {
    return { ok: false, code: 401, error: "Missing signed-in user identity" };
  }
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
    return { ok: false, code: 403, error: "Only Gmail users are allowed" };
  }
  const salt = String(env.USER_ID_SALT || env.USER_KEY_SALT || "").trim();
  if (!salt) {
    return { ok: false, code: 500, error: "Missing USER_ID_SALT secret" };
  }
  const userHash = await sha256Hex(`${salt}:${email}`);
  return { ok: true, userHash, email };
}

async function resolveIdentityWithOptionalLegacyFallback(request, env) {
  const identity = await resolveUserIdentity(request, env);
  if (identity.ok) {
    return identity;
  }
  const allowLegacy = String(env.ALLOW_LEGACY_EMAIL_IDENTITY || "false").toLowerCase() === "true";
  if (!allowLegacy) {
    return identity;
  }
  const missingPrimary =
    identity.error === "Missing Google or Firebase identity token" ||
    identity.error === "Missing FIREBASE_WEB_API_KEY secret" ||
    identity.error === "Server missing GOOGLE_OAUTH_WEB_CLIENT_ID";
  if (!missingPrimary) {
    return identity;
  }
  return resolveUserIdentityLegacyEmail(request, env);
}

async function readDailyTokenUsage(env, key, day, limit) {
  try {
    const id = env.RATE_LIMITER.idFromName(`daily-credit:${key}`);
    const stub = env.RATE_LIMITER.get(id);
    const response = await stub.fetch("https://internal/daily-credit/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "daily_tokens", key, day, limit })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        limited: false,
        error: typeof data.error === "string" ? data.error : "Credit status request failed"
      };
    }
    return data;
  } catch (err) {
    return { ok: false, limited: false, error: String(err?.message || err) };
  }
}

async function consumeDailyTokens(env, key, day, limit, cost) {
  try {
    const id = env.RATE_LIMITER.idFromName(`daily-credit:${key}`);
    const stub = env.RATE_LIMITER.get(id);
    const response = await stub.fetch("https://internal/daily-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "daily_tokens", key, day, limit, cost })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        limited: true,
        error: typeof data.error === "string" ? data.error : "Credit consume request failed",
        used: Number(data.used || 0),
        remaining: Math.max(0, limit - Number(data.used || 0)),
        limit,
        retryAfter: Number(data.retryAfter) || 60
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      limited: false,
      creditRequestFailed: true,
      error: String(err?.message || err),
      used: 0,
      remaining: 0,
      limit,
      retryAfter: 60
    };
  }
}

async function writeUsageMetadata(env, metadata) {
  if (!env.USAGE_KV) {
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const usageKey = `usage:${day}:${metadata.keyId}:${crypto.randomUUID()}`;
  await env.USAGE_KV.put(usageKey, JSON.stringify(metadata), {
    expirationTtl: 60 * 60 * 24 * 31
  });
}

function requireAdmin(request, env) {
  const token = request.headers.get("x-admin-token");
  return !!token && token === env.ADMIN_TOKEN;
}

function getModeBucket(optimizeMode) {
  const mode = String(optimizeMode || "").toLowerCase();
  if (mode === "auto") {
    return "auto";
  }
  if (mode === "generate") {
    return "generated";
  }
  if (mode === "improve") {
    return "manual";
  }
  if (mode.includes("auto")) {
    return "auto";
  }
  if (mode.includes("generate") || mode.includes("gen") || mode === "create") {
    return "generated";
  }
  if (mode.includes("manual") || mode.includes("rewrite") || mode.includes("custom")) {
    return "manual";
  }
  return "manual";
}

async function readUsageRecords(env, maxRecords = 5000) {
  if (!env.USAGE_KV) {
    return [];
  }
  const records = [];
  let cursor = undefined;
  while (records.length < maxRecords) {
    const page = await env.USAGE_KV.list({ prefix: "usage:", cursor, limit: 1000 });
    for (const item of page.keys || []) {
      if (records.length >= maxRecords) {
        break;
      }
      const raw = await env.USAGE_KV.get(item.name);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        records.push({
          ...parsed,
          __kvKey: item.name
        });
      } catch (_err) {
        // ignore malformed items
      }
    }
    if (!page.list_complete && page.cursor) {
      cursor = page.cursor;
      continue;
    }
    break;
  }
  return records;
}

function getRecentDays(days) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dayFromRecord(record) {
  if (typeof record.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.day)) {
    return record.day;
  }
  if (typeof record.timestamp === "string" && record.timestamp.length >= 10) {
    return record.timestamp.slice(0, 10);
  }
  if (typeof record.__kvKey === "string") {
    const match = record.__kvKey.match(/^usage:(\d{4}-\d{2}-\d{2}):/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default {
  async fetch(request, env) {
    const allowedOrigins = parseAllowedOrigins(env);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return handlePreflight(request, allowedOrigins);
    }

    if (origin && !isOriginAllowed(origin, allowedOrigins)) {
      return jsonResponse(403, { error: "Origin not allowed" });
    }

    const pathname = new URL(request.url).pathname;
    const corsOrigin = origin;

    if (pathname === "/health") {
      return jsonResponse(200, { ok: true, service: "promptly-proxy" }, corsOrigin);
    }

    if (pathname === "/credits" && request.method === "GET") {
      const clientHeader = request.headers.get("x-promptly-client");
      if (clientHeader !== REQUIRED_CLIENT_HEADER) {
        return jsonResponse(400, { error: "Missing or invalid x-promptly-client header" }, corsOrigin);
      }
      const authResult = await validateUserKey(request, env);
      if (!authResult.ok) {
        return jsonResponse(authResult.code, { error: authResult.error }, corsOrigin);
      }
      const identity = await resolveIdentityWithOptionalLegacyFallback(request, env);
      if (!identity.ok) {
        return jsonResponse(identity.code, { error: identity.error }, corsOrigin);
      }
      const day = getUtcDay();
      const dailyLimit = resolveDailyTokenLimit(env);
      const usage = await readDailyTokenUsage(
        env,
        identity.userHash,
        day,
        dailyLimit
      );
      if (!usage.ok) {
        return jsonResponse(
          503,
          { error: usage.error || "Unable to read daily credits" },
          corsOrigin
        );
      }
      const pEst = parseEstimateLengthHeader(
        request,
        "x-promptly-estimate-prompt-length",
        CREDIT_MAX_PROMPT_CHARS
      );
      const iEst = parseEstimateLengthHeader(
        request,
        "x-promptly-estimate-instruction-length",
        CREDIT_MAX_INSTRUCTION_CHARS
      );
      const estimatedInputTokens =
        pEst !== null || iEst !== null
          ? estimateBundledInputTokens(pEst ?? 0, iEst ?? 0)
          : null;
      return jsonResponse(
        200,
        {
          ok: true,
          day,
          credits: buildCreditsEnvelope(usage, dailyLimit, {
            estimatedInputTokens
          })
        },
        corsOrigin,
        { "Cache-Control": "no-store" }
      );
    }

    if (pathname === "/admin/keys/create" && request.method === "POST") {
      if (!requireAdmin(request, env)) {
        return jsonResponse(401, { error: "Unauthorized" }, corsOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const label = String(body.label || "default").slice(0, 80);
      try {
        const created = await createUserApiKey(env, label);
        return jsonResponse(201, created, corsOrigin);
      } catch (error) {
        return jsonResponse(500, { error: String(error.message || error) }, corsOrigin);
      }
    }

    if (pathname === "/admin/keys/revoke" && request.method === "POST") {
      if (!requireAdmin(request, env)) {
        return jsonResponse(401, { error: "Unauthorized" }, corsOrigin);
      }
      const body = await request.json().catch(() => ({}));
      try {
        const result = await revokeUserApiKey(env, String(body.api_key || ""));
        return jsonResponse(200, result, corsOrigin);
      } catch (error) {
        return jsonResponse(400, { error: String(error.message || error) }, corsOrigin);
      }
    }

    if (pathname === "/admin/stats" && request.method === "GET") {
      if (!requireAdmin(request, env)) {
        return jsonResponse(401, { error: "Unauthorized" }, corsOrigin);
      }
      const url = new URL(request.url);
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "14")));
      const records = await readUsageRecords(env, 10000);
      const dayKeys = getRecentDays(days);
      const daySet = new Set(dayKeys);
      const timelineMap = new Map(
        dayKeys.map((d) => [d, { day: d, total: 0, auto: 0, manual: 0, generated: 0, tokens: 0 }])
      );
      let totalImproved = 0;
      let totalAuto = 0;
      let totalManual = 0;
      let totalGenerated = 0;
      let totalTokens = 0;
      for (const record of records) {
        if (toNumber(record.status, 0) !== 200) {
          continue;
        }
        const day = dayFromRecord(record);
        if (!day || !daySet.has(day)) {
          continue;
        }
        const bucket = getModeBucket(record.optimizeMode || record.requestMode);
        const row = timelineMap.get(day);
        if (!row) {
          continue;
        }
        row.total += 1;
        row[bucket] += 1;
        row.tokens += toNumber(record.tokenCost, toNumber(record.estimatedInputTokens, 0));
        totalImproved += 1;
        totalTokens += toNumber(record.tokenCost, toNumber(record.estimatedInputTokens, 0));
        if (bucket === "auto") {
          totalAuto += 1;
        } else if (bucket === "generated") {
          totalGenerated += 1;
        } else {
          totalManual += 1;
        }
      }
      return jsonResponse(
        200,
        {
          ok: true,
          range_days: days,
          totals: {
            improved: totalImproved,
            auto: totalAuto,
            manual: totalManual,
            generated: totalGenerated,
            tokens: totalTokens
          },
          timeline: dayKeys.map((d) => timelineMap.get(d))
        },
        corsOrigin
      );
    }

    if (pathname === "/admin/users" && request.method === "GET") {
      if (!requireAdmin(request, env)) {
        return jsonResponse(401, { error: "Unauthorized" }, corsOrigin);
      }
      const url = new URL(request.url);
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "30")));
      const recentDays = getRecentDays(days);
      const records = await readUsageRecords(env, 20000);
      const dailyLimit = resolveDailyTokenLimit(env);
      const userMap = new Map();
      for (const record of records) {
        const userId = String(record.userIdHash || "");
        if (!userId) {
          continue;
        }
        const status = toNumber(record.status, 0);
        if (status !== 200) {
          continue;
        }
        const day = dayFromRecord(record);
        if (!day) {
          continue;
        }
        const tokens = Math.max(0, toNumber(record.tokenCost, toNumber(record.estimatedInputTokens, 0)));
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            user_id: userId,
            dayTokens: new Map(),
            prompts: 0,
            email: ""
          });
        }
        const user = userMap.get(userId);
        user.dayTokens.set(day, (user.dayTokens.get(day) || 0) + tokens);
        if (typeof record.userEmail === "string" && record.userEmail) {
          user.email = record.userEmail;
        }
        user.prompts += 1;
      }
      const users = [];
      const today = getUtcDay();
      for (const [, user] of userMap) {
        const allDailyValues = Array.from(user.dayTokens.values());
        const allTimeMaxDailyTokenUsage = allDailyValues.length ? Math.max(...allDailyValues) : 0;
        const recentValues = [];
        for (const day of recentDays) {
          recentValues.push(user.dayTokens.get(day) || 0);
        }
        const activeRecentValues = recentValues.filter((v) => v > 0);
        const avgDailyTokenUsage =
          activeRecentValues.length > 0
            ? Math.round(activeRecentValues.reduce((a, b) => a + b, 0) / activeRecentValues.length)
            : 0;
        const last7Days = recentDays.slice(-7).map((day) => user.dayTokens.get(day) || 0);
        const sevenDayMaxDailyTokenUsage = last7Days.length ? Math.max(...last7Days) : 0;
        users.push({
          user_id: user.user_id,
          email: user.email || null,
          avg_daily_token_usage: avgDailyTokenUsage,
          seven_day_max_daily_token_usage: sevenDayMaxDailyTokenUsage,
          all_time_max_daily_token_usage: allTimeMaxDailyTokenUsage,
          daily_token_limit: dailyLimit,
          today_tokens: user.dayTokens.get(today) || 0,
          prompts_improved: user.prompts
        });
      }
      users.sort((a, b) => b.today_tokens - a.today_tokens);
      return jsonResponse(
        200,
        {
          ok: true,
          range_days: days,
          users
        },
        corsOrigin
      );
    }

    if (pathname !== "/optimize" || request.method !== "POST") {
      return jsonResponse(404, { error: "Not found" }, corsOrigin);
    }

    const clientHeader = request.headers.get("x-promptly-client");
    if (clientHeader !== REQUIRED_CLIENT_HEADER) {
      return jsonResponse(400, { error: "Missing or invalid x-promptly-client header" }, corsOrigin);
    }

    const authResult = await validateUserKey(request, env);
    if (!authResult.ok) {
      return jsonResponse(authResult.code, { error: authResult.error }, corsOrigin);
    }
    const identity = await resolveIdentityWithOptionalLegacyFallback(request, env);
    if (!identity.ok) {
      return jsonResponse(identity.code, { error: identity.error }, corsOrigin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userRate = await enforceRateLimit(env, "user", authResult.keyHash, 30, 120);
    if (!userRate.ok) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded (user key)" }),
        {
          status: 429,
          headers: {
            ...createCorsHeaders(corsOrigin),
            "Content-Type": "application/json",
            "Retry-After": String(userRate.retryAfter || 60)
          }
        }
      );
    }
    const ipRate = await enforceRateLimit(env, "ip", ip, 60, 0);
    if (!ipRate.ok) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded (IP)" }),
        {
          status: 429,
          headers: {
            ...createCorsHeaders(corsOrigin),
            "Content-Type": "application/json",
            "Retry-After": String(ipRate.retryAfter || 60)
          }
        }
      );
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 20000) {
      return jsonResponse(413, { error: "Payload too large" }, corsOrigin);
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse(400, { error: "Invalid JSON body" }, corsOrigin);
    }

    if (typeof payload.prompt !== "string") {
      return jsonResponse(400, { error: "prompt must be a string" }, corsOrigin);
    }
    const prompt = payload.prompt.trim();
    const userInstruction =
      typeof payload.user_instruction === "string" ? payload.user_instruction.trim() : "";
    const optimizeMode = resolveOptimizeModeFromPayload(payload);
    if (!prompt && !userInstruction) {
      return jsonResponse(400, { error: "prompt or user_instruction is required" }, corsOrigin);
    }
    if (prompt.length > CREDIT_MAX_PROMPT_CHARS) {
      return jsonResponse(413, { error: `prompt exceeds ${CREDIT_MAX_PROMPT_CHARS} chars` }, corsOrigin);
    }

    const estimatedInputTokens = estimateBundledInputTokens(prompt.length, userInstruction.length);
    if (estimatedInputTokens > CREDIT_MAX_ESTIMATED_INPUT_TOKENS) {
      return jsonResponse(413, { error: "prompt estimated token size too large" }, corsOrigin);
    }
    if (userInstruction.length > CREDIT_MAX_INSTRUCTION_CHARS) {
      return jsonResponse(
        413,
        { error: `user_instruction exceeds ${CREDIT_MAX_INSTRUCTION_CHARS} chars` },
        corsOrigin
      );
    }

    const day = getUtcDay();
    const dailyLimit = resolveDailyTokenLimit(env);
    const usageBefore = await readDailyTokenUsage(env, identity.userHash, day, dailyLimit);
    if (!usageBefore.ok) {
      return jsonResponse(
        503,
        { error: usageBefore.error || "Unable to read daily credits" },
        corsOrigin
      );
    }
    if (usageBefore.limited) {
      return new Response(
        JSON.stringify({
          error: "Daily API token limit reached",
          credits: buildCreditsEnvelope(usageBefore, dailyLimit, { estimatedInputTokens })
        }),
        {
          status: 429,
          headers: {
            ...createCorsHeaders(corsOrigin),
            "Content-Type": "application/json",
            "Retry-After": String(usageBefore.retryAfter || 60)
          }
        }
      );
    }
    const conservativeBill = conservativeBillFromEstimatedInput(estimatedInputTokens, dailyLimit);
    if (usageBefore.used + conservativeBill > dailyLimit) {
      return new Response(
        JSON.stringify({
          error:
            "Not enough API tokens for this prompt size (same units as OpenAI usage.total_tokens). Shorten the prompt or wait until UTC midnight reset.",
          credits: buildCreditsEnvelope(usageBefore, dailyLimit, { estimatedInputTokens })
        }),
        {
          status: 429,
          headers: {
            ...createCorsHeaders(corsOrigin),
            "Content-Type": "application/json",
            "Retry-After": String(usageBefore.retryAfter || 60)
          }
        }
      );
    }

    const started = Date.now();
    try {
      const optimized = await optimizePromptThroughProvider(env, prompt, userInstruction, optimizeMode);
      const providerUsagePrompt = Math.max(0, toNumber(optimized?.usage?.prompt_tokens, 0));
      const providerUsageCompletion = Math.max(0, toNumber(optimized?.usage?.completion_tokens, 0));
      const providerUsageTotalRaw = Math.max(
        0,
        toNumber(optimized?.usage?.total_tokens, toNumber(optimized?.usage?.totalTokens, 0))
      );
      const providerUsageDerivedTotal = Math.max(0, providerUsagePrompt + providerUsageCompletion);
      const providerUsageTotal =
        providerUsageTotalRaw > 0 ? providerUsageTotalRaw : providerUsageDerivedTotal;
      const tokenCost = Math.max(1, providerUsageTotal || estimatedInputTokens);
      const billingBasis =
        providerUsageTotalRaw > 0
          ? "provider_total_tokens"
          : providerUsageDerivedTotal > 0
            ? "provider_prompt_plus_completion"
            : "estimated_input_tokens";
      const credits = await consumeDailyTokens(
        env,
        identity.userHash,
        day,
        dailyLimit,
        tokenCost
      );
      if (!credits.ok) {
        if (credits.creditRequestFailed) {
          return jsonResponse(
            503,
            { error: credits.error || "Unable to update daily credits" },
            corsOrigin
          );
        }
        const usedAfter = Number(credits.used || 0);
        const atHardCap = usedAfter >= dailyLimit;
        const errorMessage = atHardCap
          ? "Daily API token limit reached"
          : "Not enough API tokens for this response (OpenAI usage.total_tokens). Try a shorter prompt or wait until UTC midnight reset.";
        return new Response(
          JSON.stringify({
            error: errorMessage,
            credits: buildCreditsEnvelope(credits, dailyLimit, { estimatedInputTokens })
          }),
          {
            status: 429,
            headers: {
              ...createCorsHeaders(corsOrigin),
              "Content-Type": "application/json",
              "Retry-After": String(credits.retryAfter || 60)
            }
          }
        );
      }
      const responseBody = {
        optimized_prompt: optimized.optimized_prompt,
        clarifying_questions: optimized.clarifying_questions,
        assumptions: optimized.assumptions,
        usage: optimized.usage || null,
        billed_tokens: tokenCost,
        billing_basis: billingBasis,
        credits: buildCreditsEnvelope(credits, dailyLimit, { estimatedInputTokens })
      };

      const latencyMs = Date.now() - started;
      console.log(
        `[promptly] /optimize ok optimize_mode=${optimizeMode} provider=${optimized.provider} model=${optimized.model} latency_ms=${latencyMs}`
      );
      const metadata = {
        keyId: authResult.keyId,
        userIdHash: identity.userHash,
        userEmail: identity.email,
        day,
        optimizeMode,
        provider: optimized.provider,
        model: optimized.model,
        status: 200,
        latencyMs,
        promptChars: prompt.length,
        estimatedInputTokens,
        tokenCost,
        billingBasis,
        providerUsage: optimized.usage || null,
        responseChars: optimized.optimized_prompt.length,
        timestamp: new Date().toISOString()
      };
      await writeUsageMetadata(env, metadata);
      if (String(env.DEBUG_LOGS || "false").toLowerCase() === "true") {
        console.log("optimize_metadata", metadata);
      }

      return jsonResponse(200, responseBody, corsOrigin);
    } catch (error) {
      const latencyMs = Date.now() - started;
      const errMsg = String(error.message || error).slice(0, 240);
      console.log(`[promptly] /optimize FAIL latency_ms=${latencyMs} error=${errMsg}`);
      const metadata = {
        keyId: authResult.keyId,
        userIdHash: identity.userHash,
        userEmail: identity.email,
        day,
        optimizeMode,
        status: 502,
        latencyMs,
        promptChars: prompt.length,
        estimatedInputTokens,
        error: errMsg,
        timestamp: new Date().toISOString()
      };
      await writeUsageMetadata(env, metadata);
      if (String(env.DEBUG_LOGS || "false").toLowerCase() === "true") {
        console.log("optimize_error_metadata", metadata);
      }
      return jsonResponse(
        502,
        { error: metadata.error || "Provider failure", detail: metadata.error },
        corsOrigin
      );
    }
  }
};
