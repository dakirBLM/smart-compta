"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

export function InvoiceCard({ facture }: { facture: Facture }) {
  const { t } = useI18n();
  return (
    <Card className="flex items-center justify-between p-4 hover:border-lime hover:shadow-card-hover transition-all">
      <div className="flex items-center gap-3.5 min-w-0">
        {facture.image_url && facture.image_url.startsWith("http") ? (
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
        <Link
          href={`/client/factures?id=${facture.id}`}
          className="text-xs font-semibold text-brand hover:text-emerald-800 underline"
        >
          {t("voirDetail")} →
        </Link>
      </div>
    </Card>
  );
}

