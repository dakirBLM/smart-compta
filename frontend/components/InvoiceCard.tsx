"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InvoiceDocumentPreview } from "@/components/InvoiceDocumentPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { resolveInvoiceFileUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

export function InvoiceCard({
  facture,
  onDelete,
  deleting = false,
}: {
  facture: Facture;
  onDelete?: (id: number) => void;
  deleting?: boolean;
}) {
  const { t } = useI18n();
  const [printError, setPrintError] = useState(false);
  const documentUrl = resolveInvoiceFileUrl(facture.image_url);

  function openPrintView() {
    setPrintError(false);
    const printWindow = window.open(
      `/client/factures/print/${facture.id}`,
      "_blank"
    );
    if (!printWindow) {
      setPrintError(true);
      return;
    }
    printWindow.opener = null;
  }

  return (
    <Card className="flex items-center justify-between p-4 hover:border-lime hover:shadow-card-hover transition-all">
      <div className="flex items-center gap-3.5 min-w-0">
        <InvoiceDocumentPreview
          value={facture.image_url}
          alt="facture"
          className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-200"
          imageClassName="h-full w-full object-cover"
          placeholderClassName="flex h-full w-full items-center justify-center bg-lime-light text-brand"
        />
        <div className="min-w-0">
          <div className="font-bold text-brand text-xs sm:text-sm truncate">
            {t("factureNo")} {facture.numero_facture || `#${facture.id}`}
          </div>
          <div className="text-[11px] text-gray-500">{formatDate(facture.date_facture)}</div>
          <div className="mt-1 text-xs sm:text-sm font-extrabold text-brand">
            {formatDZD(facture.montant_ttc)}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <StatusBadge statut={facture.statut} />
        <button
          type="button"
          onClick={openPrintView}
          disabled={!documentUrl}
          aria-label={t("imprimerFacture")}
          title={documentUrl ? t("imprimerFacture") : t("documentFactureIndisponible")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e9e6] bg-white px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-[#f2f5f3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer size={15} />
          {t("imprimerFacture")}
        </button>
        {!documentUrl && (
          <span className="max-w-36 text-right text-[11px] text-red-700" role="status">
            {t("documentFactureIndisponible")}
          </span>
        )}
        {printError && (
          <span className="max-w-36 text-right text-[11px] text-red-700" role="alert">
            {t("fenetreImpressionBloquee")}
          </span>
        )}
        <Link
          href={`/client/factures?id=${facture.id}`}
          className="text-xs font-semibold text-brand hover:text-emerald-800 underline"
        >
          {t("voirDetail")} →
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(facture.id)}
            disabled={deleting}
            className="text-xs font-semibold text-red-700 underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("supprimer")}
          </button>
        )}
      </div>
    </Card>
  );
}
