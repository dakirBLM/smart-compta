"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const mobileWindow = mobile ? window.open("", "_blank") : null;

  try {
    await doc.html(element, {
      x: 10,
      y: 10,
      width: 277,
      windowWidth: Math.max(element.scrollWidth, element.offsetWidth),
      autoPaging: "text",
      html2canvas: {
        backgroundColor: "#ffffff",
        scale: mobile ? Math.min(window.devicePixelRatio || 1, 1.5) : undefined,
        useCORS: true,
        ignoreElements: (node) => node.classList.contains("print:hidden"),
        onclone: (clonedDocument) => {
          const report = clonedDocument.querySelector<HTMLElement>(".print-report");
          if (!report) return;

          report.style.width = "100%";
          report.style.maxWidth = "none";
          report.style.overflow = "visible";
          report.querySelectorAll<HTMLElement>(
            '[class*="overflow-x-auto"], [class*="overflow-hidden"], [class*="overflow-y-auto"]'
          ).forEach((container) => {
            container.style.overflow = "visible";
          });
          report.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
            table.style.width = "100%";
            table.style.minWidth = "0";
          });
        },
      },
    });

    if (mobileWindow) {
      mobileWindow.location.href = URL.createObjectURL(doc.output("blob"));
    } else {
      doc.save(filename);
    }
  } catch (cause) {
    mobileWindow?.close();
    throw cause;
  }
}
