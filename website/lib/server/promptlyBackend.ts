import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";

export const CREDIT_MAX_PROMPT_CHARS = 12000;
export const CREDIT_MAX_INSTRUCTION_CHARS = 3000;
export const CREDIT_MAX_ESTIMATED_INPUT_TOKENS = 4000;
/** Placeholder for the user's prompt (rewrite/auto) or compose description; put anywhere in admin super-prompts. */
export const PROMPTLY_USER_CONTENT_TOKEN = "<<PROMPTLY_USER_CONTENT>>";
const PROMPT_SETTINGS_COLLECTION = "promptly_settings";
const PROMPT_ENGINEERING_DOC_ID = "prompt_engineering";
const PROMPT_TEMPLATE_MAX_CHARS = 24_000;
/** Extra chars assumed for super-prompt template when estimating credits before loading Firestore. */
const OPTIMIZE_TEMPLATE_OVERHEAD_CHARS = 6000;
const PROMPT_ENGINEERING_CACHE_MS = 45_000;
export const DAILY_BILL_PLAN_CAP = 250_000;
export const DAILY_API_TOKEN_LIMIT_DEFAULT = 4_000_000;

const REQUIRED_CLIENT_HEADER = "promptly-extension";
const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
const DEFAULT_OPENAI_REWRITE_MODEL = "gpt-5-nano";
const DEFAULT_OPENAI_CREATE_MODEL = "gpt-5-mini";
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
  const used = Math.max(0, Number(raw.used || 0));
  const limit = Math.max(1, Number(raw.limit || 1));
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
      canRunEstimatedPrompt = used + plannedBillEstimate <= limit;
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

function getOpenAiApiKey() {
  return required("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
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
  return Math.max(3000, Math.min(30000, Number(process.env.OPENAI_REWRITE_TIMEOUT_MS || 15000)));
}

function getGenerateTimeoutMs() {
  return Math.max(5000, Math.min(120000, Number(process.env.OPENAI_CREATE_TIMEOUT_MS || 60000)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getMaxCompletionTokens(prompt: string, requestMode: string, rewriteMode: "AUTO" | "MANUAL") {
  const estimatedPromptTokens = estimateTokensFromChars(String(prompt || "").length);
  if (requestMode === "create") {
    // Headroom for long structured prompts; the old 1800 cap often stopped the model mid-sentence.
    return clamp(estimatedPromptTokens * 3.5, 900, 8192);
  }
  if (rewriteMode === "MANUAL") {
    return clamp(estimatedPromptTokens * 2, 280, 1200);
  }
  return clamp(estimatedPromptTokens * 1.7, 180, 650);
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
  return String(request.headers.get("x-promptly-user-email") || "").trim().toLowerCase();
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
        "Content-Type,x-promptly-client,x-promptly-firebase-token,x-promptly-google-access-token,x-promptly-user-email,x-promptly-estimate-prompt-length,x-promptly-estimate-instruction-length,Authorization"
    }
  });
}

async function upsertPromptlyUser(userId: string, email: string | null, patch: Record<string, unknown> = {}) {
  const db = getFirebaseAdminDb();
  const userRef = db.collection(USER_COLLECTION).doc(userId);
  const snap = await userRef.get();
  const existing = (snap.data() || {}) as Record<string, unknown>;
  const dailyTokenLimit = Math.max(
    1,
    Math.floor(Number(existing.dailyTokenLimit || DAILY_API_TOKEN_LIMIT_DEFAULT) || DAILY_API_TOKEN_LIMIT_DEFAULT)
  );
  const promptlyUser: PromptlyUser = {
    uid: userId,
    email,
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
  const hintedEmail = readUserEmailHeader(request);
  if (cached && cached.expiresAt > Date.now()) {
    if (hintedEmail && cached.email && hintedEmail !== cached.email) {
      throw new Error("Google account email does not match signed-in Chrome Gmail");
    }
    const db = getFirebaseAdminDb();
    if (cached.email) {
      const existingByEmail = await db.collection(USER_COLLECTION).where("email", "==", cached.email).limit(1).get();
      if (!existingByEmail.empty) {
        return upsertPromptlyUser(existingByEmail.docs[0].id, cached.email, {
          googleSub: cached.sub,
          provider: "google-extension"
        });
      }
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
  const email = String(body.email || "").trim().toLowerCase() || null;
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

  const db = getFirebaseAdminDb();
  if (email) {
    const existingByEmail = await db.collection(USER_COLLECTION).where("email", "==", email).limit(1).get();
    if (!existingByEmail.empty) {
      return upsertPromptlyUser(existingByEmail.docs[0].id, email, {
        googleSub: sub,
        provider: "google-extension"
      });
    }
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
    const email = String(decoded.email || "").trim().toLowerCase() || null;
    const user = await upsertPromptlyUser(decoded.uid, email, {
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
  return { optimized_prompt: t.slice(0, 12000) };
}

export type PromptEngineeringTemplates = {
  rewrite_auto_template: string;
  rewrite_manual_template: string;
  compose_template: string;
};

let promptEngineeringCache: { at: number; templates: PromptEngineeringTemplates } | null = null;

function invalidatePromptEngineeringCache() {
  promptEngineeringCache = null;
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

Match the user's goal. Be specific and actionable. Do not chat; output only the constructed prompt.`
  };
}

async function loadPromptEngineeringTemplates(): Promise<PromptEngineeringTemplates> {
  const now = Date.now();
  if (promptEngineeringCache && now - promptEngineeringCache.at < PROMPT_ENGINEERING_CACHE_MS) {
    return promptEngineeringCache.templates;
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
  promptEngineeringCache = { at: now, templates };
  return templates;
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
  { ok: true; user_content_token: string } & PromptEngineeringTemplates
> {
  const snap = await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(PROMPT_ENGINEERING_DOC_ID)
    .get();
  const raw = (snap.data() || {}) as Record<string, unknown>;
  const defaults = getDefaultPromptEngineeringTemplates();
  const coalesce = (key: keyof PromptEngineeringTemplates) =>
    typeof raw[key] === "string" && raw[key].trim().length > 0 ? String(raw[key]) : defaults[key];

  return {
    ok: true,
    user_content_token: PROMPTLY_USER_CONTENT_TOKEN,
    rewrite_auto_template: coalesce("rewrite_auto_template"),
    rewrite_manual_template: coalesce("rewrite_manual_template"),
    compose_template: coalesce("compose_template")
  };
}

export async function adminSavePromptEngineering(patch: Partial<PromptEngineeringTemplates>) {
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
  await getFirebaseAdminDb()
    .collection(PROMPT_SETTINGS_COLLECTION)
    .doc(PROMPT_ENGINEERING_DOC_ID)
    .set(
      {
        ...next,
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

function extractResponsesApiText(body: Record<string, unknown>) {
  const output = Array.isArray(body.output) ? body.output : [];
  const textParts: string[] = [];
  for (const item of output) {
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
        if (part && part.type === "output_text" && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
    }
  }
  return textParts.join("").trim();
}

async function callOpenAi(options: {
  messages: Array<{ role: string; content: string }>;
  model: string;
  timeoutMs: number;
  maxCompletionTokens: number;
  requestMode: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs);
  try {
    const useResponsesApi = usesResponsesApi(options.model);
    const requestBody: Record<string, unknown> = useResponsesApi
      ? {
          model: options.model,
          input: options.messages.map((message) => ({
            role: message.role,
            content: [{ type: "input_text", text: message.content }]
          })),
          max_output_tokens: options.maxCompletionTokens,
          reasoning: {
            effort: "minimal"
          },
          text: {
            verbosity: "low"
          },
          store: false
        }
      : {
          model: options.model,
          messages: options.messages,
          max_tokens: options.maxCompletionTokens,
          store: false
        };
    const response = await fetch(useResponsesApi ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiApiKey()}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(body?.error?.message || `Provider error (${response.status})`));
    }
    let content = "";
    let usage = null;
    if (useResponsesApi) {
      content = extractResponsesApiText(body as Record<string, unknown>);
      usage = body?.usage
        ? {
            total_tokens: toNumber((body.usage as { total_tokens?: unknown }).total_tokens, 0),
            prompt_tokens: toNumber((body.usage as { input_tokens?: unknown }).input_tokens, 0),
            completion_tokens: toNumber((body.usage as { output_tokens?: unknown }).output_tokens, 0)
          }
        : null;
    } else {
      const message = body?.choices?.[0]?.message;
      if (message?.refusal) {
        const refusal = String(message.refusal).trim();
        throw new Error(refusal ? `Model declined: ${refusal.slice(0, 400)}` : "Model declined the request");
      }
      if (typeof message?.content === "string") {
        content = message.content;
      } else if (Array.isArray(message?.content)) {
        content = message.content
          .filter((part: { type?: string; text?: string } | null) => part && part.type === "text")
          .map((part: { text?: string }) => String(part.text || ""))
          .join("");
      }
      usage = body?.usage
        ? {
            total_tokens: toNumber(body.usage.total_tokens, 0),
            prompt_tokens: toNumber(body.usage.prompt_tokens, 0),
            completion_tokens: toNumber(body.usage.completion_tokens, 0)
          }
        : null;
    }
    if (!content.trim()) {
      throw new Error("Provider returned no content");
    }
    return {
      rawText: content,
      usage
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Provider request timed out after ${Math.round(options.timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function optimizePrompt(prompt: string, userInstruction: string, requestMode: string): Promise<OptimizerResult> {
  const trimmedPrompt = String(prompt || "").trim();
  const trimmedInstruction = String(userInstruction || "").trim();
  const isCreate = requestMode === "create";
  const mode = trimmedInstruction.includes("MANUAL") ? "MANUAL" : "AUTO";
  const templates = await loadPromptEngineeringTemplates();
  const template = isCreate
    ? templates.compose_template
    : mode === "MANUAL"
      ? templates.rewrite_manual_template
      : templates.rewrite_auto_template;
  const userSlot = trimmedPrompt || trimmedInstruction;
  const bundledUserMessage = applyPromptTemplate(template, userSlot);
  const maxBundled = CREDIT_MAX_PROMPT_CHARS + PROMPT_TEMPLATE_MAX_CHARS;
  if (bundledUserMessage.length > maxBundled) {
    throw new Error("Bundled prompt exceeds safe size; shorten the template or user content.");
  }
  const model = getOpenAiModelForRequest(requestMode, mode);
  const requestOptions = {
    model,
    timeoutMs: isCreate ? getGenerateTimeoutMs() : getRewriteTimeoutMs(),
    maxCompletionTokens: getMaxCompletionTokens(trimmedPrompt || userSlot, requestMode, mode)
  };
  const firstResult = await callOpenAi({
    messages: [{ role: "user", content: bundledUserMessage }],
    requestMode,
    ...requestOptions
  });
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
    const nextUsed = currentUsed + params.tokenCost;

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

    if (nextUsed > dailyLimit) {
      return { ok: false as const, usage: snapshotUsage };
    }

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

/** Upper bound for admin-set daily token limits (abuse throttle). */
export const ADMIN_DAILY_TOKEN_LIMIT_MAX = 50_000_000;

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
  const dailyLimit = Math.max(
    1,
    Math.floor(Number(raw.dailyTokenLimit || DAILY_API_TOKEN_LIMIT_DEFAULT) || DAILY_API_TOKEN_LIMIT_DEFAULT)
  );

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
      daily_token_limit: dailyLimit,
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

export async function adminSetUserDailyTokenLimit(userId: string, nextLimit: number) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("Missing user id");
  }
  const limit = Math.floor(Number(nextLimit));
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("daily_token_limit must be a positive integer");
  }
  if (limit > ADMIN_DAILY_TOKEN_LIMIT_MAX) {
    throw new Error(`daily_token_limit cannot exceed ${ADMIN_DAILY_TOKEN_LIMIT_MAX.toLocaleString()}`);
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection(USER_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("User not found");
  }

  await ref.set(
    {
      dailyTokenLimit: limit,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true as const, user_id: uid, daily_token_limit: limit };
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
  const users = usersSnap.docs.map((doc) => {
    const raw = doc.data() as Record<string, unknown>;
    const uid = String(raw.uid || doc.id);
    const dailyLimit = Math.max(
      1,
      Math.floor(Number(raw.dailyTokenLimit || DAILY_API_TOKEN_LIMIT_DEFAULT) || DAILY_API_TOKEN_LIMIT_DEFAULT)
    );
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
  });

  users.sort((a, b) => b.today_tokens - a.today_tokens);
  return {
    ok: true,
    range_days: rangeDays,
    users
  };
}

export function getModeFromInstruction(userInstruction: string) {
  return String(userInstruction || "").includes("MANUAL") ? "manual" : "auto";
}

export function getBaseApiUrl(pathname: string) {
  return `${getExtensionBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
