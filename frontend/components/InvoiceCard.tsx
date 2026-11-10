"use client";

import { FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

function canDisplayInvoiceImage(value?: string | null) {
  if (!value) return false;
  return [
    "http://",
    "https://",
    "/",
    "data:",
    "blob:",
    "file:",
  ].some((prefix) => value.startsWith(prefix));
}

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
        {canDisplayInvoiceImage(facture.image_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={facture.image_url}
            alt="facture"
            className="h-14 w-14 shrink-0 rounded-xl object-cover border border-gray-200"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-light text-brand">
            <FileText size={22} />
          </div>
        )}
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
          disabled={!facture.image_url}
          aria-label={t("imprimerFacture")}
          title={facture.image_url ? t("imprimerFacture") : t("documentFactureIndisponible")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e9e6] bg-white px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-[#f2f5f3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer size={15} />
          {t("imprimerFacture")}
        </button>
        {!facture.image_url && (
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
