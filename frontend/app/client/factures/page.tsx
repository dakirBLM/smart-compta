"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { InvoiceCard } from "@/components/InvoiceCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

export default function ClientFactures() {
  const { t } = useI18n();
  const search = useSearchParams();
  const detailId = search.get("id");
  const [factures, setFactures] = useState<Facture[]>([]);
  const [detail, setDetail] = useState<Facture | null>(null);

  useEffect(() => {
    api.get<Facture[]>("/api/factures/").then(setFactures).catch(() => {});
  }, []);

  useEffect(() => {
    if (detailId) {
      api.get<Facture>(`/api/factures/${detailId}/`).then(setDetail).catch(() => {});
    } else {
      setDetail(null);
    }
  }, [detailId]);

  if (detail) {
    return (
      <ClientShell>
        <Card className="mx-auto max-w-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-brand">
              {t("factureNo")}
              {detail.numero_facture}
            </h2>
            <StatusBadge statut={detail.statut} />
          </div>
          {detail.image_url && (
            <img src={detail.image_url} alt="facture" className="mb-4 rounded-lg" />
          )}
          <dl className="space-y-2 text-sm">
            <Row label={t("date")} value={formatDate(detail.date_facture)} />
            <Row label="HT" value={formatDZD(detail.montant_ht)} />
            <Row label={`TVA ${detail.tva_pourcentage}%`} value={formatDZD(detail.montant_tva)} />
            <Row label="TTC" value={formatDZD(detail.montant_ttc)} />
          </dl>
        </Card>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <h2 className="mb-4 text-lg font-bold text-brand">{t("mesFactures")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {factures.map((f) => (
          <InvoiceCard key={f.id} facture={f} />
        ))}
        {factures.length === 0 && <p className="text-gray-400">{t("aucuneDonnee")}</p>}
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
