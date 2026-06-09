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

async function main() {
  const db = (await import("../lib/server/firebaseAdmin.ts")).getFirebaseAdminDb();
  const emails = process.argv.slice(2);
  const targets = emails.length ? emails : ["leby1735@gmail.com", "leobyrne@college.harvard.edu"];

  for (const email of targets) {
    const snap = await db.collection("users").where("email", "==", email).get();
    if (!snap.size) {
      console.log(JSON.stringify({ email, found: false }, null, 2));
      continue;
    }
    for (const doc of snap.docs) {
      const uid = doc.id;
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
            email,
            uid,
            prompts: stats.totals.prompts,
            screen_time_minutes: stats.totals.screen_time_minutes,
            events_docs_in_query: stats.events_docs_in_query,
            agent_emails_by_tool: stats.agent_emails_by_tool
          },
          null,
          2
        )
      );
    }
  }
}

await main();
