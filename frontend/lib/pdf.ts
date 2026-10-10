"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

/** Generic table -> PDF export used by Balance / Grand Livre / etc. */
export function exportTablePDF(
  title: string,
  head: string[],
  rows: (string | number)[][],
  subtitle?: string
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 25);
  }
  autoTable(doc, {
    head: [head],
    body: rows.map((r) => r.map((c) => String(c))),
    startY: subtitle ? 30 : 24,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [17, 17, 17] },
  });
  doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

function isMobileBrowser() {
  const userAgent = navigator.userAgent;
  return (
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent))
  );
}

export async function exportReportElementPDF(element: HTMLElement, title: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  const filename = `${title.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").trim() || "report"}.pdf`;
  const mobile = isMobileBrowser();
  const marginMm = 10;
  const pageWidthMm = doc.internal.pageSize.getWidth() - marginMm * 2;
  const pageHeightMm = doc.internal.pageSize.getHeight() - marginMm * 2;
  const contentWidthPx = Math.round((pageWidthMm / 25.4) * 96);

  const scale = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    windowWidth: contentWidthPx,
    ignoreElements: (node) => node.classList.contains("print:hidden"),
    onclone: (clonedDocument) => {
      const report = clonedDocument.querySelector<HTMLElement>(".print-report");
      if (!report) return;

      report.style.width = `${contentWidthPx}px`;
      report.style.maxWidth = "none";
      report.style.boxSizing = "border-box";
      report.style.overflow = "visible";
      report.querySelectorAll<HTMLElement>(
        '[class*="overflow-x-auto"], [class*="overflow-hidden"], [class*="overflow-y-auto"]'
      ).forEach((container) => {
        container.style.width = "100%";
        container.style.maxWidth = "100%";
        container.style.overflow = "visible";
      });
      report.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
        table.style.width = "100%";
        table.style.maxWidth = "100%";
        table.style.minWidth = "0";
        table.style.tableLayout = "fixed";
      });
    },
  });

  const sourcePageHeightPx = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);
  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(sourcePageHeightPx, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas context for the PDF export.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height
    );

    if (pageIndex > 0) doc.addPage();
    const pageImageHeight = (sliceHeight / canvas.width) * pageWidthMm;
    doc.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      marginMm,
      marginMm,
      pageWidthMm,
      pageImageHeight,
      undefined,
      "FAST"
    );
    sourceY += sliceHeight;
    pageIndex += 1;
  }

  doc.save(filename);
}
