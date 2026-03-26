function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function parseModelJsonLoose(rawText) {
  if (!rawText) {
    return null;
  }
  const trimmed = String(rawText).trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return direct;
  }
  const strippedFences = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsedStripped = tryParseJson(strippedFences);
  if (parsedStripped) {
    return parsedStripped;
  }
  const candidate = extractFirstJsonObject(strippedFences);
  if (!candidate) {
    return null;
  }
  return tryParseJson(candidate);
}

function normalizeString(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeStringArray(value, maxItems, maxItemLength) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, maxItems)
    .map((item) => normalizeString(item, maxItemLength))
    .filter(Boolean);
}

export function normalizeModelOutput(obj, fallbackPrompt) {
  if (!obj || typeof obj !== "object") {
    return {
      optimized_prompt: fallbackPrompt,
      clarifying_questions: [],
      assumptions: [],
      classification: null
    };
  }

  const optimized = normalizeString(
    typeof obj.improved_prompt === "string" ? obj.improved_prompt : obj.optimized_prompt,
    12000
  );
  const questions = normalizeStringArray(obj.clarifying_questions, 6, 240);
  const assumptions = normalizeStringArray(
    Array.isArray(obj.assumptions_added) ? obj.assumptions_added : obj.assumptions,
    8,
    240
  );
  const classification =
    obj.classification && typeof obj.classification === "object" ? obj.classification : null;

  return {
    optimized_prompt: optimized || fallbackPrompt,
    clarifying_questions: questions,
    assumptions,
    classification
  };
}
