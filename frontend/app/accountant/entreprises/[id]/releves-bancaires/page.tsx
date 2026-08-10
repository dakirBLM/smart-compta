"use client";

import { CheckCircle, Landmark, ScanLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BankStatementFlow } from "@/components/BankStatementFlow";
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture, Journal } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn, formatDate, formatDateTime, formatDZD } from "@/lib/utils";

type Tab = "import" | "historique";

export default function RelevesBancairesPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [tab, setTab] = useState<Tab>("import");
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistorique = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Journal[]>(`/api/entreprises/${id}/journaux/`)
      .then((journaux) => {
        const banqueJournaux = journaux.filter((j) => j.type_journal === "banque");
        if (!banqueJournaux.length) return Promise.resolve([] as Ecriture[]);
        return Promise.all(
          banqueJournaux.map((b) =>
            api.get<Ecriture[]>(`/api/entreprises/${id}/journaux/${b.id}/ecritures/`)
          )
        ).then((results) => results.flat());
      })
      .then((list) =>
        setEcritures(
          list
            .filter((e) => e.source === "import")
            .sort((a, b) => (b.date_ecriture || "").localeCompare(a.date_ecriture || ""))
        )
      )
      .catch(() => setEcritures([]))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "historique") loadHistorique();
  }, [tab, loadHistorique]);

  return (
    <AppShell
      title={t("releveBancaire")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("import")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            tab === "import"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-brand border hover:bg-brand/5"
          )}
        >
          <ScanLine size={16} />
          {t("scannerImport")}
        </button>
        <button
          onClick={() => setTab("historique")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            tab === "historique"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-brand border hover:bg-brand/5"
          )}
        >
          <Landmark size={16} />
          {t("historiqueImports")}
        </button>
      </div>

      {tab === "import" && id && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t("importerReleve")}</p>
          <p className="text-xs text-gray-400">{t("formatsAcceptes")}</p>
          <BankStatementFlow entrepriseId={id} onImported={loadHistorique} />
        </div>
      )}

      {tab === "historique" && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-8 w-8 text-brand" />
            </div>
          ) : ecritures.length === 0 ? (
            <Card>
              <p className="py-6 text-center text-gray-400">{t("aucunReleveImporte")}</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {ecritures.map((e) => {
                const lDebit = e.lignes.find((l) => Number(l.montant_debit) > 0);
                const lCredit = e.lignes.find((l) => Number(l.montant_credit) > 0);
                const montant = lDebit ? lDebit.montant_debit : lCredit?.montant_credit || 0;
                const mainLibelle = lDebit?.libelle || lCredit?.libelle || e.fournisseur_client;

                return (
                  <Card key={e.id} className="space-y-3">
                    <div className="flex items-center justify-between gap-4 border-b pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-brand">
                            {e.numero_piece || `#${e.id}`}
                          </span>
                          <CheckCircle size={14} className="text-emerald-600" />
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Validé (Journal Banque)
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium">{mainLibelle}</div>
                        <div className="text-xs text-gray-400">
                          Date opération : {formatDate(e.date_ecriture)} · Importé le {formatDateTime(e.created_at)}
                          {e.fournisseur_client && ` · Tiers : ${e.fournisseur_client}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-brand">{formatDZD(Number(montant))}</div>
                        <div className="text-xs text-gray-400">Écriture N° {e.id}</div>
                      </div>
                    </div>

                    {/* Single accounting table view for history record */}
                    <div className="overflow-x-auto rounded border bg-gray-50/50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-100 text-left text-gray-600">
                            <th className="p-2">Date</th>
                            <th className="p-2">Compte Débit</th>
                            <th className="p-2">Compte Crédit</th>
                            <th className="p-2">Libellé</th>
                            <th className="p-2 text-right">Montant (DZD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-gray-200">
                            <td className="p-2 font-mono text-xs">{formatDate(e.date_ecriture)}</td>
                            <td className="p-2 font-mono font-bold text-blue-700">{lDebit?.numero_compte || "—"}</td>
                            <td className="p-2 font-mono font-bold text-green-700">{lCredit?.numero_compte || "—"}</td>
                            <td className="p-2">{mainLibelle}</td>
                            <td className="p-2 text-right font-mono font-bold">{formatDZD(Number(montant))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
