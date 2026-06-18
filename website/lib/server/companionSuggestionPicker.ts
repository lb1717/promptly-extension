import catalogJson from "@/lib/server/companionSuggestionCatalog.json";
import { executeOpenAiOptimizerCall } from "@/lib/server/promptlyBackend";
import type { CompanionPromptEngineeringConfig } from "@/lib/server/companionPromptEngineering";

export type CatalogSuggestion = {
  id: string;
  categoryId: string;
  categoryLabel: string;
  label: string;
  snippet: string;
};

export type SelectedCompanionSuggestion = {
  id: string;
  label: string;
  snippet: string;
  categoryId: string;
  categoryLabel: string;
};

const CATALOG = catalogJson as CatalogSuggestion[];
const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

export function getCompanionSuggestionCatalog(): CatalogSuggestion[] {
  return CATALOG;
}

export function getCompanionSuggestionCatalogStats() {
  const categories = new Map<string, string>();
  for (const item of CATALOG) {
    categories.set(item.categoryId, item.categoryLabel);
  }
  return {
    total: CATALOG.length,
    categories: [...categories.entries()].map(([id, label]) => ({ id, label, count: CATALOG.filter((c) => c.categoryId === id).length }))
  };
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toSelected(item: CatalogSuggestion): SelectedCompanionSuggestion {
  return {
    id: item.id,
    label: item.label,
    snippet: item.snippet,
    categoryId: item.categoryId,
    categoryLabel: item.categoryLabel
  };
}

export function diversifySuggestionsByCategory(
  picked: CatalogSuggestion[],
  catalog: CatalogSuggestion[],
  options: { target: number; min: number; maxPerCategory: number }
): SelectedCompanionSuggestion[] {
  const byCategory = new Map<string, CatalogSuggestion[]>();
  for (const item of picked) {
    const bucket = byCategory.get(item.categoryId) || [];
    bucket.push(item);
    byCategory.set(item.categoryId, bucket);
  }

  let narrowed: CatalogSuggestion[] = [];
  if (byCategory.size === 1) {
    const only = [...byCategory.values()][0];
    if (only.length) {
      narrowed.push(only[0]);
    }
  } else {
    for (const items of byCategory.values()) {
      narrowed.push(...items.slice(0, options.maxPerCategory));
    }
  }

  const seenIds = new Set<string>();
  narrowed = narrowed.filter((item) => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });

  if (narrowed.length > options.target) {
    narrowed = shuffle(narrowed).slice(0, options.target);
  }

  const usedCategoryIds = new Set(narrowed.map((item) => item.categoryId));
  const fillerPool = shuffle(catalog.filter((item) => !seenIds.has(item.id)));

  const pullNext = (preferNewCategory: boolean) => {
    const candidate =
      (preferNewCategory ? fillerPool.find((item) => !usedCategoryIds.has(item.categoryId)) : null) ||
      fillerPool.find((item) => !seenIds.has(item.id));
    if (!candidate) return null;
    seenIds.add(candidate.id);
    usedCategoryIds.add(candidate.categoryId);
    return candidate;
  };

  while (narrowed.length < options.min) {
    const next = pullNext(true);
    if (!next) break;
    narrowed.push(next);
  }

  while (narrowed.length < options.min) {
    const next = pullNext(false);
    if (!next) break;
    narrowed.push(next);
  }

  return narrowed.slice(0, options.target).map(toSelected);
}

function parsePickerIds(rawText: string, pickCount: number): string[] {
  const text = String(rawText || "").trim();
  if (!text) return [];
  const jsonMatch = text.match(/\{[\s\S]*"ids"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { ids?: unknown };
      if (Array.isArray(parsed.ids)) {
        return parsed.ids.map((id) => String(id || "").trim()).filter(Boolean).slice(0, pickCount);
      }
    } catch {
      /* fall through */
    }
  }
  const ids: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/["']?([a-z0-9][a-z0-9-]{4,})["']?/i);
    if (match && CATALOG_BY_ID.has(match[1])) {
      ids.push(match[1]);
    }
  }
  return [...new Set(ids)].slice(0, pickCount);
}

function buildPickerMessage(promptText: string, pickCount: number): string {
  const catalogLines = CATALOG.map((item) => `${item.id}|${item.categoryId}|${item.label}`).join("\n");
  const prompt = String(promptText || "").trim().slice(0, 8000);
  return `You select improve suggestion chips for a user prompt.

Read the PROMPT carefully. From the CATALOG below, pick exactly ${pickCount} ids whose labels would most help improve THIS specific prompt if their instruction snippets were appended.

Selection rules:
- Match visible gaps: clarity, structure, tone, scope, deliverables, constraints, examples, etc.
- Prefer suggestions that fit the prompt domain and audience
- Prefer variety across categories when multiple options are equally relevant
- Use only ids from the catalog

Return ONLY JSON with this shape (no markdown, no commentary):
{"ids":["id-one","id-two","id-three","id-four","id-five"]}

CATALOG (id|category|label):
${catalogLines}

PROMPT:
${prompt}`;
}

function heuristicPick(promptText: string, pickCount: number): CatalogSuggestion[] {
  const text = String(promptText || "").toLowerCase();
  const scored = CATALOG.map((item) => {
    let score = Math.random() * 0.35;
    const label = item.label.toLowerCase();
    const cat = item.categoryId;
    if (/\bcode\b|api|function|implement|debug/.test(text) && (cat === "specificity" || cat === "structure")) score += 1.2;
    if (/\bemail|letter|tone|professional/.test(text) && cat === "tone") score += 1.1;
    if (/\bstep|how to|process|plan/.test(text) && cat === "actionability") score += 1.0;
    if (/\bshort|brief|concise/.test(text) && cat === "brevity") score += 1.0;
    if (/\bdetail|thorough|deep|explain/.test(text) && cat === "depth") score += 1.0;
    if (/\bexample|sample|template/.test(text) && cat === "examples") score += 1.0;
    if (/\bstudent|beginner|learn/.test(text) && cat === "audience") score += 0.9;
    if (/\bgame|app|build|create/.test(text) && cat === "specificity") score += 0.8;
    if (label.split(" ").some((word) => word.length > 4 && text.includes(word))) score += 0.4;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: CatalogSuggestion[] = [];
  const usedCats = new Set<string>();
  for (const row of scored) {
    if (out.length >= pickCount) break;
    if (usedCats.has(row.item.categoryId) && out.length >= pickCount - 2) continue;
    out.push(row.item);
    usedCats.add(row.item.categoryId);
  }
  while (out.length < pickCount) {
    const next = scored.find((row) => !out.some((o) => o.id === row.item.id));
    if (!next) break;
    out.push(next.item);
  }
  return out.slice(0, pickCount);
}

export async function pickCompanionSuggestionsForPrompt(
  promptText: string,
  config: CompanionPromptEngineeringConfig
): Promise<SelectedCompanionSuggestion[]> {
  const pickCount = Math.max(3, Math.min(8, config.suggestion_ai_pick_count || 5));
  const target = Math.max(3, Math.min(6, config.suggestion_display_max || 5));
  const min = Math.max(3, Math.min(target, config.suggestion_display_min || 3));
  const maxPerCategory = Math.max(1, Math.min(3, config.suggestion_max_per_category || 2));
  const model = String(config.suggestion_picker_model || config.improve_model || "gpt-5-nano").trim();
  const timeoutMs = Math.max(8000, config.suggestion_picker_timeout_ms || 15000);

  let picked: CatalogSuggestion[] = [];
  try {
    const result = await executeOpenAiOptimizerCall({
      messages: [{ role: "user", content: buildPickerMessage(promptText, pickCount) }],
      requestMode: "create",
      model,
      timeoutMs,
      maxCompletionTokens: 400,
      createContinuationMaxRounds: 1
    });
    const ids = parsePickerIds(result.rawText, pickCount);
    picked = ids.map((id) => CATALOG_BY_ID.get(id)).filter((item): item is CatalogSuggestion => !!item);
  } catch {
    picked = [];
  }

  if (picked.length < min) {
    picked = heuristicPick(promptText, pickCount);
  }

  return diversifySuggestionsByCategory(picked, CATALOG, {
    target,
    min,
    maxPerCategory
  });
}
