"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

export function InvoiceCard({ facture }: { facture: Facture }) {
  const { t } = useI18n();
  return (
    <Card className="flex items-center justify-between">
      <div>
        <div className="font-semibold text-brand">
          {t("factureNo")}
          {facture.numero_facture || facture.id}
        </div>
        <div className="text-sm text-gray-500">{formatDate(facture.date_facture)}</div>
        <div className="mt-1 text-sm font-medium">{formatDZD(facture.montant_ttc)}</div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <StatusBadge statut={facture.statut} />
        <Link
          href={`/client/factures?id=${facture.id}`}
          className="text-sm text-brand underline"
        >
          {t("voirDetail")}
        </Link>
      </div>
    </Card>
  );
}
