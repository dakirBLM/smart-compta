"use client";

import { Camera, CheckCircle2, Circle, Pencil, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { ConfidenceBadge, confidenceLevel } from "@/components/ConfidenceBadge";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { api, scannerUpload } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { AIExtraction } from "@/lib/types";
import { formatDate, formatDZD, sumLignes } from "@/lib/utils";

type Phase = "capture" | "loading" | "review" | "edit" | "success";

const STEPS: { key: string; labelKey: "lectureDocument" | "extractionInfos" | "analyseClassification" | "generationEcritures" }[] = [
  { key: "1", labelKey: "lectureDocument" },
  { key: "2", labelKey: "extractionInfos" },
  { key: "3", labelKey: "analyseClassification" },
  { key: "4", labelKey: "generationEcritures" },
];

export function ScannerFlow({ entrepriseId }: { entrepriseId: number }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<AIExtraction | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [stepDone, setStepDone] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function send() {
    if (!file) return;
    setPhase("loading");
    setError("");
    setStepDone(0);
    // Animate the visible step checklist while waiting for the webhook.
    const timer = setInterval(() => setStepDone((s) => Math.min(s + 1, 3)), 700);
    try {
      const res = await scannerUpload(file);
      clearInterval(timer);
      setStepDone(4);
      setExtraction(res.data);
      setErreurs(res.erreurs ?? []);
      setPhase("review");
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "Erreur");
      setPhase("capture");
    }
  }

  async function confirm() {
    if (!extraction) return;
    try {
      await api.post("/api/scanner/confirm/", {
        entreprise: entrepriseId,
        data: extraction,
      });
      setPhase("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function reset() {
    setPhase("capture");
    setPreview(null);
    setFile(null);
    setExtraction(null);
    setErreurs([]);
    setError("");
  }

  // ---- CAPTURE ----
  if (phase === "capture")
    return (
      <Card className="mx-auto max-w-xl text-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pickFile}
        />
        {preview ? (
          <img src={preview} alt="facture" className="mx-auto mb-4 max-h-80 rounded-lg" />
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="mx-auto mb-4 flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-gray-400"
          >
            <Camera size={48} />
            <p className="mt-2">{t("prendrePhoto")}</p>
          </div>
        )}
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Camera size={16} /> {t("prendrePhoto")}
          </Button>
          <Button variant="success" onClick={send} disabled={!file}>
            {t("envoyer")}
          </Button>
        </div>
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
  if (phase === "success" && extraction)
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CheckCircle2 className="mx-auto mb-3 text-success" size={56} />
        <h2 className="mb-4 text-xl font-bold text-success">{t("operationValidee")}</h2>
        <div className="mx-auto mb-6 max-w-sm space-y-1 text-left text-sm">
          <Info label={t("fournisseur")} value={extraction.fournisseur} />
          <Info label="Montant" value={formatDZD(extraction.montant_ttc)} />
          <Info label={t("date")} value={extraction.date_facture} />
          <Info label={t("journaux")} value={extraction.journal} />
          <Info label={t("numeroPiece")} value={extraction.numero_facture} />
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw size={16} /> {t("scannerAutre")}
          </Button>
        </div>
      </Card>
    );

  // ---- REVIEW / EDIT ----
  if (!extraction) return null;
  const level = confidenceLevel(extraction.confiance);
  const totals = sumLignes(extraction.lignes);
  const blocked = erreurs.length > 0 || !totals.balanced;
  const canConfirm = level === "green" && !blocked;

  const updateLigne = (i: number, patch: Partial<AIExtraction["lignes"][0]>) =>
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand">{t("propositionEcriture")}</h2>
          <ConfidenceBadge score={extraction.confiance} />
        </div>

        {level === "yellow" && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-warning">
            ⚠ {t("confiance")} moyenne — vérifiez les champs avant de confirmer.
          </p>
        )}
        {level === "red" && (
          <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-danger">
            ⛔ {t("confiance")} faible — révision manuelle complète requise.
          </p>
        )}
        {erreurs.length > 0 && (
          <ul className="mb-3 list-inside list-disc rounded-lg bg-red-50 p-3 text-sm text-danger">
            {erreurs.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {phase === "edit" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fournisseur")} value={extraction.fournisseur} onChange={(v) => setExtraction({ ...extraction, fournisseur: v })} />
            <Field label={t("date")} value={extraction.date_facture} onChange={(v) => setExtraction({ ...extraction, date_facture: v })} />
            <Field label={t("numeroPiece")} value={extraction.numero_facture} onChange={(v) => setExtraction({ ...extraction, numero_facture: v })} />
            <Field label={t("journaux")} value={extraction.journal} onChange={(v) => setExtraction({ ...extraction, journal: v })} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label={t("fournisseur")} value={extraction.fournisseur} />
            <Info label={t("date")} value={formatDate(extraction.date_facture)} />
            <Info label={t("numeroPiece")} value={extraction.numero_facture} />
            <Info label={t("journaux")} value={extraction.journal} />
            <Info label="HT" value={formatDZD(extraction.montant_ht)} />
            <Info label={`TVA ${extraction.tva_pourcentage}%`} value={formatDZD(extraction.montant_tva)} />
            <Info label="TTC" value={formatDZD(extraction.montant_ttc)} />
          </div>
        )}
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-2">{t("compte")}</th>
              <th className="p-2">{t("libelle")}</th>
              <th className="p-2 text-right">{t("montantDebit")}</th>
              <th className="p-2 text-right">{t("montantCredit")}</th>
            </tr>
          </thead>
          <tbody>
            {extraction.lignes.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono">{l.compte}</td>
                <td className="p-2">{l.libelle}</td>
                <td className="p-2 text-right">
                  {phase === "edit" ? (
                    <Input type="number" value={l.debit || ""} onChange={(e) => updateLigne(i, { debit: Number(e.target.value) })} />
                  ) : (
                    l.debit > 0 && formatDZD(l.debit)
                  )}
                </td>
                <td className="p-2 text-right">
                  {phase === "edit" ? (
                    <Input type="number" value={l.credit || ""} onChange={(e) => updateLigne(i, { credit: Number(e.target.value) })} />
                  ) : (
                    l.credit > 0 && formatDZD(l.credit)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className="p-2" colSpan={2}>{t("total")}</td>
              <td className="p-2 text-right">{formatDZD(totals.debit)}</td>
              <td className="p-2 text-right">{formatDZD(totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
        {!totals.balanced && (
          <p className="p-3 text-sm font-semibold text-danger">{t("debitCreditError")}</p>
        )}
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={reset}>
          <RotateCcw size={16} /> {t("scannerAutre")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPhase(phase === "edit" ? "review" : "edit")}
          >
            <Pencil size={16} /> {t("modifier")}
          </Button>
          <Button
            variant={canConfirm ? "success" : "warning"}
            onClick={confirm}
            disabled={blocked || (level === "red" && phase !== "edit")}
          >
            {t("confirmer")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
