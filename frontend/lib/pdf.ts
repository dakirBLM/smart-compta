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
    headStyles: { fillColor: [30, 42, 120] },
  });
  doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}
