"use client";

import { forwardRef } from "react";
import {
  ReportEngagementBreakdownChart,
  ReportHorizontalBarChart,
  ReportStackedPromptVolumeChart,
  REPORT_CHART_COLORS
} from "@/lib/statisticsReportCharts";
import type { StatisticsReportData } from "@/lib/statisticsReportTypes";
import { formatSignedPercent } from "@/lib/statisticsReportTypes";

const REPORT_WIDTH_PX = 816;
const CHART_WIDTH = 736;
const NO_DATA = "-";

const cellPad = "5px 6px";
const indentPad = "5px 6px 5px 22px";

function SummaryRow({
  label,
  value,
  change,
  indent = false,
  bold = false
}: {
  label: string;
  value: string;
  change: string;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid #ddd" }}>
      <td style={{ padding: indent ? indentPad : cellPad, fontWeight: bold ? 600 : 400 }}>{label}</td>
      <td style={{ padding: cellPad, textAlign: "right", fontWeight: bold ? 600 : 400 }}>{value}</td>
      <td style={{ padding: cellPad, textAlign: "right", color: "#444" }}>{change}</td>
    </tr>
  );
}

export const StatisticsPrintReport = forwardRef<HTMLDivElement, { data: StatisticsReportData }>(
  function StatisticsPrintReport({ data }, ref) {
    const volChange = data.promptVolumeChange;
    const engagementSlices = [
      {
        label: "Drafting prompt",
        minutes: data.engagementBreakdown.draftingMinutes,
        color: REPORT_CHART_COLORS.drafting
      },
      {
        label: "Waiting for AI",
        minutes: data.engagementBreakdown.waitingMinutes,
        color: REPORT_CHART_COLORS.waiting
      },
      {
        label: "Reading output",
        minutes: data.engagementBreakdown.readingMinutes,
        color: REPORT_CHART_COLORS.reading
      }
    ].filter((s) => s.minutes > 0);

    const legendItems = [
      { on: data.filters.chatgpt, label: "ChatGPT", color: REPORT_CHART_COLORS.chatgpt },
      { on: data.filters.claude, label: "Claude", color: REPORT_CHART_COLORS.claude },
      { on: data.filters.gemini, label: "Gemini", color: REPORT_CHART_COLORS.gemini },
      { on: data.filters.other, label: "Other", color: REPORT_CHART_COLORS.other }
    ].filter((item) => item.on);

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
          boxSizing: "border-box",
          isolation: "isolate",
          position: "relative"
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "#ffffff",
            zIndex: -1
          }}
        />
        <div style={{ borderTop: "2px solid #111", borderBottom: "1px solid #111", padding: "10px 0", marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>Promptly Labs</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>AI Usage and Performance Report</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 10 }}>
          <div>
            <div>
              <strong>Prepared for:</strong> {data.userName}
            </div>
            <div style={{ marginTop: 2 }}>{data.userEmail}</div>
            <div style={{ marginTop: 8 }}>
              <strong>Reporting period:</strong> {data.periodTitle}
            </div>
            <div style={{ color: "#444", marginTop: 2 }}>{data.periodDetail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>
              <strong>Prepared:</strong> {data.generatedAtLabel}
            </div>
            <div style={{ color: "#444", marginTop: 2 }}>Confidential - personal analytics summary</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 6
            }}
          >
            I. Summary
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #222" }}>
                <th style={{ textAlign: "left", padding: cellPad, fontWeight: 600 }}>Metric</th>
                <th style={{ textAlign: "right", padding: cellPad, fontWeight: 600 }}>Current period</th>
                <th style={{ textAlign: "right", padding: cellPad, fontWeight: 600 }}>Change vs prior</th>
              </tr>
            </thead>
            <tbody>
              <SummaryRow
                bold
                label="Prompt volume"
                value={data.promptVolumeTotal.toLocaleString()}
                change={volChange ? formatSignedPercent(volChange.percent) : NO_DATA}
              />
              <SummaryRow
                indent
                label="ChatGPT"
                value={data.promptsByService.chatgpt.toLocaleString()}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Claude"
                value={data.promptsByService.claude.toLocaleString()}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Gemini"
                value={data.promptsByService.gemini.toLocaleString()}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Other"
                value={data.promptsByService.other.toLocaleString()}
                change={NO_DATA}
              />
              <SummaryRow
                bold
                label="Total AI screen time"
                value={`${data.totalScreenTimeMinutes.toLocaleString()} min`}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Drafting prompt"
                value={`${data.engagementBreakdown.draftingMinutes.toLocaleString()} min`}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Waiting for AI"
                value={`${data.engagementBreakdown.waitingMinutes.toLocaleString()} min`}
                change={NO_DATA}
              />
              <SummaryRow
                indent
                label="Reading output"
                value={`${data.engagementBreakdown.readingMinutes.toLocaleString()} min`}
                change={NO_DATA}
              />
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8
            }}
          >
            II. Prompt volume over time
          </div>
          <ReportStackedPromptVolumeChart rows={data.promptTimeline} filters={data.filters} width={CHART_WIDTH} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 9 }}>
            {legendItems.map((item) => (
              <span key={item.label}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: item.color,
                    marginRight: 5,
                    verticalAlign: "middle"
                  }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8
            }}
          >
            III. Screen time by service
          </div>
          <ReportHorizontalBarChart rows={data.screenTimeByService} width={CHART_WIDTH} />
        </div>

        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8
            }}
          >
            IV. Time allocation (all services)
          </div>
          <ReportEngagementBreakdownChart slices={engagementSlices} width={CHART_WIDTH} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 9 }}>
            {engagementSlices.map((slice) => (
              <span key={slice.label}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    background: slice.color,
                    marginRight: 5,
                    verticalAlign: "middle"
                  }}
                />
                {slice.label} ({slice.minutes}m)
              </span>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 8, color: "#666", marginTop: 16, borderTop: "1px solid #ccc", paddingTop: 8 }}>
          Prompt counts reflect observed sends per AI surface in the selected range. Screen-time categories combine
          ChatGPT, Claude, Gemini, and other tracked surfaces. Generated for the account holder&apos;s personal review.
        </p>
      </div>
    );
  }
);

StatisticsPrintReport.displayName = "StatisticsPrintReport";
