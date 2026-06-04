export type {
  StatisticsReportData,
  PromptVolumePeriodChange,
  StatisticsReportEngagementBreakdown,
  StatisticsReportSlice,
  StatisticsReportTimelineRow
} from "@/lib/statisticsReportTypes";
export { buildStatisticsReportData, formatSignedPercent } from "@/lib/statisticsReportTypes";

export async function downloadStatisticsReportPdf(element: HTMLElement, filename: string): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf")
  ]);

  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone: (_doc, cloned) => {
      if (!(cloned instanceof HTMLElement)) return;
      cloned.style.background = "#ffffff";
      cloned.querySelectorAll("svg").forEach((svg) => {
        svg.style.background = "#ffffff";
      });
    }
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  let drawW = maxW;
  let drawH = (canvas.height * drawW) / canvas.width;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = (canvas.width * drawH) / canvas.height;
  }
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawW, drawH);
  pdf.save(filename);
}
