import type { AccountStatsScopeFilter } from "@/lib/server/promptlyBackend";
import type { PromptlyService } from "@/lib/server/promptlyBackend";

const WEB_SERVICES = new Set(["chatgpt", "claude", "gemini", "unknown"]);
const IDE_TOOLS = new Set(["claude_code", "cursor", "codex"]);

export function parseAccountStatsScopeFilter(searchParams: URLSearchParams): AccountStatsScopeFilter | undefined {
  const rawService = String(searchParams.get("service") || searchParams.get("web_service") || "").trim().toLowerCase();
  const rawTool = String(searchParams.get("tool") || searchParams.get("ide_tool") || "").trim().toLowerCase();
  const rawModels = String(searchParams.get("model_buckets") || searchParams.get("models") || "").trim();

  const modelBuckets = rawModels
    ? new Set(
        rawModels
          .split(",")
          .map((value) => value.trim().slice(0, 48))
          .filter(Boolean)
      )
    : undefined;

  const filter: AccountStatsScopeFilter = {};
  if (rawService && WEB_SERVICES.has(rawService)) {
    filter.webService = rawService as PromptlyService;
  }
  if (rawTool && IDE_TOOLS.has(rawTool)) {
    filter.ideTool = rawTool as AccountStatsScopeFilter["ideTool"];
  }
  if (modelBuckets?.size) {
    filter.modelBuckets = modelBuckets;
  }

  if (!filter.webService && !filter.ideTool && !filter.modelBuckets?.size) {
    return undefined;
  }
  return filter;
}
