"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Spinner } from "@/components/ui";
import { api, scannerUpload } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { AIExtraction } from "@/lib/types";
import { formatDZD, sumLignes, toISODate } from "@/lib/utils";

type Phase = "capture" | "loading" | "error" | "success";

interface Quality {
  ok: boolean;
  reason?: string;
}

/** Lightweight client-side quality gate before the photo can be sent. */
function checkQuality(file: File, width: number, height: number): Quality {
  if (file.size < 30_000) return { ok: false, reason: "Fichier trop petit / flou." };
  if (width < 600 || height < 600)
    return { ok: false, reason: "Résolution insuffisante." };
  return { ok: true };
}

const STEPS: {
  key: string;
  labelKey: "lectureDocument" | "extractionInfos" | "analyseClassification" | "generationEcritures";
}[] = [
  { key: "1", labelKey: "lectureDocument" },
  { key: "2", labelKey: "extractionInfos" },
  { key: "3", labelKey: "analyseClassification" },
  { key: "4", labelKey: "generationEcritures" },
];

export function ClientScanner() {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [stepDone, setStepDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<AIExtraction | null>(null);

  const isPdf =
    !!file &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (pdf) {
      // PDFs skip the image quality check (backend renders all pages).
      setPreview(null);
      setQuality({ ok: true });
      return;
    }
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new Image();
    img.onload = () => setQuality(checkQuality(f, img.width, img.height));
    img.src = url;
  }

  async function send() {
    if (!file || !quality?.ok) return;
    setPhase("loading");
    setStepDone(0);
    setErrors([]);
    const timer = setInterval(() => setStepDone((s) => Math.min(s + 1, 3)), 700);

    try {
      // 1) Send the photo to the AI and WAIT for the full extraction.
      const res = await scannerUpload(file);
      clearInterval(timer);
      setStepDone(4);
      const data = res.data;
      const confiance = Number(res.confiance ?? data?.confiance ?? 0);

      // 2) Block only on REAL problems (unreadable / low confidence / broken
      //    accounting), not on the AI's explanatory notes in `erreurs`.
      const totals = data?.lignes?.length
        ? sumLignes(data.lignes)
        : { debit: 0, credit: 0, balanced: true };
      const hasAmounts = totals.debit > 0.009 || totals.credit > 0.009;
      const problems: string[] = [];
      if (!data) {
        problems.push("Aucune donnée renvoyée par l'IA.");
      } else {
        if (confiance < 60)
          problems.push(
            confiance > 0
              ? `Confiance trop faible (${confiance}%). ${t("qualiteInsuffisante")}`
              : t("qualiteInsuffisante")
          );
        if (!hasAmounts)
          problems.push(
            "Aucun montant n'a pu être lu. Reprenez une photo plus nette."
          );
        if (data.lignes?.length && !totals.balanced)
          problems.push(t("debitCreditError"));
      }

      // 3) If anything is wrong, tell the user exactly what — no false success.
      if (problems.length > 0) {
        setErrors(problems);
        setPhase("error");
        return;
      }

      // 4) Good result → persist the facture, THEN show success.
      await api.post("/api/factures/", {
        numero_facture: data.numero_facture ?? "",
        date_facture: data.date_facture ? toISODate(data.date_facture) : null,
        montant_ht: data.montant_ht ?? 0,
        tva_pourcentage: data.tva_pourcentage ?? 19,
        montant_tva: data.montant_tva ?? 0,
        montant_ttc: data.montant_ttc ?? 0,
        confiance_ia: confiance,
        image_url: "(image téléversée)",
        statut: "en_cours",
      });
      setResult(data);
      setPhase("success");
    } catch (e) {
      clearInterval(timer);
      // Webhook / network / server error — surface the real message.
      setErrors([e instanceof Error ? e.message : "Erreur inconnue."]);
      setPhase("error");
    }
  }

  function reset() {
    setPhase("capture");
    setPreview(null);
    setFile(null);
    setQuality(null);
    setErrors([]);
    setResult(null);
  }

  // ---- LOADING: wait for the AI, show progress ----
  if (phase === "loading")
    return (
      <Card className="mx-auto max-w-md">
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

  // ---- ERROR: do NOT say success; show exactly what went wrong ----
  if (phase === "error")
    return (
      <Card className="mx-auto max-w-md text-center">
        <AlertTriangle className="mx-auto mb-3 text-danger" size={52} />
        <h2 className="mb-2 text-lg font-bold text-danger">
          Facture non acceptée
        </h2>
        <p className="mb-3 text-sm text-gray-600">
          Voici ce qui doit être corrigé avant de renvoyer la photo :
        </p>
        <ul className="mb-5 list-inside list-disc rounded-lg bg-red-50 p-3 text-left text-sm text-danger">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        <ul className="mb-5 list-inside list-disc rounded-lg bg-amber-50 p-3 text-left text-xs text-warning">
          <li>{t("reglePhotoClaire")}</li>
          <li>{t("reglePhotoSignee")}</li>
        </ul>
        <Button variant="warning" onClick={reset}>
          <RotateCcw size={16} /> Reprendre la photo
        </Button>
      </Card>
    );

  // ---- SUCCESS: only reached when the AI data is genuinely good ----
  if (phase === "success")
    return (
      <Card className="mx-auto max-w-md text-center">
        <CheckCircle2 className="mx-auto mb-3 text-success" size={56} />
        <p className="mb-4 font-semibold text-success">{t("operationValidee")}</p>
        {result && (
          <div className="mx-auto mb-5 max-w-xs space-y-1 text-left text-sm">
            <Info label={t("fournisseur")} value={result.fournisseur} />
            <Info label={t("date")} value={result.date_facture} />
            <Info label={t("numeroPiece")} value={result.numero_facture} />
            <Info label="TTC" value={formatDZD(result.montant_ttc)} />
            <Info label={t("confiance")} value={`${result.confiance}%`} />
          </div>
        )}
        <Button variant="outline" onClick={reset}>
          <Plus size={16} /> {t("ajouterAutreFacture")}
        </Button>
      </Card>
    );

  // ---- CAPTURE ----
  return (
    <Card className="mx-auto max-w-md text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={importRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onPick}
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

      <ul className="mb-3 list-inside list-disc rounded-lg bg-red-50 p-3 text-left text-sm text-danger">
        <li>{t("reglePhotoClaire")}</li>
        <li>{t("reglePhotoSignee")}</li>
      </ul>

      {quality && !quality.ok && (
        <p className="mb-3 text-sm font-medium text-danger">
          {quality.reason} {t("qualiteInsuffisante")}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Camera size={16} /> {t("prendrePhoto")}
        </Button>
        <Button variant="outline" onClick={() => importRef.current?.click()}>
          <Upload size={16} /> Importer (PDF/Image)
        </Button>
        <Button
          variant="success"
          onClick={send}
          disabled={!file || !quality?.ok}
        >
          {t("envoyer")}
        </Button>
      </div>
    </Card>
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
