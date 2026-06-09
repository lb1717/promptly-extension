#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const { getAccountIdeUsageStats } = await import("../lib/server/promptlyBackend.ts");

const uid = process.argv[2] || "4OLvVCzYHPbpY6A1WWaFRCzUUIN2";
const email = process.argv[3] || "leobyrne@college.harvard.edu";

const stats = await getAccountIdeUsageStats(
  { uid, email, provider: "firebase" },
  30,
  "day",
  undefined,
  { bypassCache: true }
);

console.log(
  JSON.stringify(
    {
      uid,
      email,
      prompts: stats.totals.prompts,
      screen_time_minutes: stats.totals.screen_time_minutes,
      events_docs_in_query: stats.events_docs_in_query,
      quota_exceeded: stats.quota_exceeded,
      index_missing: stats.index_missing,
      agent_emails_by_tool: stats.agent_emails_by_tool,
      response_latency_by_tool: stats.response_latency_by_tool,
      draft_timing_by_tool: stats.draft_timing_by_tool
    },
    null,
    2
  )
);
