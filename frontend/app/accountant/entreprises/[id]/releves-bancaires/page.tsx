"use client";

import { CheckCircle, Download, Landmark, ScanLine } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BankStatementFlow } from "@/components/BankStatementFlow";
import { Card, Spinner } from "@/components/ui";
import {
  api,
  downloadBankStatementSubmission,
  receivedBankStatementSubmissions,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { BankStatementSubmission, Ecriture, Journal } from "@/lib/types";
import { saveBlob } from "@/lib/download";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn, formatDate, formatDateTime, formatDZD } from "@/lib/utils";

type Tab = "import" | "received" | "historique";

/** A bank écriture, tagged with the fiscal year its own journal belongs to
 * (which may differ from the year currently selected in the sidebar). */
type HistoriqueEcriture = Ecriture & { annee: number };

export default function RelevesBancairesPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [tab, setTab] = useState<Tab>("import");
  const [ecritures, setEcritures] = useState<HistoriqueEcriture[]>([]);
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState<BankStatementSubmission[]>([]);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedError, setReceivedError] = useState("");
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<{
    submission: BankStatementSubmission;
    file: File;
  } | null>(null);

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

  const loadReceived = useCallback(() => {
    if (!id) return;
    setReceivedLoading(true);
    setReceivedError("");
    receivedBankStatementSubmissions(id)
      .then(setReceived)
      .catch((error) => setReceivedError(error instanceof Error ? error.message : "Erreur"))
      .finally(() => setReceivedLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "historique") loadHistorique();
  }, [tab, loadHistorique]);

  useEffect(() => {
    if (tab === "received") loadReceived();
  }, [tab, loadReceived]);

  async function downloadSubmission(submission: BankStatementSubmission) {
    setOpeningId(submission.id);
    setReceivedError("");
    try {
      const blob = await downloadBankStatementSubmission(submission.id);
      saveBlob(blob, submission.original_filename);
    } catch (error) {
      setReceivedError(error instanceof Error ? error.message : "Erreur de téléchargement");
    } finally {
      setOpeningId(null);
    }
  }

  async function processSubmission(submission: BankStatementSubmission) {
    setOpeningId(submission.id);
    setReceivedError("");
    try {
      const blob = await downloadBankStatementSubmission(submission.id);
      const filename = submission.original_filename;
      const contentType = filename.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : filename.toLowerCase().endsWith(".png")
          ? "image/png"
          : "image/jpeg";
      setActiveSubmission({
        submission,
        file: new File([blob], filename, { type: contentType }),
      });
    } catch (error) {
      setReceivedError(error instanceof Error ? error.message : "Erreur de téléchargement");
    } finally {
      setOpeningId(null);
    }
  }

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
          onClick={() => setTab("received")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            tab === "received"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-brand border hover:bg-brand/5"
          )}
        >
          <Download size={16} />
          {t("relevesRecus")} {received.filter((item) => item.status === "en_attente").length > 0 &&
            `(${received.filter((item) => item.status === "en_attente").length})`}
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
        <BankStatementFlow entrepriseId={id} onImported={loadHistorique} />
      )}

      {tab === "received" && (
        <div className="space-y-4">
          {receivedError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {receivedError}
            </p>
          )}
          {receivedLoading ? (
            <div className="flex justify-center py-12"><Spinner className="h-8 w-8 text-brand" /></div>
          ) : received.length === 0 ? (
            <Card><p className="py-5 text-center text-sm text-gray-500">{t("aucunReleveRecu")}</p></Card>
          ) : (
            <div className="space-y-3">
              {received.map((submission) => (
                <Card key={submission.id} className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand">{submission.original_filename}</p>
                    <p className="text-xs text-gray-500">
                      {submission.client_username} · {formatDateTime(submission.submitted_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={submission.status === "traite"
                      ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"}
                    >
                      {submission.status === "traite" ? t("releveTraite") : t("releveEnAttente")}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadSubmission(submission)}
                      disabled={openingId !== null}
                      className="rounded-md border px-3 py-2 text-sm font-medium text-brand disabled:opacity-50"
                    >
                      {t("ouvrirReleve")}
                    </button>
                    {submission.status === "en_attente" && (
                      <button
                        type="button"
                        onClick={() => processSubmission(submission)}
                        disabled={openingId !== null}
                        className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {openingId === submission.id ? <Spinner className="h-4 w-4" /> : t("traiterReleve")}
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {activeSubmission && id && (
            <section className="space-y-3 border-t pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-brand">{activeSubmission.submission.original_filename}</h2>
                <button
                  type="button"
                  onClick={() => setActiveSubmission(null)}
                  className="text-sm text-gray-600 underline"
                >
                  {t("annuler")}
                </button>
              </div>
              <BankStatementFlow
                key={activeSubmission.submission.id}
                entrepriseId={id}
                initialFile={activeSubmission.file}
                submissionId={activeSubmission.submission.id}
                onImported={() => {
                  loadReceived();
                  loadHistorique();
                }}
              />
            </section>
          )}
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
