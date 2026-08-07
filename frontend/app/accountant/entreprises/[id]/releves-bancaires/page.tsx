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
    if (!id || !annee) return;
    setLoading(true);
    api
      .get<Journal[]>(`/api/entreprises/${id}/journaux/?annee=${annee}`)
      .then((journaux) => {
        const banque = journaux.find((j) => j.type_journal === "banque");
        if (!banque) return Promise.resolve([] as Ecriture[]);
        return api.get<Ecriture[]>(
          `/api/entreprises/${id}/journaux/${banque.id}/ecritures/`
        );
      })
      .then((list) =>
        setEcritures(
          list
            .filter((e) => e.source === "import")
            .sort((a, b) => b.date_ecriture.localeCompare(a.date_ecriture))
        )
      )
      .catch(() => setEcritures([]))
      .finally(() => setLoading(false));
  }, [id, annee]);

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
                <Card key={e.id} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand">
                        {e.numero_piece || `#${e.id}`}
                      </span>
                      <CheckCircle size={14} className="text-emerald-600" />
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
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
