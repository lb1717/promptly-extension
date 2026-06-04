"use client";

import { forwardRef } from "react";
import type { StatisticsReportData } from "@/lib/statisticsReportTypes";
import { formatSignedPercent } from "@/lib/statisticsReportTypes";

const REPORT_WIDTH_PX = 816;

function conicGradientFromSlices(
  slices: Array<{ percent: number; color: string }>
): string {
  if (!slices.length) return "#f0f0f0";
  let cursor = 0;
  const stops: string[] = [];
  for (const slice of slices) {
    const end = cursor + slice.percent;
    stops.push(`${slice.color} ${cursor}% ${end}%`);
    cursor = end;
  }
  return `conic-gradient(${stops.join(", ")})`;
}

function SimpleStackedBars({
  rows,
  filters
}: {
  rows: StatisticsReportData["promptTimeline"];
  filters: StatisticsReportData["filters"];
}) {
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const series = [
    { key: "chatgpt" as const, color: "#10a37f", on: filters.chatgpt },
    { key: "claude" as const, color: "#cc785c", on: filters.claude },
    { key: "gemini" as const, color: "#4285f4", on: filters.gemini },
    { key: "other" as const, color: "#64748b", on: filters.other }
  ].filter((s) => s.on);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 88, borderBottom: "1px solid #222" }}>
      {rows.map((row) => {
        const barHeight = Math.max(2, Math.round((row.total / maxTotal) * 80));
        return (
          <div
            key={row.label}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}
          >
            <div style={{ display: "flex", flexDirection: "column-reverse", height: barHeight, width: "100%" }}>
              {series.map((s) => {
                const value = row[s.key];
                if (value <= 0 || row.total <= 0) return null;
                const h = Math.max(1, Math.round((value / row.total) * barHeight));
                return (
                  <div
                    key={s.key}
                    style={{ height: h, backgroundColor: s.color, border: "1px solid #fff" }}
                    title={`${s.key}: ${value}`}
                  />
                );
              })}
            </div>
            <span
              style={{
                fontSize: 7,
                marginTop: 3,
                color: "#333",
                transform: "rotate(-55deg)",
                transformOrigin: "top center",
                whiteSpace: "nowrap"
              }}
            >
              {row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBars({ rows }: { rows: Array<{ label: string; minutes: number; color: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 52, fontSize: 9, textAlign: "right" }}>{row.label}</span>
          <div style={{ flex: 1, height: 10, background: "#f2f2f2", border: "1px solid #ccc" }}>
            <div
              style={{
                width: `${(row.minutes / max) * 100}%`,
                height: "100%",
                backgroundColor: row.color,
                minWidth: row.minutes > 0 ? 2 : 0
              }}
            />
          </div>
          <span style={{ width: 36, fontSize: 9, textAlign: "right" }}>{row.minutes}m</span>
        </div>
      ))}
    </div>
  );
}

export const StatisticsPrintReport = forwardRef<HTMLDivElement, { data: StatisticsReportData }>(
  function StatisticsPrintReport({ data }, ref) {
    const volChange = data.promptVolumeChange;

    return (
      <div
        ref={ref}
        style={{
          width: REPORT_WIDTH_PX,
          background: "#ffffff",
          color: "#111111",
          fontFamily: "var(--font-eb-garamond), Garamond, 'Times New Roman', serif",
          fontSize: 11,
          lineHeight: 1.35,
          padding: "36px 40px 32px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ borderTop: "2px solid #111", borderBottom: "1px solid #111", padding: "10px 0", marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>Promptly Labs</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>Prompt Usage &amp; Performance Report</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 10 }}>
          <div>
            <div>
              <strong>Reporting period:</strong> {data.periodTitle}
            </div>
            <div style={{ color: "#444", marginTop: 2 }}>{data.periodDetail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>
              <strong>Prepared:</strong> {data.generatedAtLabel}
            </div>
            <div style={{ color: "#444", marginTop: 2 }}>Confidential — personal analytics summary</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            I. Executive summary
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 10
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #222" }}>
                <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Metric</th>
                <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 600 }}>Current period</th>
                <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 600 }}>Change vs prior</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px" }}>Estimated prompt volume</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>{data.totals.promptsEstimate.toLocaleString()}</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {volChange ? formatSignedPercent(volChange.percent) : "—"}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px" }}>ChatGPT · Claude · Gemini · Other</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {data.totals.chatgpt} · {data.totals.claude} · {data.totals.gemini} · {data.totals.other}
                </td>
                <td style={{ padding: "5px 6px", textAlign: "right", color: "#444" }}>{data.comparisonLabel}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px" }}>Prompt efficiency index</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {data.promptEfficiencyPercent != null ? formatSignedPercent(data.promptEfficiencyPercent) : "—"}
                </td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>—</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px" }}>Prompt quality index</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {data.promptQualityPercent != null ? formatSignedPercent(data.promptQualityPercent) : "—"}
                </td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>—</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "5px 6px" }}>Pre-improve word count (avg)</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>—</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {data.preImproveWordChangePercent != null
                    ? formatSignedPercent(data.preImproveWordChangePercent)
                    : "—"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "5px 6px" }}>Avg drafting / waiting per send</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                  {data.timeBalance.draftMinutes != null ? `${data.timeBalance.draftMinutes} min` : "—"} /{" "}
                  {data.timeBalance.waitMinutes != null ? `${data.timeBalance.waitMinutes} min` : "—"}
                </td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>—</td>
              </tr>
            </tbody>
          </table>
          {data.totals.promptlySharePercent != null ? (
            <p style={{ fontSize: 9, color: "#444", marginTop: 6 }}>
              Promptly-attributed share of estimated prompts: {data.totals.promptlySharePercent}%
            </p>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              II. Prompt volume
            </div>
            {data.promptTimeline.length ? (
              <SimpleStackedBars rows={data.promptTimeline} filters={data.filters} />
            ) : (
              <p style={{ fontSize: 9, color: "#666" }}>No prompt volume in this period.</p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 8 }}>
              {data.filters.chatgpt ? (
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "#10a37f", marginRight: 4 }} />
                  ChatGPT
                </span>
              ) : null}
              {data.filters.claude ? (
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "#cc785c", marginRight: 4 }} />
                  Claude
                </span>
              ) : null}
              {data.filters.gemini ? (
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "#4285f4", marginRight: 4 }} />
                  Gemini
                </span>
              ) : null}
              {data.filters.other ? (
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "#64748b", marginRight: 4 }} />
                  Other
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              III. Screen time by service
            </div>
            {data.screenTimeByService.length ? (
              <HorizontalBars rows={data.screenTimeByService} />
            ) : (
              <p style={{ fontSize: 9, color: "#666" }}>No screen time recorded.</p>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            IV. Time allocation by service
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", gap: 12 }}>
            {data.engagementByService.map((pie) => (
              <div key={pie.label} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: pie.accent, marginBottom: 4 }}>{pie.label}</div>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    margin: "0 auto",
                    background: conicGradientFromSlices(pie.slices),
                    border: "1px solid #ccc"
                  }}
                />
                <div style={{ fontSize: 9, marginTop: 4 }}>{pie.totalMinutes} min total</div>
                <div style={{ fontSize: 8, color: "#444", marginTop: 2 }}>
                  {pie.slices.map((s) => `${s.name} ${s.percent}%`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 8, color: "#666", marginTop: 16, borderTop: "1px solid #ccc", paddingTop: 8 }}>
          Indices and period comparisons are derived from Promptly telemetry in the selected range. This document is
          generated for the account holder&apos;s personal review and is not a vendor-certified benchmark.
        </p>
      </div>
    );
  }
);

StatisticsPrintReport.displayName = "StatisticsPrintReport";
