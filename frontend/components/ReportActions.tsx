"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { exportReportElementPDF } from "@/lib/pdf";

export function ReportActions({
  title,
  excelUrl,
  disabled = false,
}: {
  title: string;
  excelUrl?: string;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("report-print-mode");
    return () => document.body.classList.remove("report-print-mode");
  }, []);

  async function exportPDF() {
    const report = document.querySelector<HTMLElement>(".print-report");
    if (!report) {
      setError("Impossible de trouver le rapport à exporter.");
      return;
    }

    setError(null);
    setExporting(true);
    try {
      await exportReportElementPDF(report, title);
    } catch (cause) {
      console.error("PDF report export failed", cause);
      setError("L’export PDF a échoué. Réessayez.");
    } finally {
      setExporting(false);
    }
  }

  async function exportExcel() {
    if (!excelUrl) return;
    setError(null);
    setExportingExcel(true);
    try {
      await api.download(excelUrl, `${title}.xlsx`);
    } catch (cause) {
      console.error("Excel report export failed", cause);
      setError("L’export Excel a échoué. Réessayez.");
    } finally {
      setExportingExcel(false);
    }
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => window.print()} disabled={disabled}>
        <Printer size={16} />
        Imprimer
      </Button>
      <Button variant="outline" onClick={exportPDF} disabled={disabled || exporting}>
        <Download size={16} />
        {exporting ? "Génération du PDF…" : "Exporter en PDF"}
      </Button>
      {excelUrl && (
        <Button
          variant="outline"
          onClick={exportExcel}
          disabled={disabled || exportingExcel}
        >
          <FileSpreadsheet size={16} />
          {exportingExcel ? "Génération du fichier…" : "Exporter en Excel"}
        </Button>
      )}
      </div>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
