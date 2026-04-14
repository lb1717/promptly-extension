"use client";

import { useMemo, useState } from "react";

type AnalysisSummary = {
  goal: string;
  audience: string;
  constraints: string[];
  output_format: string;
  risks: string[];
  missing_info: string[];
};

type DemoOutput = {
  analysis: AnalysisSummary;
  tags: string[];
  optimisedPrompt: string;
  template: string[];
};

type TabId = "analysis" | "optimised" | "tags" | "diff";

const DEFAULT_PROMPT =
  "Write a research-backed prompt that helps a product manager compare three onboarding flows and recommend the best one for busy executives.";

const TAB_OPTIONS: Array<{ id: TabId; label: string }> = [
  { id: "analysis", label: "Analysis" },
  { id: "optimised", label: "Optimised Prompt" },
  { id: "tags", label: "Tags & Template" },
  { id: "diff", label: "Diff" }
];

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function extractGoal(prompt: string) {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "No goal detected yet.";
  }

  const sentence = cleaned.split(/[.!?]/)[0]?.trim() ?? cleaned;
  return sentence || cleaned;
}

function detectAudience(prompt: string) {
  const lower = prompt.toLowerCase();

  const matches: Array<[RegExp, string]> = [
    [/\bexecutive(s)?\b/, "Busy executives"],
    [/\bbeginner(s)?\b|\bnewcomer(s)?\b/, "Beginners"],
    [/\bengineer(s)?\b|\bdeveloper(s)?\b/, "Engineers"],
    [/\bmarketing\b/, "Marketing stakeholders"],
    [/\bcustomer(s)?\b/, "Customers or end users"],
    [/\bstudent(s)?\b/, "Students"],
    [/\bmanager(s)?\b/, "Managers"]
  ];

  for (const [pattern, audience] of matches) {
    if (pattern.test(lower)) {
      return audience;
    }
  }

  return "General audience not explicitly specified";
}

function detectOutputFormat(prompt: string) {
  const lower = prompt.toLowerCase();

  if (/\bjson\b/.test(lower)) return "JSON object";
  if (/\btable\b/.test(lower)) return "Table";
  if (/\bbullet(s)?\b|\blist\b/.test(lower)) return "Bullet list";
  if (/\bemail\b/.test(lower)) return "Email draft";
  if (/\bsummary\b|\bsummarize\b|\bsummarise\b/.test(lower)) return "Structured summary";
  if (/\bcompare\b|\bcomparison\b/.test(lower)) return "Comparison with recommendation";

  return "Natural-language response";
}

function detectConstraints(prompt: string) {
  const lower = prompt.toLowerCase();
  const constraints = new Set<string>();

  if (/\bunder \d+ words\b|\b\d+ words\b|\bconcise\b|\bbrief\b/.test(lower)) {
    constraints.add("Length control requested");
  }
  if (/\bjson\b|\btable\b|\bbullet(s)?\b|\blist\b/.test(lower)) {
    constraints.add("Structured output requested");
  }
  if (/\bcite\b|\bevidence\b|\bsource(s)?\b|\bresearch-backed\b/.test(lower)) {
    constraints.add("Ground claims in cited evidence");
  }
  if (/\bprofessional\b|\bformal\b|\bexecutive\b/.test(lower)) {
    constraints.add("Professional tone");
  }
  if (/\bcompare\b|\brecommend\b|\bevaluate\b/.test(lower)) {
    constraints.add("Explain evaluation criteria");
  }
  if (/\bdo not\b|\bavoid\b|\bexclude\b/.test(lower)) {
    constraints.add("Explicit exclusions present");
  }

  if (constraints.size === 0) {
    constraints.add("No explicit constraints detected");
  }

  return Array.from(constraints);
}

function detectRisks(prompt: string, audience: string, outputFormat: string, constraints: string[]) {
  const risks: string[] = [];

  if (prompt.trim().length < 80) {
    risks.push("Task may be underspecified for reliable output");
  }
  if (audience.includes("not explicitly")) {
    risks.push("Audience is implied rather than explicitly stated");
  }
  if (outputFormat === "Natural-language response") {
    risks.push("Output contract is loose, so format drift is possible");
  }
  if (constraints.includes("No explicit constraints detected")) {
    risks.push("Missing constraints can increase ambiguity");
  }

  if (risks.length === 0) {
    risks.push("Primary risk is ordinary prompt ambiguity rather than a specific formatting failure");
  }

  return risks;
}

function detectMissingInfo(prompt: string, audience: string, outputFormat: string) {
  const lower = prompt.toLowerCase();
  const missing: string[] = [];

  if (audience.includes("not explicitly")) {
    missing.push("Target audience or persona");
  }
  if (outputFormat === "Natural-language response") {
    missing.push("Preferred output structure");
  }
  if (!/\bcriteria\b|\brubric\b|\bsuccess\b|\brecommend\b/.test(lower)) {
    missing.push("Evaluation rubric or decision criteria");
  }
  if (!/\binput\b|\bcontext\b|\bbackground\b|\bdata\b|\bdocument\b|\bflow\b/.test(lower)) {
    missing.push("Available inputs or source material");
  }

  return missing;
}

function deriveTags(prompt: string, analysis: AnalysisSummary) {
  const lower = prompt.toLowerCase();
  const tags = new Set<string>(["prompt-contract", "constraint-check", "clarity-pass"]);

  const rules: Array<[RegExp, string]> = [
    [/\bjson\b/, "json-output"],
    [/\btable\b/, "tabular-format"],
    [/\bsummarize\b|\bsummarise\b|\bsummary\b/, "summarisation"],
    [/\bcompare\b|\bcomparison\b/, "comparative-analysis"],
    [/\brecommend\b|\bdecision\b/, "decision-support"],
    [/\bresearch\b|\bevidence\b|\bcite\b/, "evidence-grounding"],
    [/\bemail\b/, "email-drafting"],
    [/\bcode\b|\bdebug\b|\bbug\b/, "coding-assistant"],
    [/\bexecutive\b|\bstakeholder\b/, "executive-briefing"],
    [/\bteacher\b|\bstudent\b|\blearn\b|\bexplain\b/, "teaching-mode"],
    [/\bfew-shot\b|\bexample\b/, "examples"],
    [/\bplan\b|\bsteps\b|\bchecklist\b/, "stepwise-structure"]
  ];

  for (const [pattern, tag] of rules) {
    if (pattern.test(lower)) {
      tags.add(tag);
    }
  }

  if (analysis.output_format !== "Natural-language response") {
    tags.add("output-contract");
  }
  if (analysis.missing_info.length > 0) {
    tags.add("clarifying-questions");
  }
  if (analysis.risks.some((risk) => risk.includes("ambiguity"))) {
    tags.add("ambiguity-reduction");
  }

  while (tags.size < 6) {
    tags.add(["goal-extraction", "format-discipline", "template-retrieval", "prompt-optimisation"][tags.size % 4]);
  }

  return Array.from(tags).slice(0, 10);
}

function buildOptimisedPrompt(prompt: string, analysis: AnalysisSummary, tags: string[]) {
  const taskTitle = titleCase(extractGoal(prompt));
  const missingLine =
    analysis.missing_info.length > 0
      ? `If critical information is missing, ask up to 3 clarifying questions before completing the task: ${analysis.missing_info.join(", ")}.`
      : "If any requirement is ambiguous, state your assumptions briefly before answering.";

  return [
    "Role",
    `You are a careful AI assistant preparing a high-quality response for ${analysis.audience.toLowerCase()}.`,
    "",
    "Task",
    `${taskTitle}.`,
    "",
    "Context",
    `Start from the user's original request: "${prompt.trim()}". Preserve the intent while reducing ambiguity and improving structure.`,
    "",
    "Constraints",
    ...analysis.constraints.map((item) => `- ${item}`),
    `- Keep the response aligned with these optimisation tags: ${tags.join(", ")}.`,
    "",
    "Output Contract",
    `- Format: ${analysis.output_format}`,
    "- Include a short rationale before the main deliverable when helpful.",
    "- Separate facts, assumptions, and recommendations clearly.",
    "",
    "Quality Checks",
    "- Avoid unsupported claims.",
    "- Keep the answer internally consistent.",
    `- ${missingLine}`
  ].join("\n");
}

function generateDemoOutput(prompt: string): DemoOutput {
  const trimmed = prompt.trim() || DEFAULT_PROMPT;
  const audience = detectAudience(trimmed);
  const outputFormat = detectOutputFormat(trimmed);
  const constraints = detectConstraints(trimmed);
  const analysis: AnalysisSummary = {
    goal: extractGoal(trimmed),
    audience,
    constraints,
    output_format: outputFormat,
    risks: detectRisks(trimmed, audience, outputFormat, constraints),
    missing_info: detectMissingInfo(trimmed, audience, outputFormat)
  };
  const tags = deriveTags(trimmed, analysis);

  return {
    analysis,
    tags,
    optimisedPrompt: buildOptimisedPrompt(trimmed, analysis, tags),
    template: [
      "Role",
      "Task",
      "Context",
      "Constraints",
      "Output Contract",
      "Quality Checks"
    ]
  };
}

function toRows(left: string, right: string) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const length = Math.max(leftLines.length, rightLines.length);

  return Array.from({ length }, (_, index) => ({
    left: leftLines[index] ?? "",
    right: rightLines[index] ?? ""
  }));
}

export function ResearchHeuristicDemo() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [activeTab, setActiveTab] = useState<TabId>("analysis");
  const [result, setResult] = useState<DemoOutput>(() => generateDemoOutput(DEFAULT_PROMPT));

  const diffRows = useMemo(() => toRows(prompt.trim() || DEFAULT_PROMPT, result.optimisedPrompt), [prompt, result]);

  function handleOptimise() {
    setResult(generateDemoOutput(prompt));
    setActiveTab("analysis");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.02fr_1.18fr]">
      <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Prompt input</h3>
          <div className="group relative">
            <span className="inline-flex cursor-help items-center rounded-full border border-violet-300/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100">
              Demo mode: heuristic optimiser
            </span>
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-64 rounded-2xl border border-white/10 bg-[#120d1d] p-3 text-xs leading-relaxed text-violet-100/80 opacity-0 shadow-xl transition group-hover:opacity-100">
              This tool is illustrative. It uses deterministic keyword heuristics and template rules rather than a live model call.
            </div>
          </div>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-violet-100/75">
          Paste a rough prompt, then run the demo pipeline to inspect the extracted contract, retrieved tags, and an
          optimised rewrite.
        </p>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">
          Raw prompt
        </label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-[300px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-violet-50 outline-none transition placeholder:text-violet-200/30 focus:border-violet-300/40 focus:bg-black/45"
          placeholder="Describe the task, audience, constraints, and desired output."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleOptimise}
            className="inline-flex items-center justify-center rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(139,92,246,0.45)] transition hover:bg-violet-400"
          >
            Optimise prompt
          </button>
          <p className="text-xs text-violet-100/60">Deterministic output, no external calls, intended for product illustration.</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-md">
        <div className="mb-5 flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={
                  active
                    ? "rounded-full border border-violet-200/40 bg-violet-500/20 px-3 py-1.5 text-sm font-semibold text-white"
                    : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-violet-100/80 transition hover:bg-white/[0.06] hover:text-white"
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "analysis" ? (
          <div>
            <p className="mb-3 text-sm text-violet-100/70">Heuristic analysis summary</p>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-6 text-violet-100/90">
              {JSON.stringify(result.analysis, null, 2)}
            </pre>
          </div>
        ) : null}

        {activeTab === "optimised" ? (
          <div>
            <p className="mb-3 text-sm text-violet-100/70">Optimised prompt template with explicit sections and output contract</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-6 text-violet-100/90">
              {result.optimisedPrompt}
            </pre>
          </div>
        ) : null}

        {activeTab === "tags" ? (
          <div>
            <p className="mb-3 text-sm text-violet-100/70">Retrieved tags and template slots</p>
            <div className="mb-5 flex flex-wrap gap-2">
              {result.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.template.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-violet-50">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "diff" ? (
          <div>
            <p className="mb-3 text-sm text-violet-100/70">Side-by-side illustrative diff between the raw input and the optimised rewrite</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30">
                <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">
                  Original
                </div>
                <div className="max-h-[420px] overflow-auto px-4 py-3 text-xs leading-6 text-violet-100/85">
                  {diffRows.map((row, index) => (
                    <div key={`left-${index}`} className="border-b border-white/5 py-1.5">
                      {row.left || <span className="opacity-30"> </span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-violet-300/20 bg-violet-500/[0.06]">
                <div className="border-b border-violet-300/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/85">
                  Optimised
                </div>
                <div className="max-h-[420px] overflow-auto px-4 py-3 text-xs leading-6 text-violet-50/95">
                  {diffRows.map((row, index) => (
                    <div key={`right-${index}`} className="border-b border-white/5 py-1.5">
                      {row.right || <span className="opacity-30"> </span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
