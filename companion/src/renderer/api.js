const OPTIMIZE_TIMEOUT_MS = 45000;

function companionHeaders(config) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${String(config.token || "").trim()}`,
    "x-promptly-client": config.client || config.clientHeader || "promptly-cursor",
    "x-promptly-live-config": "1"
  };
}

export async function optimizePrompt({
  apiUrl,
  token,
  clientHeader,
  client,
  prompt,
  promptFeedback = "",
  optimizeMode = "improve"
}) {
  const base = String(apiUrl || "").replace(/\/$/, "");
  const auth = String(token || "").trim();
  if (!base) throw new Error("API URL is required.");
  if (!auth) throw new Error("Auth token is required. Add PROMPTLY_DEVICE_TOKEN or pair an IDE integration.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${base}/api/companion/optimize`, {
      method: "POST",
      headers: companionHeaders({ token: auth, client: client || clientHeader }),
      body: JSON.stringify({
        prompt: String(prompt || "").trim(),
        prompt_feedback: String(promptFeedback || "").trim(),
        optimize_mode: optimizeMode
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out — try a shorter prompt.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || `Optimize failed (${response.status})`));
  }
  const optimized = String(body.optimized_prompt || "").trim();
  if (!optimized) {
    throw new Error("Empty response from Promptly.");
  }
  return {
    optimized,
    refineSummary: String(body.refine_summary || "").trim(),
    credits: body.credits || null
  };
}

export async function fetchSuggestions(config, wordCount) {
  const base = String(config.apiUrl || "").replace(/\/$/, "");
  const auth = String(config.token || "").trim();
  if (!base) throw new Error("API URL is required.");
  if (!auth) throw new Error("Auth token is required.");

  const params = new URLSearchParams({
    word_count: String(Math.max(0, Number(wordCount) || 0))
  });
  const response = await fetch(`${base}/api/companion/suggestions?${params.toString()}`, {
    method: "GET",
    headers: companionHeaders(config),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || `Suggestions failed (${response.status})`));
  }
  const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
  return suggestions
    .map((row) => ({
      id: String(row?.id || "").trim(),
      label: String(row?.label || "").trim(),
      snippet: String(row?.snippet || "").trim()
    }))
    .filter((row) => row.id && row.label && row.snippet);
}

export async function improveInitialDraft(config, draft) {
  return optimizePrompt({ ...config, prompt: draft, optimizeMode: "improve" });
}

export async function refineWithFeedback(config, currentPrompt, promptFeedback) {
  const { optimized, refineSummary, credits } = await optimizePrompt({
    apiUrl: config.apiUrl,
    token: config.token,
    clientHeader: config.client || config.clientHeader,
    prompt: currentPrompt,
    promptFeedback,
    optimizeMode: "refine"
  });

  return {
    prompt: optimized,
    summary: refineSummary || "Updated the prompt based on your feedback.",
    credits
  };
}
