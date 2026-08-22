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
import { BankStatementExtraction, BankStatementImportResult, BankStatementLigne } from "@/lib/types";
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

  const updateLigne = (i: number, patch: Partial<BankStatementLigne>) =>
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });
  const addLigne = () =>
    setExtraction({ ...extraction, lignes: [...extraction.lignes, emptyLigne()] });
  const removeLigne = (i: number) =>
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.filter((_, idx) => idx !== i),
    });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand">{t("propositionEcriture")}</h2>
          <ConfidenceBadge score={lowestConfidence(extraction.lignes)} />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          <span>{t("numeroCompteReleve")}</span>
          <span className="font-mono font-semibold">{extraction.numero_compte}</span>
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
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-2">{t("date")}</th>
              <th className="p-2">{t("libelle")}</th>
              <th className="p-2">{t("numeroPiece")}</th>
              <th className="p-2">{t("sens")}</th>
              <th className="p-2 text-right">{t("montant")}</th>
              <th className="p-2">{t("compteContrepartie")}</th>
              <th className="p-2">{t("tiers")}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {extraction.lignes.map((l, i) => {
              const invalid = invalidLignes.includes(l);
              return (
                <tr key={i} className={invalid ? "border-t bg-red-50" : "border-t"}>
                  <td className="p-2">
                    <Input value={l.date} placeholder="JJ/MM/AAAA" onChange={(e) => updateLigne(i, { date: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <Input value={l.libelle} onChange={(e) => updateLigne(i, { libelle: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <Input value={l.reference} onChange={(e) => updateLigne(i, { reference: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <select
                      value={l.sens}
                      onChange={(e) => updateLigne(i, { sens: e.target.value as "debit" | "credit" })}
                      className="h-10 w-full rounded-lg border border-gray-300 px-2 text-sm"
                    >
                      <option value="debit">{t("debit")}</option>
                      <option value="credit">{t("credit")}</option>
                    </select>
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
                      value={l.compte_contrepartie}
                      onChange={(e) => updateLigne(i, { compte_contrepartie: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Input value={l.tiers} onChange={(e) => updateLigne(i, { tiers: e.target.value })} />
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
