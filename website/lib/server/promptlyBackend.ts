import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";

export const CREDIT_MAX_PROMPT_CHARS = 12000;
export const CREDIT_MAX_INSTRUCTION_CHARS = 3000;
export const CREDIT_MAX_ESTIMATED_INPUT_TOKENS = 20000;
/** Placeholder for the user's prompt (rewrite/auto) or compose description; put anywhere in admin super-prompts. */
export const PROMPTLY_USER_CONTENT_TOKEN = "<<PROMPTLY_USER_CONTENT>>";
const PROMPT_SETTINGS_COLLECTION = "promptly_settings";
const PROMPT_ENGINEERING_DOC_ID = "prompt_engineering";
const TIER_LIMITS_DOC_ID = "tier_limits";
const USER_EMAIL_INDEX_COLLECTION = "user_email_index";
const TIER_LIMITS_CACHE_MS = 30_000;
/** Default Pro daily cap (tokens / UTC day) when admin doc not set — editable in Admin → Plan limits. */
export const DEFAULT_PRO_DAILY_TOKEN_LIMIT = 12_000_000;
const PROMPT_TEMPLATE_MAX_CHARS = 24_000;
const FAST_CREATE_TEMPLATE_MAX_CHARS = 3500;
const FAST_CREATE_USER_SLOT_MAX_CHARS = 2200;
/** Extra chars assumed for super-prompt template when estimating credits before loading Firestore. */
const OPTIMIZE_TEMPLATE_OVERHEAD_CHARS = 6000;
const PROMPT_ENGINEERING_CACHE_MS = 45_000;
export const DAILY_BILL_PLAN_CAP = 250_000;
export const DAILY_API_TOKEN_LIMIT_DEFAULT = 4_000_000;
/** Upper bound for admin-set daily token limits (abuse throttle). */
export const ADMIN_DAILY_TOKEN_LIMIT_MAX = 50_000_000;

const REQUIRED_CLIENT_HEADER = "promptly-extension";
const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
const DEFAULT_OPENAI_REWRITE_MODEL = "gpt-5-nano";
const DEFAULT_OPENAI_CREATE_MODEL = "gpt-5-nano";
const USER_COLLECTION = "users";
const DAILY_USAGE_COLLECTION = "promptly_usage_daily";
const GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS = 45 * 60 * 1000;
const googleAccessTokenCache = new Map<string, { expiresAt: number; email: string | null; sub: string }>();

type PromptlyUser = {
  uid: string;
  email: string | null;
  plan: string;
  dailyTokenLimit: number;
  promptsImprovedTotal: number;
  allTimeMaxDailyTokenUsage: number;
};

type DailyUsage = {
  day: string;
  uid: string;
  email: string | null;
  used: number;
  promptsImproved: number;
  auto: number;
  manual: number;
  generated: number;
  limit: number;
};

type OptimizerResult = {
  optimized_prompt: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  } | null;
  model: string;
  provider: "openai";
};

function required(name: string, value: string | undefined) {
  const next = String(value || "").trim();
  if (!next) {
    throw new Error(`Missing ${name}`);
  }
  return next;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function estimateTokensFromChars(charCount: number) {
  return Math.ceil(charCount / 4);
}

export function estimateBundledInputTokens(promptLen: number, instructionLen: number) {
  const p = Math.min(CREDIT_MAX_PROMPT_CHARS, Math.max(0, Math.floor(Number(promptLen) || 0)));
  const i = Math.min(CREDIT_MAX_INSTRUCTION_CHARS, Math.max(0, Math.floor(Number(instructionLen) || 0)));
  return estimateTokensFromChars(p + i);
}

/** Conservative estimate including configurable super-prompt template bulk (see prompt engineering admin). */
export function estimateBundledInputTokensForOptimize(promptLen: number, instructionLen: number) {
  const p = Math.min(CREDIT_MAX_PROMPT_CHARS, Math.max(0, Math.floor(Number(promptLen) || 0)));
  const i = Math.min(CREDIT_MAX_INSTRUCTION_CHARS, Math.max(0, Math.floor(Number(instructionLen) || 0)));
  return estimateTokensFromChars(p + i + OPTIMIZE_TEMPLATE_OVERHEAD_CHARS);
}

export function conservativeBillFromEstimatedInput(estimatedInputTokens: number, dailyLimit: number) {
  const et = Math.max(0, Number(estimatedInputTokens) || 0);
  const cap = Math.max(1, Math.floor(Number(dailyLimit) || 1));
  const plannedBillTokens = Math.min(cap, Math.max(1, Math.ceil(et * 2.5)));
  return Math.min(DAILY_BILL_PLAN_CAP, plannedBillTokens);
}

function toCreditsView(raw: { used: number; limit: number; remaining?: number }) {
  const usedRaw = Math.max(0, Number(raw.used || 0));
  const limit = Math.max(1, Number(raw.limit || 1));
  // UI should never show usage beyond the daily cap.
  const used = Math.min(limit, usedRaw);
  const remaining = Math.max(0, Number(raw.remaining ?? Math.max(0, limit - used)));
  const rawUsedPercent = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  const usedPercent = used > 0 ? Math.max(1, rawUsedPercent) : 0;
  const leftPercent = Math.max(0, Math.min(100, 100 - usedPercent));
  return {
    used,
    max: limit,
    remaining,
    used_percent: usedPercent,
    left_percent: leftPercent
  };
}

export function buildCreditsEnvelope(
  usageRow: { used: number; limit: number },
  dailyLimit: number,
  options: { estimatedInputTokens?: number | null } = {}
) {
  const credits = toCreditsView(usageRow);
  const used = credits.used;
  const limit = credits.max;
  const remainingBudget = Math.max(0, limit - used);

  let plannedBillEstimate: number | null = null;
  let canRunEstimatedPrompt: boolean | null = null;
  const est = options.estimatedInputTokens;
  if (est != null && Number.isFinite(est) && est >= 0) {
    plannedBillEstimate = conservativeBillFromEstimatedInput(est, dailyLimit);
    if (est > CREDIT_MAX_ESTIMATED_INPUT_TOKENS) {
      canRunEstimatedPrompt = false;
    } else {
      // Soft pre-check: allow run while still under daily cap.
      canRunEstimatedPrompt = used < limit;
    }
  }

  return {
    ...credits,
    remaining: remainingBudget,
    hard_exhausted: used >= limit,
    planned_bill_estimate: plannedBillEstimate,
    can_run_estimated_prompt: canRunEstimatedPrompt
  };
}

export function getUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getRecentDays(days: number) {
  const count = Math.max(1, Math.floor(days));
  return Array.from({ length: count }, (_, idx) => getDateDaysAgo(count - idx - 1));
}

export type TierTokenLimits = {
  free: number;
  pro: number;
  student: number;
  enterprise: number;
  globalCap: number | null;
};

let tierLimitsCache: { at: number; limits: TierTokenLimits } | null = null;

function invalidateTierLimitsCache() {
  tierLimitsCache = null;
}

export async function loadTierTokenLimits(): Promise<TierTokenLimits> {
  const now = Date.now();
  if (tierLimitsCache && now - tierLimitsCache.at < TIER_LIMITS_CACHE_MS) {
    return tierLimitsCache.limits;
  }
  const snap = await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(TIER_LIMITS_DOC_ID)
    .get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  const free = Math.max(
    1,
    Math.floor(
      Number(raw.freeDailyTokenLimit ?? raw.free_daily_token_limit ?? DAILY_API_TOKEN_LIMIT_DEFAULT) ||
        DAILY_API_TOKEN_LIMIT_DEFAULT
    )
  );
  const pro = Math.max(
    1,
    Math.floor(
      Number(raw.proDailyTokenLimit ?? raw.pro_daily_token_limit ?? DEFAULT_PRO_DAILY_TOKEN_LIMIT) ||
        DEFAULT_PRO_DAILY_TOKEN_LIMIT
    )
  );
  const student = Math.max(
    1,
    Math.floor(
      Number(raw.studentDailyTokenLimit ?? raw.student_daily_token_limit ?? pro) || pro
    )
  );
  const enterprise = Math.max(
    1,
    Math.floor(
      Number(raw.enterpriseDailyTokenLimit ?? raw.enterprise_daily_token_limit ?? pro) || pro
    )
  );
  const globalRaw = raw.globalDailyTokenLimit ?? raw.global_daily_token_limit;
  const globalCap =
    typeof globalRaw === "number" && Number.isFinite(globalRaw) && globalRaw >= 1
      ? Math.max(1, Math.min(Math.floor(globalRaw), ADMIN_DAILY_TOKEN_LIMIT_MAX))
      : null;
  const limits = { free, pro, student, enterprise, globalCap };
  tierLimitsCache = { at: now, limits };
  return limits;
}

export function billingTierFromUserDoc(raw: Record<string, unknown>): "free" | "pro" | "student" | "enterprise" {
  const t = String(raw.subscriptionTier || raw.plan || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (t === "enterprise") return "enterprise";
  if (t === "student") return "student";
  if (t === "pro" || t === "promptly_pro" || t === "plus" || t === "professional") return "pro";
  return "free";
}

export function effectiveDailyTokenLimitFromUserData(raw: Record<string, unknown>, limits: TierTokenLimits): number {
  const o = raw.dailyTokenLimitOverride;
  if (typeof o === "number" && Number.isFinite(o) && o >= 1) {
    const overrideCapped = Math.min(Math.max(1, Math.floor(o)), ADMIN_DAILY_TOKEN_LIMIT_MAX);
    return limits.globalCap != null ? Math.min(overrideCapped, limits.globalCap) : overrideCapped;
  }
  const tier = billingTierFromUserDoc(raw);
  const v =
    tier === "enterprise"
      ? limits.enterprise
      : tier === "student"
        ? limits.student
        : tier === "pro"
          ? limits.pro
          : limits.free;
  const tierCap = Math.max(1, Math.floor(v));
  return limits.globalCap != null ? Math.min(tierCap, limits.globalCap) : tierCap;
}

/** After Stripe updates `subscriptionTier`, refresh `dailyTokenLimit` on the user doc. */
export async function applyBillingDerivedDailyTokenLimit(uid: string): Promise<void> {
  const db = getFirebaseAdminDb();
  const ref = db.collection(USER_COLLECTION).doc(uid);
  const snap = await ref.get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  const limits = await loadTierTokenLimits();
  const effective = effectiveDailyTokenLimitFromUserData(raw, limits);
  await ref.set(
    { dailyTokenLimit: effective, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

function getOpenAiApiKey() {
  return required("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
}

async function validateOpenAiModelExists(model: string): Promise<void> {
  const m = String(model || "").trim();
  if (!m) {
    throw new Error("Model id is empty");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 12000);
  try {
    const isGpt5Family = usesResponsesApi(m);
    const url = isGpt5Family ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";
    const body = isGpt5Family
      ? {
          model: m,
          input: [{ role: "user", content: [{ type: "input_text", text: "ping" }] }],
          max_output_tokens: 16,
          stream: false,
          store: false
        }
      : {
          model: m,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false
        };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiApiKey()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errObj = raw.error as { message?: string } | undefined;
      const message = String(errObj?.message || `Provider error (${response.status})`);
      throw new Error(`Model "${m}" failed validation: ${message}`);
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Model "${m}" validation timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
}

function getOpenAiModelForRequest(requestMode: string, rewriteMode: "AUTO" | "MANUAL") {
  const shared = getOpenAiModel();
  if (requestMode === "create") {
    return (
      String(process.env.OPENAI_MODEL_CREATE || process.env.OPENAI_MODEL_GENERATE || "").trim() ||
      DEFAULT_OPENAI_CREATE_MODEL ||
      shared
    );
  }
  if (rewriteMode === "MANUAL") {
    return (
      String(process.env.OPENAI_MODEL_MANUAL || process.env.OPENAI_MODEL_REWRITE || "").trim() ||
      DEFAULT_OPENAI_REWRITE_MODEL ||
      shared
    );
  }
  return (
    String(process.env.OPENAI_MODEL_AUTO || process.env.OPENAI_MODEL_REWRITE || "").trim() ||
    DEFAULT_OPENAI_REWRITE_MODEL ||
    shared
  );
}

function getRewriteTimeoutMs() {
  return Math.max(8000, Math.min(60000, Number(process.env.OPENAI_REWRITE_TIMEOUT_MS || 20000)));
}

function getGenerateTimeoutMs() {
  return Math.max(12000, Math.min(90000, Number(process.env.OPENAI_CREATE_TIMEOUT_MS || 45000)));
}

function isProviderTimeoutError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "");
  return /timed out|timeout/i.test(message);
}

function isProviderNoContentError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "");
  return /provider returned no content/i.test(message);
}

function getRewriteFallbackModel(primaryModel: string, configuredFallback?: string) {
  const configured =
    String(configuredFallback || "").trim() ||
    String(process.env.OPENAI_MODEL_REWRITE_FALLBACK || process.env.OPENAI_MODEL_FALLBACK || "").trim() ||
    "gpt-4.1-mini";
  if (!configured) {
    return "";
  }
  return configured === primaryModel ? "" : configured;
}

function getCreateFallbackModel(primaryModel: string, configuredFallback?: string) {
  const configured =
    String(configuredFallback || "").trim() ||
    String(process.env.OPENAI_MODEL_CREATE_FALLBACK || process.env.OPENAI_MODEL_FALLBACK || "").trim() ||
    "gpt-4.1-mini";
  if (!configured) {
    return "";
  }
  return configured === primaryModel ? "" : configured;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getMaxCompletionTokens(
  requestMode: string,
  rewriteMode: "AUTO" | "MANUAL",
  controls?: Pick<
    PromptEngineeringRuntimeControls,
    "rewrite_max_completion_tokens" | "create_max_completion_tokens" | "rewrite_auto_hard_cap_tokens"
  >
) {
  const rewriteMax = normalizeRuntimeControl(controls?.rewrite_max_completion_tokens, 1200, 180, 20000);
  const rewriteAutoCap = normalizeRuntimeControl(controls?.rewrite_auto_hard_cap_tokens, 650, 180, 20000);
  const createMax = normalizeRuntimeControl(controls?.create_max_completion_tokens, 2800, 500, 20000);
  if (requestMode === "create") {
    return createMax;
  }
  if (rewriteMode === "MANUAL") {
    return rewriteMax;
  }
  return rewriteAutoCap;
}

function getExtensionBaseUrl() {
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://promptly-labs.com").replace(
    /\/$/,
    ""
  );
}

function readFirebaseToken(request: Request) {
  const headerToken = String(request.headers.get("x-promptly-firebase-token") || "").trim();
  if (headerToken) {
    return headerToken;
  }
  const authHeader = String(request.headers.get("Authorization") || "").trim();
  if (!authHeader) {
    return "";
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return "";
  }
  return token.trim();
}

function readGoogleAccessToken(request: Request) {
  return String(request.headers.get("x-promptly-google-access-token") || "").trim();
}

function readUserEmailHeader(request: Request) {
  return normalizeUserEmail(request.headers.get("x-promptly-user-email")) || "";
}

export function buildPromptlyCorsHeaders(origin?: string | null) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function handlePromptlyPreflight(request: Request) {
  const origin = request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...buildPromptlyCorsHeaders(origin),
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,x-promptly-client,x-promptly-firebase-token,x-promptly-google-access-token,x-promptly-user-email,x-promptly-estimate-prompt-length,x-promptly-estimate-instruction-length,x-promptly-live-config,Authorization"
    }
  });
}

function normalizeUserEmail(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function firestoreMillis(value: unknown): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === "function") {
    try {
      return maybe.toDate().getTime();
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function pickCanonicalUserIdForEmail(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  preferredUid: string | null,
  indexedUid: string | null
): string | null {
  if (preferredUid && docs.some((doc) => doc.id === preferredUid)) {
    return preferredUid;
  }
  if (indexedUid && docs.some((doc) => doc.id === indexedUid)) {
    return indexedUid;
  }
  if (!docs.length) {
    return preferredUid || indexedUid || null;
  }
  const withOrder = [...docs].sort((a, b) => {
    const byCreated = firestoreMillis(a.data.createdAt) - firestoreMillis(b.data.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }
    return a.id.localeCompare(b.id);
  });
  return withOrder[0]?.id || null;
}

async function mergeDuplicateUsageIntoCanonical(canonicalUid: string, duplicateUid: string) {
  const db = getFirebaseAdminDb();
  const duplicateUsageSnap = await db.collection(DAILY_USAGE_COLLECTION).where("uid", "==", duplicateUid).get();
  for (const usageDoc of duplicateUsageSnap.docs) {
    const raw = (usageDoc.data() || {}) as Record<string, unknown>;
    const day = String(raw.day || "").trim() || String(usageDoc.id.split("_").slice(1).join("_") || "").trim();
    if (!day) {
      continue;
    }
    const canonicalUsageRef = db.collection(DAILY_USAGE_COLLECTION).doc(`${canonicalUid}_${day}`);
    await db.runTransaction(async (tx) => {
      const canonicalSnap = await tx.get(canonicalUsageRef);
      const existing = (canonicalSnap.data() || {}) as Record<string, unknown>;
      const merged = {
        uid: canonicalUid,
        day,
        email: normalizeUserEmail(existing.email) || normalizeUserEmail(raw.email),
        used: Math.max(0, Math.floor(Number(existing.used || 0) || 0)) + Math.max(0, Math.floor(Number(raw.used || 0) || 0)),
        promptsImproved:
          Math.max(0, Math.floor(Number(existing.promptsImproved || 0) || 0)) +
          Math.max(0, Math.floor(Number(raw.promptsImproved || 0) || 0)),
        auto: Math.max(0, Math.floor(Number(existing.auto || 0) || 0)) + Math.max(0, Math.floor(Number(raw.auto || 0) || 0)),
        manual:
          Math.max(0, Math.floor(Number(existing.manual || 0) || 0)) +
          Math.max(0, Math.floor(Number(raw.manual || 0) || 0)),
        generated:
          Math.max(0, Math.floor(Number(existing.generated || 0) || 0)) +
          Math.max(0, Math.floor(Number(raw.generated || 0) || 0)),
        limit: Math.max(1, Math.floor(Number(existing.limit || 0) || 0), Math.floor(Number(raw.limit || 0) || 0)),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: canonicalSnap.exists ? existing.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
      };
      tx.set(canonicalUsageRef, merged, { merge: true });
      tx.delete(usageDoc.ref);
    });
  }
}

async function consolidateUsersByEmail(email: string, canonicalUid: string) {
  const db = getFirebaseAdminDb();
  const usersSnap = await db.collection(USER_COLLECTION).where("email", "==", email).get();
  const docs = usersSnap.docs.map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }));
  const canonical = docs.find((doc) => doc.id === canonicalUid);
  if (!canonical) {
    return;
  }
  const duplicates = docs.filter((doc) => doc.id !== canonicalUid);
  if (!duplicates.length) {
    return;
  }

  for (const dup of duplicates) {
    const canonicalRef = db.collection(USER_COLLECTION).doc(canonicalUid);
    const duplicateRef = db.collection(USER_COLLECTION).doc(dup.id);
    await db.runTransaction(async (tx) => {
      const [canonicalSnap, duplicateSnap] = await Promise.all([tx.get(canonicalRef), tx.get(duplicateRef)]);
      if (!duplicateSnap.exists) {
        return;
      }
      const canonicalRaw = (canonicalSnap.data() || {}) as Record<string, unknown>;
      const duplicateRaw = (duplicateSnap.data() || {}) as Record<string, unknown>;
      const mergedPrompts =
        Math.max(0, Math.floor(Number(canonicalRaw.promptsImprovedTotal || 0) || 0)) +
        Math.max(0, Math.floor(Number(duplicateRaw.promptsImprovedTotal || 0) || 0));
      const mergedAllTimeMax = Math.max(
        Math.max(0, Math.floor(Number(canonicalRaw.allTimeMaxDailyTokenUsage || 0) || 0)),
        Math.max(0, Math.floor(Number(duplicateRaw.allTimeMaxDailyTokenUsage || 0) || 0))
      );
      const nextPatch: Record<string, unknown> = {
        promptsImprovedTotal: mergedPrompts,
        allTimeMaxDailyTokenUsage: mergedAllTimeMax,
        updatedAt: FieldValue.serverTimestamp()
      };
      const canonicalTier = billingTierFromUserDoc(canonicalRaw);
      const duplicateTier = billingTierFromUserDoc(duplicateRaw);
      const tierRank = { free: 0, student: 1, pro: 2, enterprise: 3 } as const;
      if (tierRank[duplicateTier] > tierRank[canonicalTier]) {
        nextPatch.subscriptionTier = duplicateTier;
      }
      if (!canonicalRaw.dailyTokenLimitOverride && duplicateRaw.dailyTokenLimitOverride) {
        nextPatch.dailyTokenLimitOverride = duplicateRaw.dailyTokenLimitOverride;
      }
      if (!canonicalRaw.stripeCustomerId && duplicateRaw.stripeCustomerId) {
        nextPatch.stripeCustomerId = duplicateRaw.stripeCustomerId;
      }
      if (!canonicalRaw.stripeSubscriptionId && duplicateRaw.stripeSubscriptionId) {
        nextPatch.stripeSubscriptionId = duplicateRaw.stripeSubscriptionId;
      }
      tx.set(canonicalRef, nextPatch, { merge: true });
      tx.set(
        duplicateRef,
        {
          email: null,
          previousEmail: email,
          mergedIntoUid: canonicalUid,
          duplicateDisabled: true,
          mergedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });
    await mergeDuplicateUsageIntoCanonical(canonicalUid, dup.id);
  }

  const canonicalAfter = ((await db.collection(USER_COLLECTION).doc(canonicalUid).get()).data() || {}) as Record<string, unknown>;
  const limits = await loadTierTokenLimits();
  const effective = effectiveDailyTokenLimitFromUserData(canonicalAfter, limits);
  await db.collection(USER_COLLECTION).doc(canonicalUid).set(
    { dailyTokenLimit: effective, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function resolveCanonicalUidForEmail(email: string, preferredUid: string | null): Promise<string> {
  const normalizedEmail = normalizeUserEmail(email);
  if (!normalizedEmail) {
    if (preferredUid) {
      return preferredUid;
    }
    throw new Error("Missing email for canonical user mapping");
  }
  const db = getFirebaseAdminDb();
  const emailIndexRef = db.collection(USER_EMAIL_INDEX_COLLECTION).doc(normalizedEmail);
  const [indexSnap, usersSnap] = await Promise.all([
    emailIndexRef.get(),
    db.collection(USER_COLLECTION).where("email", "==", normalizedEmail).get()
  ]);
  const indexedUidRaw = (indexSnap.data()?.uid as string | undefined) || null;
  const docs = usersSnap.docs.map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }));
  const canonicalUid = pickCanonicalUserIdForEmail(docs, preferredUid, indexedUidRaw);
  if (!canonicalUid) {
    return preferredUid || `google_${normalizedEmail.replace(/[^a-z0-9]+/gi, "_")}`;
  }
  await emailIndexRef.set(
    {
      email: normalizedEmail,
      uid: canonicalUid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  if (docs.length > 1) {
    await consolidateUsersByEmail(normalizedEmail, canonicalUid);
  }
  return canonicalUid;
}

async function upsertPromptlyUser(userId: string, email: string | null, patch: Record<string, unknown> = {}) {
  const normalizedEmail = normalizeUserEmail(email);
  const db = getFirebaseAdminDb();
  const userRef = db.collection(USER_COLLECTION).doc(userId);
  const snap = await userRef.get();
  const existing = (snap.data() || {}) as Record<string, unknown>;
  const mergedForLimit = { ...existing, ...patch };
  const limits = await loadTierTokenLimits();
  const dailyTokenLimit = effectiveDailyTokenLimitFromUserData(mergedForLimit, limits);
  const promptlyUser: PromptlyUser = {
    uid: userId,
    email: normalizedEmail,
    plan: String(existing.plan || "free"),
    dailyTokenLimit,
    promptsImprovedTotal: Math.max(0, Math.floor(Number(existing.promptsImprovedTotal || 0) || 0)),
    allTimeMaxDailyTokenUsage: Math.max(0, Math.floor(Number(existing.allTimeMaxDailyTokenUsage || 0) || 0))
  };

  await userRef.set(
    {
      uid: promptlyUser.uid,
      email: promptlyUser.email,
      plan: promptlyUser.plan,
      dailyTokenLimit: promptlyUser.dailyTokenLimit,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: snap.exists ? existing.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      ...patch
    },
    { merge: true }
  );

  return promptlyUser;
}

async function resolvePromptlyUserFromGoogleAccessToken(request: Request) {
  const accessToken = readGoogleAccessToken(request);
  if (!accessToken) {
    return null;
  }
  const cached = googleAccessTokenCache.get(accessToken);
  const hintedEmail = normalizeUserEmail(readUserEmailHeader(request));
  if (cached && cached.expiresAt > Date.now()) {
    if (hintedEmail && cached.email && hintedEmail !== cached.email) {
      throw new Error("Google account email does not match signed-in Chrome Gmail");
    }
    if (cached.email) {
      const canonicalUid = await resolveCanonicalUidForEmail(cached.email, `google_${cached.sub}`);
      return upsertPromptlyUser(canonicalUid, cached.email, {
        googleSub: cached.sub,
        provider: "google-extension"
      });
    }
    return upsertPromptlyUser(`google_${cached.sub}`, cached.email, {
      googleSub: cached.sub,
      provider: "google-extension"
    });
  }
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body?.error_description || body?.error || "Invalid Google access token"));
  }
  const email = normalizeUserEmail(body.email);
  const sub = String(body.sub || "").trim();
  if (!sub) {
    throw new Error("Google user info missing subject");
  }
  if (hintedEmail && email && hintedEmail !== email) {
    throw new Error("Google account email does not match signed-in Chrome Gmail");
  }
  googleAccessTokenCache.set(accessToken, {
    expiresAt: Date.now() + GOOGLE_ACCESS_TOKEN_CACHE_TTL_MS,
    email,
    sub
  });

  if (email) {
    const canonicalUid = await resolveCanonicalUidForEmail(email, `google_${sub}`);
    return upsertPromptlyUser(canonicalUid, email, {
      googleSub: sub,
      provider: "google-extension"
    });
  }

  return upsertPromptlyUser(`google_${sub}`, email, {
    googleSub: sub,
    provider: "google-extension"
  });
}

export async function requirePromptlyUser(request: Request): Promise<{
  ok: true;
  user: PromptlyUser;
}> {
  const clientHeader = request.headers.get("x-promptly-client");
  if (clientHeader !== REQUIRED_CLIENT_HEADER) {
    throw new Error("Missing or invalid x-promptly-client header");
  }

  const rawToken = readFirebaseToken(request);
  if (rawToken) {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(rawToken);
    const email = normalizeUserEmail(decoded.email);
    const canonicalUid = email ? await resolveCanonicalUidForEmail(email, decoded.uid) : decoded.uid;
    const user = await upsertPromptlyUser(canonicalUid, email, {
      provider: "firebase"
    });
    return { ok: true, user };
  }

  const googleUser = await resolvePromptlyUserFromGoogleAccessToken(request);
  if (googleUser) {
    return { ok: true, user: googleUser };
  }

  throw new Error("Missing Firebase auth token");
}

/** Website-only routes (/account, billing): Firebase ID token in Authorization or x-promptly-firebase-token. */
export async function requireWebFirebaseUser(request: Request): Promise<{
  ok: true;
  user: PromptlyUser;
}> {
  const rawToken = readFirebaseToken(request);
  if (!rawToken) {
    throw new Error("Missing Firebase auth token");
  }
  const decoded = await getFirebaseAdminAuth().verifyIdToken(rawToken);
  const email = normalizeUserEmail(decoded.email);
  const canonicalUid = email ? await resolveCanonicalUidForEmail(email, decoded.uid) : decoded.uid;
  const promptlyUser = await upsertPromptlyUser(canonicalUid, email, {
    provider: "firebase"
  });
  return { ok: true, user: promptlyUser };
}

async function getDailyUsage(uid: string, day: string, limit: number): Promise<DailyUsage> {
  const snap = await getFirebaseAdminDb().collection(DAILY_USAGE_COLLECTION).doc(`${uid}_${day}`).get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  return {
    uid,
    day,
    email: typeof raw.email === "string" ? raw.email : null,
    used: Math.max(0, Math.floor(Number(raw.used || 0) || 0)),
    promptsImproved: Math.max(0, Math.floor(Number(raw.promptsImproved || 0) || 0)),
    auto: Math.max(0, Math.floor(Number(raw.auto || 0) || 0)),
    manual: Math.max(0, Math.floor(Number(raw.manual || 0) || 0)),
    generated: Math.max(0, Math.floor(Number(raw.generated || 0) || 0)),
    limit
  };
}

function normalizePlainRewriteOutput(rawText: string, fallbackPrompt: string) {
  let t = String(rawText || "").trim();
  if (!t) {
    return { optimized_prompt: fallbackPrompt };
  }
  const fence = t.match(/^```(?:\w+)?\s*([\s\S]*?)```\s*$/);
  if (fence) {
    t = fence[1].trim();
  }
  return { optimized_prompt: t.slice(0, 100_000) };
}

export type PromptEngineeringTemplates = {
  rewrite_auto_template: string;
  rewrite_manual_template: string;
  compose_template: string;
};

export type PromptEngineeringRuntimeControls = {
  rewrite_timeout_ms: number;
  create_timeout_ms: number;
  rewrite_max_completion_tokens: number;
  rewrite_auto_hard_cap_tokens: number;
  create_max_completion_tokens: number;
  create_continuation_max_rounds: number;
  create_template_max_chars: number;
  create_user_slot_max_chars: number;
};

export type PromptEngineeringModelControls = {
  rewrite_auto_model: string;
  rewrite_manual_model: string;
  create_model: string;
  rewrite_fallback_model: string;
  create_fallback_model: string;
};

type PromptEngineeringConfig = PromptEngineeringTemplates &
  PromptEngineeringRuntimeControls &
  PromptEngineeringModelControls;

let promptEngineeringCache: { at: number; config: PromptEngineeringConfig } | null = null;

function invalidatePromptEngineeringCache() {
  promptEngineeringCache = null;
}

function getDefaultPromptEngineeringRuntimeControls(): PromptEngineeringRuntimeControls {
  return {
    rewrite_timeout_ms: getRewriteTimeoutMs(),
    create_timeout_ms: getGenerateTimeoutMs(),
    rewrite_max_completion_tokens: 1200,
    rewrite_auto_hard_cap_tokens: 650,
    create_max_completion_tokens: 2800,
    create_continuation_max_rounds: CREATE_CONTINUATION_MAX_ROUNDS,
    create_template_max_chars: FAST_CREATE_TEMPLATE_MAX_CHARS,
    create_user_slot_max_chars: FAST_CREATE_USER_SLOT_MAX_CHARS
  };
}

function getDefaultPromptEngineeringModelControls(): PromptEngineeringModelControls {
  const rewriteDefault = getOpenAiModelForRequest("rewrite", "AUTO");
  const createDefault = getOpenAiModelForRequest("create", "MANUAL");
  return {
    rewrite_auto_model: rewriteDefault,
    rewrite_manual_model: getOpenAiModelForRequest("rewrite", "MANUAL"),
    create_model: createDefault,
    rewrite_fallback_model: getRewriteFallbackModel(rewriteDefault),
    create_fallback_model: getCreateFallbackModel(createDefault)
  };
}

function normalizeModelControl(raw: unknown, fallback: string): string {
  const value = String(raw || "").trim();
  if (!value) {
    return fallback;
  }
  if (!/^[A-Za-z0-9._:-]{2,120}$/.test(value)) {
    return fallback;
  }
  return value;
}

function normalizeRuntimeControl(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getDefaultPromptEngineeringTemplates(): PromptEngineeringTemplates {
  const tok = PROMPTLY_USER_CONTENT_TOKEN;
  return {
    rewrite_auto_template: `Improve this user prompt for use with a large language model. Reply with ONLY the improved prompt text—no title, preamble, or markdown code fences.

${tok}

Keep the same goals and tone. Make it clearer and better structured. Do not answer the prompt.`,
    rewrite_manual_template: `Expand and strengthen this user prompt into a high-quality LLM instruction. Reply with ONLY the final prompt text—no title, preamble, or markdown code fences.

${tok}

Preserve the user's intent. Add useful structure (objective, context, constraints, output format) where it helps. Be substantially more detailed than the original. Do not answer the prompt.`,
    compose_template: `From this short description, output ONE complete prompt the user can paste into an LLM. Reply with ONLY that prompt as plain text—no preamble—or valid JSON {"prompt":"..."} if you must use JSON.

${tok}

Match the user's goal. Be specific and actionable. Keep the final prompt concise but complete (target ~220-600 words, hard max 900 words). Do not chat; output only the constructed prompt.`
  };
}

async function loadPromptEngineeringConfig(options: { forceRefresh?: boolean } = {}): Promise<PromptEngineeringConfig> {
  const now = Date.now();
  if (!options.forceRefresh && promptEngineeringCache && now - promptEngineeringCache.at < PROMPT_ENGINEERING_CACHE_MS) {
    return promptEngineeringCache.config;
  }
  const snap = await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(PROMPT_ENGINEERING_DOC_ID)
    .get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  const defaults = getDefaultPromptEngineeringTemplates();
  const pick = (key: keyof PromptEngineeringTemplates) => {
    const v = raw[key];
    return typeof v === "string" && v.trim().length > 0 ? v : defaults[key];
  };
  const templates: PromptEngineeringTemplates = {
    rewrite_auto_template: pick("rewrite_auto_template"),
    rewrite_manual_template: pick("rewrite_manual_template"),
    compose_template: pick("compose_template")
  };
  const defaultsRuntime = getDefaultPromptEngineeringRuntimeControls();
  const defaultsModels = getDefaultPromptEngineeringModelControls();
  const runtime: PromptEngineeringRuntimeControls = {
    rewrite_timeout_ms: normalizeRuntimeControl(
      raw.rewrite_timeout_ms,
      defaultsRuntime.rewrite_timeout_ms,
      8000,
      120000
    ),
    create_timeout_ms: normalizeRuntimeControl(
      raw.create_timeout_ms,
      defaultsRuntime.create_timeout_ms,
      10000,
      180000
    ),
    rewrite_max_completion_tokens: normalizeRuntimeControl(
      raw.rewrite_max_completion_tokens,
      defaultsRuntime.rewrite_max_completion_tokens,
      180,
      20000
    ),
    rewrite_auto_hard_cap_tokens: normalizeRuntimeControl(
      raw.rewrite_auto_hard_cap_tokens,
      defaultsRuntime.rewrite_auto_hard_cap_tokens,
      180,
      20000
    ),
    create_max_completion_tokens: normalizeRuntimeControl(
      raw.create_max_completion_tokens,
      defaultsRuntime.create_max_completion_tokens,
      500,
      20000
    ),
    create_continuation_max_rounds: normalizeRuntimeControl(
      raw.create_continuation_max_rounds,
      defaultsRuntime.create_continuation_max_rounds,
      1,
      6
    ),
    create_template_max_chars: normalizeRuntimeControl(
      raw.create_template_max_chars,
      defaultsRuntime.create_template_max_chars,
      800,
      24000
    ),
    create_user_slot_max_chars: normalizeRuntimeControl(
      raw.create_user_slot_max_chars,
      defaultsRuntime.create_user_slot_max_chars,
      400,
      12000
    )
  };
  const models: PromptEngineeringModelControls = {
    rewrite_auto_model: normalizeModelControl(raw.rewrite_auto_model, defaultsModels.rewrite_auto_model),
    rewrite_manual_model: normalizeModelControl(raw.rewrite_manual_model, defaultsModels.rewrite_manual_model),
    create_model: normalizeModelControl(raw.create_model, defaultsModels.create_model),
    rewrite_fallback_model: normalizeModelControl(raw.rewrite_fallback_model, defaultsModels.rewrite_fallback_model),
    create_fallback_model: normalizeModelControl(raw.create_fallback_model, defaultsModels.create_fallback_model)
  };
  const config: PromptEngineeringConfig = { ...templates, ...runtime, ...models };
  promptEngineeringCache = { at: now, config };
  return config;
}

function applyPromptTemplate(template: string, userContent: string) {
  const t = String(template || "").trim();
  if (!t.includes(PROMPTLY_USER_CONTENT_TOKEN)) {
    throw new Error(
      `Prompt engineering template must include the token ${PROMPTLY_USER_CONTENT_TOKEN} exactly as shown (you may place it anywhere).`
    );
  }
  return t.split(PROMPTLY_USER_CONTENT_TOKEN).join(userContent);
}

function validateTemplateLengths(templates: PromptEngineeringTemplates) {
  for (const [key, value] of Object.entries(templates)) {
    const len = String(value || "").length;
    if (len > PROMPT_TEMPLATE_MAX_CHARS) {
      throw new Error(`${key} exceeds ${PROMPT_TEMPLATE_MAX_CHARS.toLocaleString()} characters`);
    }
    if (!String(value || "").includes(PROMPTLY_USER_CONTENT_TOKEN)) {
      throw new Error(`${key} must include ${PROMPTLY_USER_CONTENT_TOKEN}`);
    }
  }
}

export async function adminGetPromptEngineering(): Promise<
  { ok: true; user_content_token: string } & PromptEngineeringTemplates & PromptEngineeringRuntimeControls & PromptEngineeringModelControls
> {
  const snap = await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(PROMPT_ENGINEERING_DOC_ID)
    .get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  const defaults = getDefaultPromptEngineeringTemplates();
  const defaultsRuntime = getDefaultPromptEngineeringRuntimeControls();
  const defaultsModels = getDefaultPromptEngineeringModelControls();
  const coalesce = (key: keyof PromptEngineeringTemplates) =>
    typeof raw[key] === "string" && raw[key].trim().length > 0 ? String(raw[key]) : defaults[key];

  return {
    ok: true,
    user_content_token: PROMPTLY_USER_CONTENT_TOKEN,
    rewrite_auto_template: coalesce("rewrite_auto_template"),
    rewrite_manual_template: coalesce("rewrite_manual_template"),
    compose_template: coalesce("compose_template"),
    rewrite_timeout_ms: normalizeRuntimeControl(
      raw.rewrite_timeout_ms,
      defaultsRuntime.rewrite_timeout_ms,
      8000,
      120000
    ),
    create_timeout_ms: normalizeRuntimeControl(
      raw.create_timeout_ms,
      defaultsRuntime.create_timeout_ms,
      10000,
      180000
    ),
    rewrite_max_completion_tokens: normalizeRuntimeControl(
      raw.rewrite_max_completion_tokens,
      defaultsRuntime.rewrite_max_completion_tokens,
      180,
      20000
    ),
    rewrite_auto_hard_cap_tokens: normalizeRuntimeControl(
      raw.rewrite_auto_hard_cap_tokens,
      defaultsRuntime.rewrite_auto_hard_cap_tokens,
      180,
      20000
    ),
    create_max_completion_tokens: normalizeRuntimeControl(
      raw.create_max_completion_tokens,
      defaultsRuntime.create_max_completion_tokens,
      500,
      20000
    ),
    create_continuation_max_rounds: normalizeRuntimeControl(
      raw.create_continuation_max_rounds,
      defaultsRuntime.create_continuation_max_rounds,
      1,
      6
    ),
    create_template_max_chars: normalizeRuntimeControl(
      raw.create_template_max_chars,
      defaultsRuntime.create_template_max_chars,
      800,
      24000
    ),
    create_user_slot_max_chars: normalizeRuntimeControl(
      raw.create_user_slot_max_chars,
      defaultsRuntime.create_user_slot_max_chars,
      400,
      12000
    ),
    rewrite_auto_model: normalizeModelControl(raw.rewrite_auto_model, defaultsModels.rewrite_auto_model),
    rewrite_manual_model: normalizeModelControl(raw.rewrite_manual_model, defaultsModels.rewrite_manual_model),
    create_model: normalizeModelControl(raw.create_model, defaultsModels.create_model),
    rewrite_fallback_model: normalizeModelControl(raw.rewrite_fallback_model, defaultsModels.rewrite_fallback_model),
    create_fallback_model: normalizeModelControl(raw.create_fallback_model, defaultsModels.create_fallback_model)
  };
}

export async function adminSavePromptEngineering(
  patch: Partial<PromptEngineeringTemplates & PromptEngineeringRuntimeControls & PromptEngineeringModelControls>
) {
  const current = await adminGetPromptEngineering();
  const next: PromptEngineeringTemplates = {
    rewrite_auto_template:
      typeof patch.rewrite_auto_template === "string"
        ? patch.rewrite_auto_template
        : current.rewrite_auto_template,
    rewrite_manual_template:
      typeof patch.rewrite_manual_template === "string"
        ? patch.rewrite_manual_template
        : current.rewrite_manual_template,
    compose_template:
      typeof patch.compose_template === "string" ? patch.compose_template : current.compose_template
  };
  validateTemplateLengths(next);
  const nextRuntime: PromptEngineeringRuntimeControls = {
    rewrite_timeout_ms: normalizeRuntimeControl(
      patch.rewrite_timeout_ms,
      current.rewrite_timeout_ms,
      8000,
      120000
    ),
    create_timeout_ms: normalizeRuntimeControl(
      patch.create_timeout_ms,
      current.create_timeout_ms,
      10000,
      180000
    ),
    rewrite_max_completion_tokens: normalizeRuntimeControl(
      patch.rewrite_max_completion_tokens,
      current.rewrite_max_completion_tokens,
      180,
      20000
    ),
    rewrite_auto_hard_cap_tokens: normalizeRuntimeControl(
      patch.rewrite_auto_hard_cap_tokens,
      current.rewrite_auto_hard_cap_tokens,
      180,
      20000
    ),
    create_max_completion_tokens: normalizeRuntimeControl(
      patch.create_max_completion_tokens,
      current.create_max_completion_tokens,
      500,
      20000
    ),
    create_continuation_max_rounds: normalizeRuntimeControl(
      patch.create_continuation_max_rounds,
      current.create_continuation_max_rounds,
      1,
      6
    ),
    create_template_max_chars: normalizeRuntimeControl(
      patch.create_template_max_chars,
      current.create_template_max_chars,
      800,
      24000
    ),
    create_user_slot_max_chars: normalizeRuntimeControl(
      patch.create_user_slot_max_chars,
      current.create_user_slot_max_chars,
      400,
      12000
    )
  };
  const nextModels: PromptEngineeringModelControls = {
    rewrite_auto_model: normalizeModelControl(patch.rewrite_auto_model, current.rewrite_auto_model),
    rewrite_manual_model: normalizeModelControl(patch.rewrite_manual_model, current.rewrite_manual_model),
    create_model: normalizeModelControl(patch.create_model, current.create_model),
    rewrite_fallback_model: normalizeModelControl(patch.rewrite_fallback_model, current.rewrite_fallback_model),
    create_fallback_model: normalizeModelControl(patch.create_fallback_model, current.create_fallback_model)
  };
  const modelsToValidate = Array.from(
    new Set(
      [
        nextModels.rewrite_auto_model,
        nextModels.rewrite_manual_model,
        nextModels.create_model,
        nextModels.rewrite_fallback_model,
        nextModels.create_fallback_model
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  for (const model of modelsToValidate) {
    await validateOpenAiModelExists(model);
  }
  await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(PROMPT_ENGINEERING_DOC_ID)
    .set(
      {
        ...next,
        ...nextRuntime,
        ...nextModels,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  invalidatePromptEngineeringCache();
  return { ok: true as const };
}

function usesResponsesApi(model: string) {
  const normalized = String(model || "").trim().toLowerCase();
  return /^gpt-5(\b|-)/.test(normalized);
}

const CREATE_TRUNCATION_CONTINUE_MSG =
  "Your previous output hit the length limit mid-stream. Continue from the very next character. Do not repeat anything you already wrote. No preamble or labels—only the rest of the prompt text.";

const CREATE_CONTINUATION_MAX_ROUNDS = 3;
const REWRITE_TRUNCATION_CONTINUE_MSG =
  "Your previous rewrite output hit the length limit mid-stream. Continue the rewritten prompt from the very next character. Do not repeat anything you already wrote. Return only the remaining rewritten prompt text.";
const REWRITE_CONTINUATION_MAX_ROUNDS = 3;

function isResponsesApiTruncated(body: Record<string, unknown>, requestMode: string): boolean {
  const reason = (body.incomplete_details as { reason?: string } | undefined)?.reason;
  if (reason === "max_output_tokens") {
    return true;
  }
  // Rewrite/improve: only continue on explicit output-token cap; generic "incomplete"
  // often causes a second round that repeats the prior text then appends "continuation".
  if (requestMode === "rewrite") {
    return false;
  }
  return body.status === "incomplete";
}

function mergeTokenUsage(
  a: { total_tokens: number; prompt_tokens: number; completion_tokens: number } | null,
  b: { total_tokens: number; prompt_tokens: number; completion_tokens: number } | null
): { total_tokens: number; prompt_tokens: number; completion_tokens: number } | null {
  if (!a && !b) {
    return null;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return {
    total_tokens: a.total_tokens + b.total_tokens,
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens
  };
}

function usageFromResponsesBody(body: Record<string, unknown>): OptimizerResult["usage"] {
  const u = body.usage as Record<string, unknown> | undefined;
  if (!u) {
    return null;
  }
  return {
    total_tokens: toNumber(u.total_tokens, 0),
    prompt_tokens: toNumber(u.input_tokens ?? u.prompt_tokens, 0),
    completion_tokens: toNumber(u.output_tokens ?? u.completion_tokens, 0)
  };
}

function extractResponsesApiText(body: Record<string, unknown>, options?: { continuationRound?: number }) {
  const round = Math.max(0, Math.floor(Number(options?.continuationRound) || 0));
  const direct = body.output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const output = Array.isArray(body.output) ? body.output : [];
  const messageItems = output.filter(
    (item): item is { type?: string; content?: Array<{ type?: string; text?: string }> } =>
      !!item && typeof item === "object" && (item as { type?: string }).type === "message"
  );
  // Continuation responses may include prior assistant segments; join only the last message
  // so we do not concatenate duplicate full rewrites + tail.
  const itemsToScan =
    round > 0 && messageItems.length > 0 ? [messageItems[messageItems.length - 1]] : output;

  const textParts: string[] = [];
  for (const item of itemsToScan) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const typedItem = item as {
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      summary?: Array<{ text?: string }>;
    };
    if (typedItem.type === "message" && Array.isArray(typedItem.content)) {
      for (const part of typedItem.content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const p = part as { type?: string; text?: string };
        if (typeof p.text === "string" && p.text.length > 0) {
          if (p.type === "output_text" || p.type === "text") {
            textParts.push(p.text);
          }
        }
      }
    }
  }
  return textParts.join("").trim();
}

function extractChatCompletionMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as { refusal?: unknown; content?: unknown };
  if (m.refusal) {
    const refusal = String(m.refusal).trim();
    throw new Error(refusal ? `Model declined: ${refusal.slice(0, 400)}` : "Model declined the request");
  }
  const c = m.content;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c
      .filter((part: { type?: string; text?: string } | null) => part && part.type === "text")
      .map((part: { text?: string }) => String(part.text || ""))
      .join("");
  }
  return "";
}

async function callOpenAi(options: {
  messages: Array<{ role: string; content: string }>;
  model: string;
  timeoutMs: number;
  maxCompletionTokens: number;
  requestMode: string;
  createContinuationMaxRounds?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs);
  const useResponsesApi = usesResponsesApi(options.model);
  const isCreate = options.requestMode === "create";
  const isRewrite = options.requestMode === "rewrite";
  const modeSupportsContinuation = isCreate || isRewrite;
  const continuationPrompt = isCreate ? CREATE_TRUNCATION_CONTINUE_MSG : REWRITE_TRUNCATION_CONTINUE_MSG;
  const url = useResponsesApi ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";

  try {
    const continuationRounds = modeSupportsContinuation
      ? normalizeRuntimeControl(
          isCreate ? options.createContinuationMaxRounds : REWRITE_CONTINUATION_MAX_ROUNDS,
          isCreate ? CREATE_CONTINUATION_MAX_ROUNDS : REWRITE_CONTINUATION_MAX_ROUNDS,
          1,
          6
        )
      : 1;
    if (useResponsesApi) {
      // max_output_tokens counts reasoning + visible text.
      // store:true enables previous_response_id continuation when output hits max_output_tokens.
      const initialInput = options.messages.map((message) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }]
      }));
      const baseResponsesFields: Record<string, unknown> = {
        model: options.model,
        max_output_tokens: options.maxCompletionTokens,
        stream: false,
        text: {
          verbosity: "low"
        }
      };
      if (!isCreate) {
        baseResponsesFields.reasoning = { effort: "minimal" };
        baseResponsesFields.store = modeSupportsContinuation;
      } else {
        // Keep create on primary model more responsive by constraining reasoning work.
        baseResponsesFields.reasoning = { effort: "minimal" };
        baseResponsesFields.store = true;
      }

      let aggregated = "";
      let usage: OptimizerResult["usage"] = null;
      let previousId: string | null = null;

      for (let round = 0; round < continuationRounds; round++) {
        const requestBody: Record<string, unknown> =
          round === 0
            ? { ...baseResponsesFields, input: initialInput }
            : {
                model: options.model,
                previous_response_id: previousId,
                input: [
                  {
                    role: "user",
                    content: [{ type: "input_text", text: continuationPrompt }]
                  }
                ],
                max_output_tokens: options.maxCompletionTokens,
                stream: false,
                text: { verbosity: "low" },
                store: true
              };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getOpenAiApiKey()}`
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          const errObj = body.error as { message?: string } | undefined;
          throw new Error(String(errObj?.message || `Provider error (${response.status})`));
        }

        const piece = extractResponsesApiText(body, { continuationRound: round });
        const roundUsage = usageFromResponsesBody(body);
        usage = mergeTokenUsage(usage, roundUsage);

        if (piece) {
          if (round > 0 && aggregated && piece.startsWith(aggregated)) {
            aggregated = piece;
          } else {
            aggregated += piece;
          }
        }

        const id = typeof body.id === "string" ? body.id : "";
        previousId = id || previousId;

        const truncated = modeSupportsContinuation && isResponsesApiTruncated(body, options.requestMode);
        if (!truncated || !modeSupportsContinuation) {
          break;
        }
        if (!previousId) {
          break;
        }
      }

      if (!aggregated.trim()) {
        throw new Error("Provider returned no content");
      }
      return { rawText: aggregated, usage };
    }

    if (modeSupportsContinuation) {
      let chatMessages: Array<{ role: string; content: string }> = [...options.messages];
      let aggregated = "";
      let usage: OptimizerResult["usage"] = null;

      for (let round = 0; round < continuationRounds; round++) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getOpenAiApiKey()}`
          },
          body: JSON.stringify({
            model: options.model,
            messages: chatMessages,
            max_tokens: options.maxCompletionTokens,
            stream: false
          }),
          signal: controller.signal
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(body?.error?.message || `Provider error (${response.status})`));
        }
        const choice = body?.choices?.[0];
        const piece = extractChatCompletionMessageText(choice?.message);
        const u = body?.usage
          ? {
              total_tokens: toNumber(body.usage.total_tokens, 0),
              prompt_tokens: toNumber(body.usage.prompt_tokens, 0),
              completion_tokens: toNumber(body.usage.completion_tokens, 0)
            }
          : null;
        usage = mergeTokenUsage(usage, u);
        aggregated += piece;
        const finishReason = String(choice?.finish_reason || "");
        if (finishReason !== "length") {
          break;
        }
        chatMessages = [
          ...chatMessages,
          { role: "assistant", content: piece },
          { role: "user", content: continuationPrompt }
        ];
      }

      if (!aggregated.trim()) {
        throw new Error("Provider returned no content");
      }
      return { rawText: aggregated, usage };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiApiKey()}`
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxCompletionTokens,
        stream: false
      }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(body?.error?.message || `Provider error (${response.status})`));
    }
    const content = extractChatCompletionMessageText(body?.choices?.[0]?.message);
    const usage = body?.usage
      ? {
          total_tokens: toNumber(body.usage.total_tokens, 0),
          prompt_tokens: toNumber(body.usage.prompt_tokens, 0),
          completion_tokens: toNumber(body.usage.completion_tokens, 0)
        }
      : null;
    if (!content.trim()) {
      throw new Error("Provider returned no content");
    }
    return { rawText: content, usage };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Provider request timed out after ${Math.round(options.timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function optimizePrompt(
  prompt: string,
  userInstruction: string,
  requestMode: string,
  options: { forceConfigRefresh?: boolean } = {}
): Promise<OptimizerResult> {
  const trimmedPrompt = String(prompt || "").trim();
  const trimmedInstruction = String(userInstruction || "").trim();
  const isCreate = requestMode === "create";
  const mode = trimmedInstruction.includes("MANUAL") ? "MANUAL" : "AUTO";
  const config = await loadPromptEngineeringConfig({ forceRefresh: !!options.forceConfigRefresh });
  const template = isCreate
    ? String(config.compose_template || "").length > config.create_template_max_chars
      ? getDefaultPromptEngineeringTemplates().compose_template
      : config.compose_template
    : mode === "MANUAL"
      ? config.rewrite_manual_template
      : config.rewrite_auto_template;
  const userSlotRaw = trimmedPrompt || trimmedInstruction;
  const userSlot = isCreate ? userSlotRaw.slice(0, config.create_user_slot_max_chars) : userSlotRaw;
  const bundledUserMessage = applyPromptTemplate(template, userSlot);
  const maxBundled = CREDIT_MAX_PROMPT_CHARS + PROMPT_TEMPLATE_MAX_CHARS;
  if (bundledUserMessage.length > maxBundled) {
    throw new Error("Bundled prompt exceeds safe size; shorten the template or user content.");
  }
  let model = isCreate
    ? config.create_model
    : mode === "MANUAL"
      ? config.rewrite_manual_model
      : config.rewrite_auto_model;
  const requestOptions = {
    model,
    timeoutMs: isCreate ? config.create_timeout_ms : config.rewrite_timeout_ms,
    maxCompletionTokens: getMaxCompletionTokens(requestMode, mode, {
      rewrite_max_completion_tokens: config.rewrite_max_completion_tokens,
      rewrite_auto_hard_cap_tokens: config.rewrite_auto_hard_cap_tokens,
      create_max_completion_tokens: config.create_max_completion_tokens
    }),
    createContinuationMaxRounds: config.create_continuation_max_rounds
  };
  const messages = [{ role: "user", content: bundledUserMessage }];
  let firstResult;
  try {
    firstResult = await callOpenAi({
      messages,
      requestMode,
      ...requestOptions
    });
  } catch (error) {
    const shouldFallback = isProviderTimeoutError(error) || isProviderNoContentError(error);
    if (isCreate && shouldFallback) {
      const fastRetryTokens = clamp(Math.floor(requestOptions.maxCompletionTokens * 0.65), 500, requestOptions.maxCompletionTokens);
      try {
        firstResult = await callOpenAi({
          messages,
          requestMode,
          model,
          timeoutMs: requestOptions.timeoutMs,
          maxCompletionTokens: fastRetryTokens,
          createContinuationMaxRounds: 1
        });
      } catch (_fastRetryError) {
        // Fall through to configured fallback model.
      }
      if (firstResult) {
        const normalizedFast = normalizePlainRewriteOutput(firstResult.rawText, trimmedPrompt || trimmedInstruction);
        return {
          optimized_prompt: normalizedFast.optimized_prompt,
          usage: firstResult.usage,
          model,
          provider: "openai"
        };
      }
    }
    const fallbackModel =
      requestMode === "create" && shouldFallback
          ? getCreateFallbackModel(model, config.create_fallback_model)
        : requestMode === "rewrite" && shouldFallback
          ? getRewriteFallbackModel(model, config.rewrite_fallback_model)
          : "";
    if (!fallbackModel) {
      throw error;
    }
    model = fallbackModel;
    firstResult = await callOpenAi({
      messages,
      requestMode,
      model,
      timeoutMs: Math.max(12000, requestOptions.timeoutMs),
      maxCompletionTokens: requestOptions.maxCompletionTokens,
      createContinuationMaxRounds: requestOptions.createContinuationMaxRounds
    });
  }
  const normalized = normalizePlainRewriteOutput(firstResult.rawText, trimmedPrompt || trimmedInstruction);
  return {
    optimized_prompt: normalized.optimized_prompt,
    usage: firstResult.usage,
    model,
    provider: "openai"
  };
}

export async function consumeDailyUsage(params: {
  user: PromptlyUser;
  requestMode: string;
  rewriteMode?: "auto" | "manual";
  day: string;
  tokenCost: number;
}): Promise<{ ok: true; usage: DailyUsage } | { ok: false; usage: DailyUsage }> {
  const db = getFirebaseAdminDb();
  const usageRef = db.collection(DAILY_USAGE_COLLECTION).doc(`${params.user.uid}_${params.day}`);
  const userRef = db.collection(USER_COLLECTION).doc(params.user.uid);
  const dailyLimit = params.user.dailyTokenLimit;

  const outcome = await db.runTransaction(async (tx) => {
    const [usageSnap, userSnap] = await Promise.all([tx.get(usageRef), tx.get(userRef)]);
    const usageRaw = (usageSnap.data() || {}) as Record<string, unknown>;
    const currentUsed = Math.max(0, Math.floor(Number(usageRaw.used || 0) || 0));
    const currentPrompts = Math.max(0, Math.floor(Number(usageRaw.promptsImproved || 0) || 0));
    const currentAuto = Math.max(0, Math.floor(Number(usageRaw.auto || 0) || 0));
    const currentManual = Math.max(0, Math.floor(Number(usageRaw.manual || 0) || 0));
    const currentGenerated = Math.max(0, Math.floor(Number(usageRaw.generated || 0) || 0));
    const nextUsedRaw = currentUsed + params.tokenCost;

    const snapshotUsage: DailyUsage = {
      uid: params.user.uid,
      day: params.day,
      email: params.user.email,
      used: currentUsed,
      promptsImproved: currentPrompts,
      auto: currentAuto,
      manual: currentManual,
      generated: currentGenerated,
      limit: dailyLimit
    };

    if (currentUsed >= dailyLimit) {
      return { ok: false as const, usage: snapshotUsage };
    }
    const nextUsed = Math.min(dailyLimit, nextUsedRaw);

    const nextUsage: DailyUsage = {
      ...snapshotUsage,
      used: nextUsed,
      promptsImproved: currentPrompts + 1,
      auto: currentAuto,
      manual: currentManual,
      generated: currentGenerated + (params.requestMode === "create" ? 1 : 0)
    };
    if (params.requestMode === "rewrite") {
      const isManual = params.rewriteMode === "manual";
      nextUsage.auto = currentAuto + (isManual ? 0 : 1);
      nextUsage.manual = currentManual + (isManual ? 1 : 0);
    }
    tx.set(
      usageRef,
      {
        uid: params.user.uid,
        email: params.user.email,
        day: params.day,
        used: nextUsage.used,
        promptsImproved: nextUsage.promptsImproved,
        auto: nextUsage.auto,
        manual: nextUsage.manual,
        generated: nextUsage.generated,
        limit: dailyLimit,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: usageSnap.exists ? usageRaw.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const userRaw = (userSnap.data() || {}) as Record<string, unknown>;
    const currentTotal = Math.max(0, Math.floor(Number(userRaw.promptsImprovedTotal || 0) || 0));
    const currentAllTimeMax = Math.max(0, Math.floor(Number(userRaw.allTimeMaxDailyTokenUsage || 0) || 0));
    tx.set(
      userRef,
      {
        email: params.user.email,
        dailyTokenLimit: dailyLimit,
        promptsImprovedTotal: currentTotal + 1,
        allTimeMaxDailyTokenUsage: Math.max(currentAllTimeMax, nextUsage.used),
        updatedAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return { ok: true as const, usage: nextUsage };
  });

  return outcome;
}

export function parseEstimateHeader(request: Request, headerName: string, maxValue: number) {
  const raw = String(request.headers.get(headerName) || "").trim();
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.min(maxValue, Math.floor(value));
}

export async function adminGetTierLimits(): Promise<{
  ok: true;
  free_daily_token_limit: number;
  pro_daily_token_limit: number;
  student_daily_token_limit: number;
  enterprise_daily_token_limit: number;
  global_daily_token_limit: number | null;
  defaults: { free: number; pro: number; student: number; enterprise: number; global: number | null };
}> {
  const limits = await loadTierTokenLimits();
  return {
    ok: true,
    free_daily_token_limit: limits.free,
    pro_daily_token_limit: limits.pro,
    student_daily_token_limit: limits.student,
    enterprise_daily_token_limit: limits.enterprise,
    global_daily_token_limit: limits.globalCap,
    defaults: {
      free: DAILY_API_TOKEN_LIMIT_DEFAULT,
      pro: DEFAULT_PRO_DAILY_TOKEN_LIMIT,
      student: DEFAULT_PRO_DAILY_TOKEN_LIMIT,
      enterprise: DEFAULT_PRO_DAILY_TOKEN_LIMIT,
      global: null
    }
  };
}

export async function adminSaveTierLimits(
  patch: Partial<{ free: number; pro: number; student: number; enterprise: number; global: number | null }>
) {
  const current = await loadTierTokenLimits();
  const free =
    typeof patch.free === "number" && Number.isFinite(patch.free)
      ? Math.max(1, Math.min(Math.floor(patch.free), ADMIN_DAILY_TOKEN_LIMIT_MAX))
      : current.free;
  const pro =
    typeof patch.pro === "number" && Number.isFinite(patch.pro)
      ? Math.max(1, Math.min(Math.floor(patch.pro), ADMIN_DAILY_TOKEN_LIMIT_MAX))
      : current.pro;
  const student =
    typeof patch.student === "number" && Number.isFinite(patch.student)
      ? Math.max(1, Math.min(Math.floor(patch.student), ADMIN_DAILY_TOKEN_LIMIT_MAX))
      : current.student;
  const enterprise =
    typeof patch.enterprise === "number" && Number.isFinite(patch.enterprise)
      ? Math.max(1, Math.min(Math.floor(patch.enterprise), ADMIN_DAILY_TOKEN_LIMIT_MAX))
      : current.enterprise;
  const globalCap =
    patch.global === null
      ? null
      : typeof patch.global === "number" && Number.isFinite(patch.global)
        ? Math.max(1, Math.min(Math.floor(patch.global), ADMIN_DAILY_TOKEN_LIMIT_MAX))
        : current.globalCap;
  await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(TIER_LIMITS_DOC_ID)
    .set(
      {
        freeDailyTokenLimit: free,
        proDailyTokenLimit: pro,
        studentDailyTokenLimit: student,
        enterpriseDailyTokenLimit: enterprise,
        globalDailyTokenLimit: globalCap,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  invalidateTierLimitsCache();
  return {
    ok: true as const,
    free_daily_token_limit: free,
    pro_daily_token_limit: pro,
    student_daily_token_limit: student,
    enterprise_daily_token_limit: enterprise,
    global_daily_token_limit: globalCap
  };
}

export async function getCreditsForUser(user: PromptlyUser, request: Request) {
  const day = getUtcDay();
  const usage = await getDailyUsage(user.uid, day, user.dailyTokenLimit);
  const pEst = parseEstimateHeader(request, "x-promptly-estimate-prompt-length", CREDIT_MAX_PROMPT_CHARS);
  const iEst = parseEstimateHeader(
    request,
    "x-promptly-estimate-instruction-length",
    CREDIT_MAX_INSTRUCTION_CHARS
  );
  const estimatedInputTokens =
    pEst !== null || iEst !== null ? estimateBundledInputTokensForOptimize(pEst ?? 0, iEst ?? 0) : null;

  return {
    day,
    usage,
    credits: buildCreditsEnvelope(usage, user.dailyTokenLimit, { estimatedInputTokens })
  };
}

export async function getAdminStats(days: number) {
  const rangeDays = Math.max(1, Math.min(90, Math.floor(days || 14)));
  const recentDays = getRecentDays(rangeDays);
  const startDay = recentDays[0];
  const endDay = recentDays[recentDays.length - 1];
  const snapshot = await getFirebaseAdminDb()
    .collection(DAILY_USAGE_COLLECTION)
    .where("day", ">=", startDay)
    .where("day", "<=", endDay)
    .get();

  const timelineMap = new Map(
    recentDays.map((day) => [day, { day, total: 0, auto: 0, manual: 0, generated: 0, tokens: 0 }])
  );
  let totalImproved = 0;
  let totalAuto = 0;
  let totalManual = 0;
  let totalGenerated = 0;
  let totalTokens = 0;

  for (const doc of snapshot.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const day = String(raw.day || "");
    const row = timelineMap.get(day);
    if (!row) {
      continue;
    }
    const prompts = Math.max(0, Math.floor(Number(raw.promptsImproved || 0) || 0));
    const auto = Math.max(0, Math.floor(Number(raw.auto || 0) || 0));
    const manual = Math.max(0, Math.floor(Number(raw.manual || 0) || 0));
    const generated = Math.max(0, Math.floor(Number(raw.generated || 0) || 0));
    const tokens = Math.max(0, Math.floor(Number(raw.used || 0) || 0));

    row.total += prompts;
    row.auto += auto;
    row.manual += manual;
    row.generated += generated;
    row.tokens += tokens;
    totalImproved += prompts;
    totalAuto += auto;
    totalManual += manual;
    totalGenerated += generated;
    totalTokens += tokens;
  }

  return {
    ok: true,
    range_days: rangeDays,
    totals: {
      improved: totalImproved,
      auto: totalAuto,
      manual: totalManual,
      generated: totalGenerated,
      tokens: totalTokens
    },
    timeline: recentDays.map((day) => timelineMap.get(day))
  };
}

function firestoreTimestampToIso(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function getAdminUserDetail(userId: string, days: number) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { ok: false as const, error: "Missing user id" };
  }
  const rangeDays = Math.max(1, Math.min(90, Math.floor(days || 30)));
  const recentDays = getRecentDays(rangeDays);
  const startDay = recentDays[0];
  const endDay = recentDays[recentDays.length - 1];

  const db = getFirebaseAdminDb();
  const userSnap = await db.collection(USER_COLLECTION).doc(uid).get();
  if (!userSnap.exists) {
    return { ok: false as const, error: "User not found" };
  }
  const raw = (userSnap.data() || {}) as Record<string, unknown>;
  if (typeof raw.mergedIntoUid === "string" && raw.mergedIntoUid.trim()) {
    return {
      ok: false as const,
      error: `User merged into canonical account ${raw.mergedIntoUid}`
    };
  }
  const tierLimits = await loadTierTokenLimits();
  const dailyLimit = effectiveDailyTokenLimitFromUserData(raw, tierLimits);
  const overrideRaw = raw.dailyTokenLimitOverride;
  const override =
    typeof overrideRaw === "number" && Number.isFinite(overrideRaw) && overrideRaw >= 1
      ? Math.min(Math.floor(overrideRaw), ADMIN_DAILY_TOKEN_LIMIT_MAX)
      : null;

  const usageRows = await Promise.all(
      recentDays.map(async (day) => {
      const snap = await db.collection(DAILY_USAGE_COLLECTION).doc(`${uid}_${day}`).get();
      const u = (snap.data() || {}) as Record<string, unknown>;
      return {
        day,
        used: Math.max(0, Math.floor(Number(u.used || 0) || 0)),
        prompts_improved: Math.max(0, Math.floor(Number(u.promptsImproved || 0) || 0)),
        auto: Math.max(0, Math.floor(Number(u.auto || 0) || 0)),
        manual: Math.max(0, Math.floor(Number(u.manual || 0) || 0)),
        generated: Math.max(0, Math.floor(Number(u.generated || 0) || 0)),
        limit: Math.max(1, Math.floor(Number(u.limit || dailyLimit) || dailyLimit))
      };
    })
  );

  const today = getUtcDay();
  const todayRow = usageRows.find((r) => r.day === today);

  return {
    ok: true as const,
    range_days: rangeDays,
    range: { start_day: startDay, end_day: endDay },
    user: {
      user_id: uid,
      email: typeof raw.email === "string" ? raw.email : null,
      plan: typeof raw.plan === "string" ? raw.plan : "free",
      subscription_tier: billingTierFromUserDoc(raw),
      daily_token_limit: dailyLimit,
      daily_token_limit_override: override,
      prompts_improved: Math.max(0, Math.floor(Number(raw.promptsImprovedTotal || 0) || 0)),
      all_time_max_daily_token_usage: Math.max(
        0,
        Math.floor(Number(raw.allTimeMaxDailyTokenUsage || 0) || 0)
      ),
      provider: typeof raw.provider === "string" ? raw.provider : null,
      google_sub: typeof raw.googleSub === "string" ? raw.googleSub : null,
      created_at: firestoreTimestampToIso(raw.createdAt),
      updated_at: firestoreTimestampToIso(raw.updatedAt),
      last_seen_at: firestoreTimestampToIso(raw.lastSeenAt)
    },
    today: {
      day: today,
      used: todayRow?.used ?? 0,
      prompts_improved: todayRow?.prompts_improved ?? 0,
      auto: todayRow?.auto ?? 0,
      manual: todayRow?.manual ?? 0,
      generated: todayRow?.generated ?? 0
    },
    usage_by_day: usageRows
  };
}

export async function adminSetUserDailyTokenLimit(userId: string, nextLimit: number | null) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("Missing user id");
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection(USER_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("User not found");
  }

  if (nextLimit == null) {
    await ref.set(
      {
        dailyTokenLimitOverride: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    const raw = ((await ref.get()).data() || {}) as Record<string, unknown>;
    const limits = await loadTierTokenLimits();
    const effective = effectiveDailyTokenLimitFromUserData(raw, limits);
    await ref.set(
      { dailyTokenLimit: effective, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return {
      ok: true as const,
      user_id: uid,
      daily_token_limit: effective,
      daily_token_limit_override: null as null
    };
  }

  const limit = Math.floor(Number(nextLimit));
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("daily_token_limit must be a positive integer");
  }
  if (limit > ADMIN_DAILY_TOKEN_LIMIT_MAX) {
    throw new Error(`daily_token_limit cannot exceed ${ADMIN_DAILY_TOKEN_LIMIT_MAX.toLocaleString()}`);
  }

  const capped = Math.min(limit, ADMIN_DAILY_TOKEN_LIMIT_MAX);
  await ref.set(
    {
      dailyTokenLimitOverride: capped,
      dailyTokenLimit: capped,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true as const,
    user_id: uid,
    daily_token_limit: capped,
    daily_token_limit_override: capped
  };
}

export async function getAdminUsers(days: number) {
  const rangeDays = Math.max(1, Math.min(90, Math.floor(days || 30)));
  const recentDays = getRecentDays(rangeDays);
  const startDay = recentDays[0];
  const endDay = recentDays[recentDays.length - 1];
  const [usersSnap, usageSnap] = await Promise.all([
    getFirebaseAdminDb().collection(USER_COLLECTION).get(),
    getFirebaseAdminDb()
      .collection(DAILY_USAGE_COLLECTION)
      .where("day", ">=", startDay)
      .where("day", "<=", endDay)
      .get()
  ]);

  const usageByUser = new Map<string, Map<string, number>>();
  for (const doc of usageSnap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const uid = String(raw.uid || "");
    const day = String(raw.day || "");
    if (!uid || !day) {
      continue;
    }
    if (!usageByUser.has(uid)) {
      usageByUser.set(uid, new Map());
    }
    usageByUser.get(uid)!.set(day, Math.max(0, Math.floor(Number(raw.used || 0) || 0)));
  }

  const today = getUtcDay();
  const listLimits = await loadTierTokenLimits();
  const users = usersSnap.docs
    .map((doc) => {
    const raw = doc.data() as Record<string, unknown>;
      if (raw.duplicateDisabled || typeof raw.mergedIntoUid === "string") {
        return null;
      }
    const uid = String(raw.uid || doc.id);
    const dailyLimit = effectiveDailyTokenLimitFromUserData(raw, listLimits);
    const dayTokens = usageByUser.get(uid) || new Map<string, number>();
    const recentValues = recentDays.map((day) => dayTokens.get(day) || 0);
    const activeRecentValues = recentValues.filter((value) => value > 0);
    const avgDailyTokenUsage =
      activeRecentValues.length > 0
        ? Math.round(activeRecentValues.reduce((sum, value) => sum + value, 0) / activeRecentValues.length)
        : 0;
    const last7Days = recentDays.slice(-7).map((day) => dayTokens.get(day) || 0);
    const sevenDayMaxDailyTokenUsage = last7Days.length ? Math.max(...last7Days) : 0;

      return {
        user_id: uid,
        email: typeof raw.email === "string" ? raw.email : null,
        avg_daily_token_usage: avgDailyTokenUsage,
        seven_day_max_daily_token_usage: sevenDayMaxDailyTokenUsage,
        all_time_max_daily_token_usage: Math.max(
          0,
          Math.floor(Number(raw.allTimeMaxDailyTokenUsage || 0) || 0)
        ),
        daily_token_limit: dailyLimit,
        today_tokens: dayTokens.get(today) || 0,
        prompts_improved: Math.max(0, Math.floor(Number(raw.promptsImprovedTotal || 0) || 0))
      };
    })
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  users.sort((a, b) => b.today_tokens - a.today_tokens);
  return {
    ok: true,
    range_days: rangeDays,
    users
  };
}

export async function adminConsolidateDuplicateUsers(maxEmails = 500) {
  const db = getFirebaseAdminDb();
  const usersSnap = await db.collection(USER_COLLECTION).get();
  const byEmail = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  for (const doc of usersSnap.docs) {
    const raw = (doc.data() || {}) as Record<string, unknown>;
    const email = normalizeUserEmail(raw.email);
    if (!email) {
      continue;
    }
    if (!byEmail.has(email)) {
      byEmail.set(email, []);
    }
    byEmail.get(email)!.push({ id: doc.id, data: raw });
  }

  let processed = 0;
  let mergedGroups = 0;
  let mergedAccounts = 0;

  for (const [email, docs] of byEmail.entries()) {
    if (processed >= Math.max(1, Math.floor(maxEmails))) {
      break;
    }
    processed += 1;
    if (docs.length <= 1) {
      continue;
    }
    const canonicalUid = pickCanonicalUserIdForEmail(docs, null, null);
    if (!canonicalUid) {
      continue;
    }
    mergedGroups += 1;
    mergedAccounts += Math.max(0, docs.length - 1);
    await consolidateUsersByEmail(email, canonicalUid);
    await db.collection(USER_EMAIL_INDEX_COLLECTION).doc(email).set(
      {
        email,
        uid: canonicalUid,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  return {
    ok: true as const,
    scanned_email_groups: processed,
    merged_email_groups: mergedGroups,
    merged_accounts: mergedAccounts
  };
}

export function getModeFromInstruction(userInstruction: string) {
  return String(userInstruction || "").includes("MANUAL") ? "manual" : "auto";
}

export function getBaseApiUrl(pathname: string) {
  return `${getExtensionBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
