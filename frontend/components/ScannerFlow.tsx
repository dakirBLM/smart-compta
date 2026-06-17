"use client";

import {
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

export function ScannerFlow({
  entrepriseId,
  annee,
}: {
  entrepriseId: number;
  annee?: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const base = `/accountant/entreprises/${entrepriseId}`;
  const qs = annee ? `?annee=${annee}` : "";
  const [redirectIn, setRedirectIn] = useState(5);
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<AIExtraction | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [stepDone, setStepDone] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const isPdf =
    !!file &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setFile(f);
    // PDFs can't be shown in an <img>; we show a file card instead.
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    setPreview(pdf ? null : URL.createObjectURL(f));
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
    if (!extraction || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/scanner/confirm/", {
        entreprise: entrepriseId,
        data: extraction,
      });
      setPhase("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPhase("capture");
    setPreview(null);
    setFile(null);
    setExtraction(null);
    setErreurs([]);
    setError("");
    setRedirectIn(5);
  }

  // After a successful save, count down and auto-return to the dashboard.
  useEffect(() => {
    if (phase !== "success") return;
    setRedirectIn(5);
    const tick = setInterval(() => setRedirectIn((n) => n - 1), 1000);
    const go = setTimeout(() => router.push(`${base}/dashboard${qs}`), 5000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [phase, router, base, qs]);

  // ---- CAPTURE ----
  if (phase === "capture")
    return (
      <Card className="mx-auto max-w-xl text-center">
        {/* Camera (mobile) */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pickFile}
        />
        {/* PC import — images AND PDFs, no camera */}
        <input
          ref={importRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={pickFile}
        />
        {preview ? (
          <img src={preview} alt="facture" className="mx-auto mb-4 max-h-80 rounded-lg" />
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
            <Camera size={48} />
            <p className="mt-2">{t("prendrePhoto")}</p>
          </div>
        )}
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Camera size={16} /> {t("prendrePhoto")}
          </Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload size={16} /> Importer (PDF/Image)
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
  if (phase === "success" && extraction) {
    const journalType =
      ({ achats: "achat", ventes: "vente", banque: "banque", caisse: "caisse", od: "od" } as Record<string, string>)[
        String(extraction.journal).toLowerCase()
      ] || "achat";
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CheckCircle2 className="mx-auto mb-3 text-success" size={56} />
        <h2 className="mb-1 text-xl font-bold text-success">{t("operationValidee")}</h2>
        <p className="mb-4 text-sm text-gray-500">
          Retour au tableau de bord dans {redirectIn}s…
        </p>
        <div className="mx-auto mb-6 max-w-sm space-y-1 text-left text-sm">
          <Info label={t("fournisseur")} value={extraction.fournisseur} />
          <Info label="Montant" value={formatDZD(extraction.montant_ttc)} />
          <Info label={t("date")} value={extraction.date_facture} />
          <Info label={t("journaux")} value={extraction.journal} />
          <Info label={t("numeroPiece")} value={extraction.numero_facture} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.push(`${base}/journaux/${journalType}${qs}`)}>
            {t("voirOperation")}
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw size={16} /> {t("scannerAutre")}
          </Button>
        </div>
      </Card>
    );
  }

  // ---- REVIEW / EDIT ----
  if (!extraction) return null;
  const level = confidenceLevel(extraction.confiance);
  const totals = sumLignes(extraction.lignes);
  const hasAmounts = totals.debit > 0.009 || totals.credit > 0.009;
  // A valid entry must balance and carry real amounts. AI "erreurs" are often
  // just explanatory notes (e.g. "timbre fiscal ajouté"), so they no longer
  // block a balanced entry — only a broken one (unbalanced / all-zero) does.
  const valid = totals.balanced && hasAmounts;
  const blocked = !valid;
  const canConfirm = level === "green" && valid;

  const updateLigne = (i: number, patch: Partial<AIExtraction["lignes"][0]>) =>
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });
  const addLigne = () =>
    setExtraction({
      ...extraction,
      lignes: [...extraction.lignes, { compte: "", libelle: "", debit: 0, credit: 0 }],
    });
  const removeLigne = (i: number) =>
    setExtraction({
      ...extraction,
      lignes: extraction.lignes.filter((_, idx) => idx !== i),
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
          <div
            className={`mb-3 rounded-lg p-3 text-sm ${
              valid ? "bg-amber-50 text-warning" : "bg-red-50 text-danger"
            }`}
          >
            <div className="mb-1 font-semibold">
              {valid ? "ℹ Remarques de l'IA" : "⛔ Problèmes à corriger"}
            </div>
            <ul className="list-inside list-disc">
              {erreurs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {phase === "edit" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fournisseur")} value={extraction.fournisseur} onChange={(v) => setExtraction({ ...extraction, fournisseur: v })} />
            <Field label={t("date")} value={extraction.date_facture} onChange={(v) => setExtraction({ ...extraction, date_facture: v })} />
            <Field label={t("numeroPiece")} value={extraction.numero_facture} onChange={(v) => setExtraction({ ...extraction, numero_facture: v })} />
            <Field label={t("journaux")} value={extraction.journal} onChange={(v) => setExtraction({ ...extraction, journal: v })} />
            <Field label="Montant HT" type="number" value={String(extraction.montant_ht ?? "")} onChange={(v) => setExtraction({ ...extraction, montant_ht: Number(v) })} />
            <Field label="TVA %" type="number" value={String(extraction.tva_pourcentage ?? "")} onChange={(v) => setExtraction({ ...extraction, tva_pourcentage: Number(v) })} />
            <Field label="Montant TVA" type="number" value={String(extraction.montant_tva ?? "")} onChange={(v) => setExtraction({ ...extraction, montant_tva: Number(v) })} />
            <Field label="Montant TTC" type="number" value={String(extraction.montant_ttc ?? "")} onChange={(v) => setExtraction({ ...extraction, montant_ttc: Number(v) })} />
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
              {phase === "edit" && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {extraction.lignes.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono">
                  {phase === "edit" ? (
                    <Input value={l.compte} onChange={(e) => updateLigne(i, { compte: e.target.value })} />
                  ) : (
                    l.compte
                  )}
                </td>
                <td className="p-2">
                  {phase === "edit" ? (
                    <Input value={l.libelle} onChange={(e) => updateLigne(i, { libelle: e.target.value })} />
                  ) : (
                    l.libelle
                  )}
                </td>
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
                {phase === "edit" && (
                  <td className="p-2 text-center">
                    <button onClick={() => removeLigne(i)} className="text-danger" aria-label="Supprimer">
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
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
        {phase === "edit" && (
          <div className="flex items-center justify-between p-3">
            <Button variant="ghost" size="sm" onClick={addLigne}>
              <Plus size={15} /> Ligne
            </Button>
            <span className={totals.balanced ? "text-sm text-success" : "text-sm font-semibold text-danger"}>
              {totals.balanced ? "✓ Équilibré" : t("debitCreditError")}
            </span>
          </div>
        )}
        {phase !== "edit" && !totals.balanced && (
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
            disabled={blocked || submitting}
          >
            {submitting ? <Spinner /> : t("confirmer")}
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
