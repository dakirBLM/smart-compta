"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientScanner } from "@/components/ClientScanner";
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
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [panel, setPanel] = useState<"history" | "scan">("scan");

  const load = useCallback(() => {
    api.get<Facture[]>("/api/factures/").then(setFactures).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteFacture = async (id: number) => {
    setDeleteError("");
    setDeletingId(id);
    try {
      await api.del(`/api/factures/${id}/`);
      setFactures((current) => current.filter((facture) => facture.id !== id));
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Erreur lors de la suppression de la facture."
      );
    } finally {
      setDeletingId(null);
    }
  };

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
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-[#214f40]">{t("landingInvoices")}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanel("history")}
              className={`h-10 rounded-full px-4 text-sm font-semibold ${
                panel === "history" ? "bg-[#1f3d35] text-white" : "border border-[#e5e9e6] bg-white text-[#214f40]"
              }`}
            >
              {t("mesFactures")}
            </button>
            <button
              type="button"
              onClick={() => setPanel("scan")}
              className={`h-10 rounded-full px-4 text-sm font-semibold ${
                panel === "scan" ? "bg-[#1f3d35] text-white" : "border border-[#e5e9e6] bg-white text-[#214f40]"
              }`}
            >
              {t("scanner")}
            </button>
          </div>
        </div>
        {panel === "history" && (
          <div className="space-y-3">
            {deleteError && (
              <p role="alert" className="text-sm text-red-700">
                {deleteError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {factures.map((f) => (
                <InvoiceCard
                  key={f.id}
                  facture={f}
                  onDelete={deleteFacture}
                  deleting={deletingId === f.id}
                />
              ))}
              {factures.length === 0 && <p className="text-sm text-[#69736f]">{t("aucuneDonnee")}</p>}
            </div>
          </div>
        )}
        {panel === "scan" && <ClientScanner onSent={load} />}
      </section>
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
