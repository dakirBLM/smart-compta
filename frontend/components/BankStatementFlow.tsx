"use client";

import {
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  Landmark,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { ConfidenceBadge, confidenceLevel } from "@/components/ConfidenceBadge";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { ApiError, bankStatementImport, bankStatementUpload } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { BankStatementExtraction, BankStatementImportResult, BankStatementLigne, EcrituresPreviewRow } from "@/lib/types";
import { formatDZD } from "@/lib/utils";

type Phase = "capture" | "loading" | "review" | "success";

const STEPS: { key: string; labelKey: "lectureDocument" | "extractionInfos" | "analyseClassification" | "generationEcritures" }[] = [
  { key: "1", labelKey: "lectureDocument" },
  { key: "2", labelKey: "extractionInfos" },
  { key: "3", labelKey: "analyseClassification" },
  { key: "4", labelKey: "generationEcritures" },
];

const ACCEPTED_ACCEPT = ".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf";
const ACCEPTED_EXT = /\.(pdf|jpe?g|png)$/i;

function isAcceptedFile(f: File): boolean {
  const name = f.name.toLowerCase();
  return (
    f.type === "application/pdf" ||
    f.type === "image/jpeg" ||
    f.type === "image/png" ||
    ACCEPTED_EXT.test(name)
  );
}

function emptyLigne(): BankStatementLigne {
  return {
    date: "",
    libelle: "",
    reference: "",
    sens: "debit",
    montant: 0,
    compte_contrepartie: "",
    tiers: "",
    confiance: undefined,
  };
}

function lowestConfidence(lignes: BankStatementLigne[]): number {
  const scores = lignes
    .map((l) => Number(l.confiance))
    .filter((n) => Number.isFinite(n));
  return scores.length ? Math.min(...scores) : 100;
}

export function BankStatementFlow({
  entrepriseId,
  onImported,
}: {
  entrepriseId: number;
  /** Called after a successful import so the parent can refresh its list. */
  onImported?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [redirectIn, setRedirectIn] = useState(5);
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<BankStatementExtraction | null>(null);
  const [reviewRows, setReviewRows] = useState<EcrituresPreviewRow[]>([]);
  const [stepDone, setStepDone] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [result, setResult] = useState<BankStatementImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const isPdf =
    !!file &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  function acceptFile(f: File) {
    if (!isAcceptedFile(f)) {
      setError("Format non supporté. Utilisez PDF, JPG, JPEG ou PNG.");
      return;
    }
    setError("");
    setFile(f);
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    setPreview(pdf ? null : URL.createObjectURL(f));
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  async function send() {
    if (!file) return;
    setPhase("loading");
    setError("");
    setStepDone(0);
    const timer = setInterval(() => setStepDone((s) => Math.min(s + 1, 3)), 700);
    try {
      const res = await bankStatementUpload(file, entrepriseId);
      clearInterval(timer);
      setStepDone(4);
      setExtraction(res.data);
      setReviewRows(res.ecritures_preview ?? []);
      setPhase("review");
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "Erreur");
      setPhase("capture");
    }
  }

  async function confirm() {
    if (!extraction || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await bankStatementImport(entrepriseId, extraction);
      setResult(res);
      setPhase("success");
      onImported?.();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Erreur lors de l'enregistrement."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPhase("capture");
    setPreview(null);
    setFile(null);
    setExtraction(null);
    setReviewRows([]);
    setError("");
    setRedirectIn(5);
  }

  useEffect(() => {
    if (phase !== "success") return;
    setRedirectIn(5);
    const tick = setInterval(() => setRedirectIn((n) => n - 1), 1000);
    const go = setTimeout(reset, 5000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- CAPTURE ----
  if (phase === "capture")
    return (
      <Card className="mx-auto max-w-xl text-center">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_ACCEPT}
          capture="environment"
          className="hidden"
          onChange={pickFile}
        />
        <input
          ref={importRef}
          type="file"
          accept={ACCEPTED_ACCEPT}
          className="hidden"
          onChange={pickFile}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="relevé bancaire" className="mx-auto mb-4 max-h-80 rounded-lg" />
        ) : file && isPdf ? (
          <div className="mx-auto mb-4 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed text-brand">
            <FileText size={48} />
            <p className="mt-2 max-w-xs truncate px-4 text-sm">{file.name}</p>
            <p className="text-xs text-gray-400">PDF — toutes les pages seront analysées</p>
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="mx-auto mb-4 flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-gray-400"
          >
            <Landmark size={48} />
            <p className="mt-2">{t("importerReleve")}</p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="success" onClick={() => setShowCamera(true)}>
            <Camera size={16} /> Scanner (caméra guidée)
          </Button>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Camera size={16} /> Photo
          </Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload size={16} /> Importer (PDF / Image)
          </Button>
          <Button variant="success" onClick={send} disabled={!file}>
            {t("envoyer")}
          </Button>
        </div>
        {showCamera && (
          <CameraCapture
            onCapture={(f) => {
              setShowCamera(false);
              acceptFile(f);
            }}
            onClose={() => setShowCamera(false)}
          />
        )}
      </Card>
    );

  // ---- LOADING ----
  if (phase === "loading")
    return (
      <Card className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3 text-brand">
          <Spinner className="h-6 w-6" />
          <span className="text-lg font-semibold">{t("extractionEnCours")}</span>
        </div>
        <div className="space-y-3">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              {i < stepDone ? (
                <CheckCircle2 className="text-success" size={20} />
              ) : (
                <Circle className="text-gray-300" size={20} />
              )}
              <span className={i < stepDone ? "text-brand" : "text-gray-400"}>
                {t(s.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );

  // ---- SUCCESS ----
  if (phase === "success")
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CheckCircle2 className="mx-auto mb-3 text-success" size={56} />
        <h2 className="mb-1 text-xl font-bold text-success">{t("releveImporteAvecSucces")}</h2>
        <p className="mb-1 text-sm text-gray-600">
          {result?.ecritures_creees ?? 0} {t("ecrituresGenerees")}
        </p>
        <p className="mb-4 text-sm text-gray-500">Nouveau relevé dans {redirectIn}s…</p>
        <Button variant="outline" onClick={reset}>
          <RotateCcw size={16} /> {t("scannerAutre")}
        </Button>
      </Card>
    );

  // ---- REVIEW ----
  if (!extraction) return null;
  const level = confidenceLevel(lowestConfidence(extraction.lignes));
  const hasLignes = extraction.lignes.length > 0;
  const invalidLignes = extraction.lignes.filter(
    (l) =>
      !l.date ||
      !l.libelle.trim() ||
      !l.compte_contrepartie.trim() ||
      l.compte_contrepartie.trim() === "512000" ||
      !(Number(l.montant) > 0)
  );
  const canConfirm = hasLignes && invalidLignes.length === 0;

  const updateLigne = (i: number, patch: Partial<BankStatementLigne>) => {
    const line = extraction.lignes[i];
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.map((current, idx) => (idx === i ? { ...current, ...patch } : current)),
    });
    setReviewRows((rows) => rows.map((row) => row.ligne_num === i + 1
      ? {
          ...row,
          ...(patch.date !== undefined ? { date: patch.date } : {}),
          ...(patch.libelle !== undefined ? { libelle: patch.libelle } : {}),
          ...(patch.montant !== undefined ? { montant: String(patch.montant) } : {}),
          ...(patch.tiers !== undefined ? { tiers: patch.tiers } : {}),
          ...(patch.sens !== undefined
            ? patch.sens === "debit"
              ? { compte_debit: "512000", compte_credit: line.compte_contrepartie || row.compte_credit }
              : { compte_debit: line.compte_contrepartie || row.compte_debit, compte_credit: "512000" }
            : {}),
        }
      : row));
  };
  const updateAccount = (i: number, side: "debit" | "credit", value: string) => {
    const rowNumber = i + 1;
    const row = reviewRows.find((item) => item.ligne_num === rowNumber);
    const line = extraction.lignes[i];
    if (!row) return;
    let nextDebit = side === "debit" ? value : row.compte_debit;
    let nextCredit = side === "credit" ? value : row.compte_credit;
    if (side === "debit" && value !== "512000" && nextCredit !== "512000") {
      nextCredit = "512000";
    }
    if (side === "credit" && value !== "512000" && nextDebit !== "512000") {
      nextDebit = "512000";
    }
    let sens = line.sens;
    let counterpart = line.compte_contrepartie;
    if (nextDebit === "512000") {
      sens = "debit";
      counterpart = nextCredit;
    } else if (nextCredit === "512000") {
      sens = "credit";
      counterpart = nextDebit;
    } else if (side === "debit") {
      sens = "credit";
      counterpart = nextDebit;
    } else {
      sens = "debit";
      counterpart = nextCredit;
    }
    setReviewRows((rows) => rows.map((item) => item.ligne_num === rowNumber
      ? { ...item, compte_debit: nextDebit, compte_credit: nextCredit }
      : item));
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.map((current, idx) => idx === i
        ? { ...current, sens, compte_contrepartie: counterpart }
        : current),
    });
  };
  const addLigne = () => {
    const rowNumber = extraction.lignes.length + 1;
    setExtraction({ ...extraction, lignes: [...extraction.lignes, emptyLigne()] });
    setReviewRows((rows) => [...rows, {
      date: "",
      libelle: "",
      compte_debit: "512000",
      compte_credit: "",
      montant: "0",
      counterpart: "",
      tiers: "",
      ligne_num: rowNumber,
      sens: "debit",
    }]);
  };
  const removeLigne = (i: number) => {
    const removedRow = i + 1;
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.filter((_, idx) => idx !== i),
    });
    setReviewRows((rows) => rows
      .filter((row) => row.ligne_num !== removedRow)
      .map((row) => row.ligne_num > removedRow ? { ...row, ligne_num: row.ligne_num - 1 } : row));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand">{t("propositionEcriture")}</h2>
          <ConfidenceBadge score={lowestConfidence(extraction.lignes)} />
        </div>
        <div className="grid gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 sm:grid-cols-2">
          <div>
            <span className="block text-xs uppercase tracking-wide">Nom de la banque</span>
            <span className="font-semibold">{extraction.nom_banque}</span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide">Nom de l'entreprise</span>
            <span className="font-semibold">{extraction.nom_entreprise}</span>
          </div>
        </div>
        {level === "yellow" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-warning">
            ⚠ {t("confiance")} moyenne — vérifiez les lignes avant de confirmer.
          </p>
        )}
        {level === "red" && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-danger">
            ⛔ {t("confiance")} faible — révision manuelle complète requise.
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1060px] text-sm">
          <thead className="bg-neutral-950 text-left text-white">
            <tr>
              <th className="w-40 p-3">Date</th>
              <th className="w-36 p-3">Compte Débit</th>
              <th className="w-36 p-3">Compte Crédit</th>
              <th className="p-3">Libellé et intitulé</th>
              <th className="w-44 p-3 text-right">Montant (DZD)</th>
              <th className="w-48 p-3">Tiers / Réf</th>
              <th className="w-12 p-3"></th>
            </tr>
          </thead>
          <tbody>
            {extraction.lignes.map((l, i) => {
              const invalid = invalidLignes.includes(l);
              const row = reviewRows.find((item) => item.ligne_num === i + 1);
              return (
                <tr key={i} className={invalid ? "border-t bg-red-50" : "border-t"}>
                  <td className="p-2">
                    <Input value={l.date} placeholder="JJ/MM/AAAA" onChange={(e) => updateLigne(i, { date: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <Input value={row?.compte_debit ?? ""} aria-label="Compte Débit" onChange={(e) => updateAccount(i, "debit", e.target.value)} />
                  </td>
                  <td className="p-2">
                    <Input value={row?.compte_credit ?? ""} aria-label="Compte Crédit" onChange={(e) => updateAccount(i, "credit", e.target.value)} />
                  </td>
                  <td className="p-2">
                    <Input value={l.libelle} aria-label="Libellé et intitulé" onChange={(e) => updateLigne(i, { libelle: e.target.value })} />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      value={l.montant}
                      onChange={(e) => updateLigne(i, { montant: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={[l.tiers, l.reference].filter(Boolean).join(" / ")}
                      placeholder="Tiers / Réf"
                      aria-label="Tiers / Réf"
                      onChange={(e) => {
                        const [tiers = "", ...referenceParts] = e.target.value.split("/");
                        updateLigne(i, { tiers: tiers.trim(), reference: referenceParts.join("/").trim() });
                      }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => removeLigne(i)} className="text-danger" aria-label="Supprimer">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3">
          <Button variant="ghost" size="sm" onClick={addLigne}>
            <Plus size={15} /> Ligne
          </Button>
          <span className="text-sm text-gray-500">
            {extraction.lignes.length} ligne(s) ·{" "}
            {formatDZD(
              extraction.lignes.reduce((s, l) => s + Number(l.montant || 0), 0)
            )}
          </span>
        </div>
      </Card>

      {!canConfirm && hasLignes && (
        <p className="text-sm font-semibold text-danger">
          Corrigez les lignes en rouge (date, libellé, compte de contrepartie ≠
          512000, montant &gt; 0) avant de confirmer.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={reset}>
          <RotateCcw size={16} /> {t("scannerAutre")}
        </Button>
        <Button variant={canConfirm ? "success" : "warning"} onClick={confirm} disabled={!canConfirm || submitting}>
          {submitting ? <Spinner /> : t("importerCeReleve")}
        </Button>
      </div>
    </div>
  );
}
