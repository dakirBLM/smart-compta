"use client";

import { CheckCircle, Landmark, ScanLine } from "lucide-react";
import Link from "next/link";
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

/** A bank écriture, tagged with the fiscal year its own journal belongs to
 * (which may differ from the year currently selected in the sidebar). */
type HistoriqueEcriture = Ecriture & { annee: number };

export default function RelevesBancairesPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [tab, setTab] = useState<Tab>("import");
  const [ecritures, setEcritures] = useState<HistoriqueEcriture[]>([]);
  const [loading, setLoading] = useState(true);

  // Bank statements are dated by the document, not by whichever fiscal year
  // happens to be selected in the UI — a statement can land in a year that
  // isn't the active one. Scan every exercice so an import is never
  // invisible just because the wrong year is currently selected.
  const loadHistorique = useCallback(() => {
    if (!id || !entreprise) return;
    setLoading(true);
    Promise.all(
      entreprise.exercices.map((ex) =>
        api
          .get<Journal[]>(`/api/entreprises/${id}/journaux/?annee=${ex.annee}`)
          .then((journaux) => {
            const banque = journaux.find((j) => j.type_journal === "banque");
            if (!banque) return [] as HistoriqueEcriture[];
            return api
              .get<Ecriture[]>(`/api/entreprises/${id}/journaux/${banque.id}/ecritures/`)
              .then((list) =>
                list
                  .filter((e) => e.source === "import")
                  .map((e) => ({ ...e, annee: ex.annee }))
              );
          })
          .catch(() => [] as HistoriqueEcriture[])
      )
    )
      .then((perYear) =>
        setEcritures(
          perYear.flat().sort((a, b) => b.date_ecriture.localeCompare(a.date_ecriture))
        )
      )
      .finally(() => setLoading(false));
  }, [id, entreprise]);

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
            <div className="space-y-3">
              {ecritures.map((e) => (
                <Link
                  key={e.id}
                  href={`/accountant/entreprises/${id}/journaux/${e.journal}?annee=${e.annee}`}
                  className="block"
                >
                  <Card className="flex items-center justify-between gap-4 transition-colors hover:border-brand">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand">
                          {e.numero_piece || `#${e.id}`}
                        </span>
                        <CheckCircle size={14} className="text-emerald-600" />
                        {e.annee !== annee && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            Exercice {e.annee}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium">{e.fournisseur_client}</div>
                      <div className="text-xs text-gray-400">
                        {formatDate(e.date_ecriture)} · importé le {formatDateTime(e.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatDZD(e.total_debit)}</div>
                      <div className="text-xs text-gray-400">
                        {e.lignes.map((l) => l.numero_compte).join(" / ")}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
