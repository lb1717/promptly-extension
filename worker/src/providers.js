function getProviderConfig(env) {
  const provider = String(env.PROVIDER || "openai").toLowerCase();
  const apiKey = env.PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PROVIDER_API_KEY secret");
  }

  if (provider === "openai") {
    return {
      provider,
      url: "https://api.openai.com/v1/chat/completions",
      model: env.OPENAI_MODEL || "gpt-5-nano"
    };
  }

  if (provider === "mistral") {
    return {
      provider,
      url: "https://api.mistral.ai/v1/chat/completions",
      model: env.MISTRAL_MODEL || "mistral-small-latest"
    };
  }

  return {
    provider: "deepseek",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: env.DEEPSEEK_MODEL || "deepseek-chat"
  };
}

/** GPT-5 family rejects custom temperature (only default 1); reasoning can exceed short timeouts. */
function isOpenAiGpt5FamilyModel(modelId) {
  return /^gpt-5/i.test(String(modelId || ""));
}

/** Improve/rewrite: strict paragraphs array → server joins with blank lines (Chat Completions). */
function getOpenAiRewriteParagraphsResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "improved_prompt_paragraphs",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["paragraphs"],
        properties: {
          paragraphs: {
            type: "array",
            minItems: 1,
            description: "Each string is one paragraph; joined with blank lines for display.",
            items: { type: "string" }
          }
        }
      }
    }
  };
}

function getOpenAiPromptRefinerResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "prompt_refiner_output",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
            enum: ["rewrite", "create"]
          },
          classification: {
            type: "object",
            additionalProperties: false,
            properties: {
              domain: {
                type: "string",
                enum: [
                  "general",
                  "writing",
                  "coding",
                  "math",
                  "data_analysis",
                  "research",
                  "grounded_document",
                  "image_generation",
                  "agent_tool_use",
                  "transformation",
                  "other"
                ]
              },
              primary_intent: { type: "string" },
              needs_strict_grounding: { type: "boolean" },
              syntax_sensitive: { type: "boolean" },
              suspected_target_system: { type: "string" },
              risk_flags: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "hallucination_risk_high",
                    "syntax_sensitive",
                    "ambiguous_requirements",
                    "safety_sensitive",
                    "tooling_mismatch"
                  ]
                }
              }
            },
            required: [
              "domain",
              "primary_intent",
              "needs_strict_grounding",
              "syntax_sensitive",
              "suspected_target_system",
              "risk_flags"
            ]
          },
          clarifying_questions: {
            type: "array",
            items: { type: "string" }
          },
          assumptions_added: {
            type: "array",
            items: { type: "string" }
          },
          improved_prompt: { type: "string" }
        },
        required: [
          "mode",
          "classification",
          "clarifying_questions",
          "assumptions_added",
          "improved_prompt"
        ]
      }
    }
  };
}

/** Normalize Chat Completions assistant message to text (string content, multimodal parts, refusals). */
function extractOpenAiAssistantText(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (message.refusal) {
    const r = String(message.refusal).trim();
    throw new Error(r ? `Model declined: ${r.slice(0, 400)}` : "Model declined the request");
  }
  const c = message.content;
  if (typeof c === "string" && c.length > 0) {
    return c;
  }
  if (Array.isArray(c)) {
    const parts = c
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text);
    const joined = parts.join("");
    if (joined.length > 0) {
      return joined;
    }
  }
  if (message.parsed != null && typeof message.parsed === "object") {
    try {
      return JSON.stringify(message.parsed);
    } catch {
      /* ignore */
    }
  }
  return "";
}

export async function callProvider(env, messages, timeoutMs = 12000, options = {}) {
  const useJsonSchema = options.useJsonSchema !== false;
  const cfg = getProviderConfig(env);
  const modelId = String(options.modelOverride || "").trim() || cfg.model;
  const gpt5 = cfg.provider === "openai" && isOpenAiGpt5FamilyModel(modelId);
  /** Default: reasoning models get 60s floor. Set gpt5MinTimeoutMs: 0 for fast rewrite (nano) paths. */
  const gpt5FloorMs =
    options.gpt5MinTimeoutMs !== undefined ? Number(options.gpt5MinTimeoutMs) : gpt5 ? 60000 : 0;
  const effectiveTimeoutMs = gpt5 ? Math.max(timeoutMs, gpt5FloorMs) : timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), effectiveTimeoutMs);
  const startedAt = Date.now();
  try {
    const bodyPayload = {
      model: modelId,
      messages,
      stream: false
    };

    if (cfg.provider === "openai" && !gpt5) {
      bodyPayload.temperature = 0.1;
    }

    if (cfg.provider === "openai" && options.paragraphRewriteSchema) {
      bodyPayload.response_format = getOpenAiRewriteParagraphsResponseFormat();
    } else if (cfg.provider === "openai" && useJsonSchema) {
      bodyPayload.response_format = getOpenAiPromptRefinerResponseFormat();
    }

    let response;
    try {
      response = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PROVIDER_API_KEY}`
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      if (fetchErr?.name === "AbortError") {
        throw new Error(
          `Provider request timed out after ${Math.round(effectiveTimeoutMs / 1000)}s`
        );
      }
      throw fetchErr;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = body?.error?.message || `Provider error (${response.status})`;
      console.error(
        `[promptly] provider HTTP ${response.status} model=${modelId}`,
        body?.error || body
      );
      throw new Error(reason);
    }

    const message = body?.choices?.[0]?.message;
    let rawText;
    if (cfg.provider === "openai") {
      rawText = extractOpenAiAssistantText(message);
    } else {
      rawText = typeof message?.content === "string" ? message.content : "";
    }
    if (!rawText) {
      throw new Error("Provider returned no content");
    }

    return {
      provider: cfg.provider,
      model: modelId,
      rawText: String(rawText),
      usage: body?.usage || null,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}
