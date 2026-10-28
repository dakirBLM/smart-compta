"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import { ClientShell } from "@/components/ClientShell";
import { FileDropZone } from "@/components/FileDropZone";
import { Button, Card, Spinner } from "@/components/ui";
import {
  clientBankStatementSubmissions,
  clientEntreprises,
  downloadBankStatementSubmission,
  submitClientBankStatement,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { BankStatementSubmission, ClientEntreprise } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function ClientBankStatementsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const detailId = search.get("id");
  const [entreprises, setEntreprises] = useState<ClientEntreprise[]>([]);
  const [entrepriseId, setEntrepriseId] = useState("");
  const [submissions, setSubmissions] = useState<BankStatementSubmission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [loadingEntreprises, setLoadingEntreprises] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    clientEntreprises()
      .then((items) => {
        if (!active) return;
        setEntreprises(items);
        if (items.length) setEntrepriseId(String(items[0].id));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Erreur de chargement.");
      })
      .finally(() => {
        if (active) setLoadingEntreprises(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!entrepriseId) {
      setSubmissions([]);
      return;
    }
    let active = true;
    setLoadingHistory(true);
    clientBankStatementSubmissions(Number(entrepriseId))
      .then((items) => {
        if (active) setSubmissions(items);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Erreur de chargement.");
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [entrepriseId]);

  const detail = detailId
    ? submissions.find((submission) => submission.id === Number(detailId))
    : undefined;

  useEffect(() => {
    if (!detail) {
      setPreviewUrl("");
      setPreviewError("");
      return;
    }

    let active = true;
    let objectUrl = "";
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(true);
    downloadBankStatementSubmission(detail.id)
      .then((blob) => {
        if (!active) return;
        const extension = detail.original_filename.split(".").pop()?.toLowerCase();
        const contentType = extension === "pdf"
          ? "application/pdf"
          : extension === "png"
            ? "image/png"
            : "image/jpeg";
        objectUrl = URL.createObjectURL(new Blob([blob], { type: contentType }));
        setPreviewUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (active) setPreviewError(err instanceof Error ? err.message : "Erreur de téléchargement.");
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detail?.id, previewAttempt]);

  function chooseFile(next: File) {
    setFile(next);
    const pdf = next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf");
    setFilePreview(pdf ? null : URL.createObjectURL(next));
  }

  const statementIsPdf =
    !!file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !entrepriseId || sending) return;
    setError("");
    setSuccess("");
    setSending(true);
    try {
      const submission = await submitClientBankStatement(Number(entrepriseId), file);
      setSubmissions((current) => [submission, ...current]);
      setFile(null);
      setFilePreview(null);
      setSuccess(t("releveEnvoyeSucces"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
    } finally {
      setSending(false);
    }
  }

  if (detailId) {
    const extension = detail?.original_filename.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = extension === "pdf";
    const isImage = ["jpg", "jpeg", "png"].includes(extension);
    const backToList = () => router.push("/client/releves-bancaires");

    return (
      <ClientShell>
        <div className="mx-auto max-w-lg">
          {loadingHistory ? (
            <div className="flex justify-center py-12"><Spinner className="h-7 w-7 text-brand" /></div>
          ) : !detail ? (
            <Card className="text-center">
              <p className="py-4 text-sm text-gray-500">{t("releveIntrouvable")}</p>
              <Button variant="outline" onClick={backToList}>{t("fermer")}</Button>
            </Card>
          ) : (
            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-bold text-brand">
                  {detail.original_filename}
                </h2>
                <button
                  type="button"
                  onClick={backToList}
                  aria-label={t("fermer")}
                  title={t("fermer")}
                  className="shrink-0 rounded-lg p-2 text-brand hover:bg-black/5"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {previewLoading ? (
                  <div className="flex h-64 items-center justify-center"><Spinner className="h-7 w-7 text-brand" /></div>
                ) : previewError ? (
                  <div className="space-y-3 p-6 text-center">
                    <p role="alert" className="text-sm text-red-700">{previewError}</p>
                    <Button variant="outline" onClick={() => setPreviewAttempt((attempt) => attempt + 1)}>
                      {t("reessayer")}
                    </Button>
                  </div>
                ) : previewUrl && isPdf ? (
                  <iframe
                    src={previewUrl}
                    title={detail.original_filename}
                    className="h-[65vh] min-h-80 w-full bg-white"
                  />
                ) : previewUrl && isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={detail.original_filename}
                    className="max-h-[65vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 text-gray-500">
                    <FileText size={40} />
                    <p className="text-sm">{t("apercuIndisponible")}</p>
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-brand"
                  >
                    <ExternalLink size={16} /> {t("ouvrirDocument")}
                  </a>
                  <a
                    href={previewUrl}
                    download={detail.original_filename}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Download size={16} /> {t("telechargerReleve")}
                  </a>
                </div>
              )}

              <dl className="space-y-2 text-sm">
                <Row label={t("nomEntreprise")} value={detail.entreprise_nom} />
                <Row label={t("nomFichier")} value={detail.original_filename} />
                <Row label={t("dateEnvoi")} value={formatDateTime(detail.submitted_at)} />
                <Row label={t("typeFichier")} value={extension.toUpperCase() || "—"} />
                <div className="flex justify-between gap-2 border-b py-1">
                  <dt className="text-gray-500">{t("statut")}</dt>
                  <dd className={detail.status === "traite" ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                    {detail.status === "traite" ? t("releveTraite") : t("releveEnAttente")}
                  </dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold tracking-tight text-[#17221f]">{t("relevesClient")}</h1>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </p>
        )}

        {loadingEntreprises ? (
          <div className="flex justify-center py-10"><Spinner className="h-7 w-7 text-brand" /></div>
        ) : entreprises.length === 0 ? (
          <Card><p className="py-5 text-center text-sm text-gray-500">{t("aucuneEntrepriseAssociee")}</p></Card>
        ) : (
          <>
            <form onSubmit={send} className="mx-auto max-w-xl space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-brand">{t("choisirEntreprise")}</span>
                <select
                  value={entrepriseId}
                  onChange={(event) => setEntrepriseId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#e5e9e6] bg-white px-3 text-sm text-gray-800"
                >
                  {entreprises.map((entreprise) => (
                    <option key={entreprise.id} value={entreprise.id}>{entreprise.nom}</option>
                  ))}
                </select>
              </label>

              <FileDropZone
                title={t("importerReleve")}
                file={file}
                preview={filePreview}
                isPdf={statementIsPdf}
                onFile={chooseFile}
              />

              <div className="flex justify-center">
                <Button type="submit" disabled={!file || sending}>
                  {sending ? <Spinner className="h-4 w-4" /> : t("envoyerAuComptable")}
                </Button>
              </div>
            </form>

            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase text-gray-500">{t("historiqueReleves")}</h2>
              {loadingHistory ? (
                <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand" /></div>
              ) : submissions.length === 0 ? (
                <Card><p className="py-5 text-center text-sm text-gray-500">{t("aucunReleveEnvoye")}</p></Card>
              ) : (
                submissions.map((submission) => (
                  <Card key={submission.id} className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-lime hover:shadow-card-hover">
                    <div className="min-w-0">
                      <a
                        href={`/client/releves-bancaires?id=${submission.id}`}
                        className="block truncate text-sm font-semibold text-brand underline-offset-2 hover:underline"
                      >
                        {submission.original_filename}
                      </a>
                      <p className="text-xs text-gray-500">{t("dateEnvoi")} {formatDateTime(submission.submitted_at)}</p>
                    </div>
                    <span className={submission.status === "traite"
                      ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"}
                    >
                      {submission.status === "traite" ? t("releveTraite") : t("releveEnAttente")}
                    </span>
                  </Card>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}