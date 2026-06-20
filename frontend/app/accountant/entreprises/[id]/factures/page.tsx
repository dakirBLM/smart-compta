"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDate, formatDZD } from "@/lib/utils";

export default function FacturesAccountantPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [factures, setFactures] = useState<Facture[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<Facture[]>(`/api/factures/?entreprise=${id}`).then(setFactures).catch(() => {});
  }, [id]);

  return (
    <AppShell
      title={t("mesFactures")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-3">Image</th>
              <th className="p-3">{t("factureNo")}</th>
              <th className="p-3">{t("date")}</th>
              <th className="p-3 text-right">TTC</th>
              <th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {factures.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-3">
                  {f.image_url && f.image_url.startsWith("http") ? (
                    <a href={f.image_url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image_url} alt="facture" className="h-12 w-12 rounded object-cover" />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="p-3">{f.numero_facture}</td>
                <td className="p-3">{formatDate(f.date_facture)}</td>
                <td className="p-3 text-right">{formatDZD(f.montant_ttc)}</td>
                <td className="p-3">
                  <StatusBadge statut={f.statut} />
                </td>
              </tr>
            ))}
            {factures.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  {t("aucuneDonnee")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
