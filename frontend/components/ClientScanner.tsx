"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
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
  const [showCamera, setShowCamera] = useState(false);

  const isPdf =
    !!file &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  function acceptFile(f: File) {
    setFile(f);
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (pdf) {
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

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  async function send() {
    if (!file || !quality?.ok) return;
    setPhase("loading");
    setStepDone(0);
    setErrors([]);
    const timer = setInterval(() => setStepDone((s) => Math.min(s + 1, 3)), 700);

    try {
      const res = await scannerUpload(file);
      clearInterval(timer);
      setStepDone(4);
      const data = res.data;
      const confiance = Number(res.confiance ?? data?.confiance ?? 0);

      const totals = data?.lignes?.length
        ? sumLignes(data.lignes)
        : { debit: 0, credit: 0, balanced: true };
      const hasAmounts = totals.debit > 0.009 || totals.credit > 0.009;

      const wrongCompany = (res.erreurs ?? []).some((e) => {
        const s = (e || "").toLowerCase();
        return (
          (s.includes("n'appara") || s.includes("napparaît") || s.includes("ne figure") ||
            s.includes("n'est pas mentionn") || s.includes("par défaut")) &&
          (s.includes("émetteur") || s.includes("emetteur") || s.includes("client") ||
            s.includes("facture"))
        );
      });
      const problems: string[] = [];
      if (!data) {
        problems.push("Aucune donnée renvoyée par l'IA.");
      } else {
        if (wrongCompany)
          problems.push(
            "Cette facture ne semble pas concerner votre entreprise. " +
              "Vérifiez que vous avez choisi le bon fichier."
          );
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

      if (problems.length > 0) {
        setErrors(problems);
        setPhase("error");
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("numero_facture", data.numero_facture ?? "");
      if (data.date_facture) fd.append("date_facture", toISODate(data.date_facture));
      fd.append("montant_ht", String(data.montant_ht ?? 0));
      fd.append("tva_pourcentage", String(data.tva_pourcentage ?? 19));
      fd.append("montant_tva", String(data.montant_tva ?? 0));
      fd.append("montant_ttc", String(data.montant_ttc ?? 0));
      fd.append("confiance_ia", String(confiance));
      fd.append("statut", "valide");
      fd.append("fournisseur_client", data.fournisseur ?? "");
      fd.append("type_facture", String(data.journal).toLowerCase().includes("vente") ? "vente" : "achat");
      fd.append("mode_paiement", data.mode_paiement ?? "");
      fd.append("lignes", JSON.stringify(data.lignes ?? []));
      await api.post("/api/factures/", fd);
      setResult(data);
      setPhase("success");
    } catch (e) {
      clearInterval(timer);
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
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-lime/40 animate-ping opacity-75" />
          <div className="absolute inset-2 rounded-full border-2 border-dashed border-lime animate-spin" />
          <div className="relative flex h-18 w-18 items-center justify-center rounded-full bg-brand shadow-brand-glow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maiase.png" alt="Maiase" className="h-12 w-12 object-contain animate-float" />
          </div>
        </div>

        <h3 className="text-lg font-extrabold text-brand mb-1">
          {t("extractionEnCours")}
        </h3>
        <p className="text-xs text-gray-500 mb-6">
          Maiase analyse votre reçu et transmet à votre comptable…
        </p>

        <div className="space-y-3 rounded-2xl bg-[#F7FAF7] p-5 text-left border border-gray-100">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              {i < stepDone ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lime text-brand">
                  <CheckCircle2 size={16} />
                </div>
              ) : i === stepDone ? (
                <Spinner className="h-5 w-5 text-brand" />
              ) : (
                <Circle className="text-gray-300" size={20} />
              )}
              <span className={i <= stepDone ? "font-bold text-xs text-brand" : "text-xs text-gray-400"}>
                {t(s.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );

  // ---- ERROR ----
  if (phase === "error")
    return (
      <Card className="mx-auto max-w-md text-center p-6">
        <AlertTriangle className="mx-auto mb-3 text-rose-600" size={48} />
        <h2 className="mb-2 text-lg font-bold text-rose-700">
          Facture non acceptée
        </h2>
        <p className="mb-3 text-xs text-gray-600">
          Voici ce qui doit être corrigé avant de renvoyer la photo :
        </p>
        <ul className="mb-4 list-inside list-disc rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-left text-xs font-semibold text-rose-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        <ul className="mb-5 list-inside list-disc rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-left text-xs text-amber-800">
          <li>{t("reglePhotoClaire")}</li>
          <li>{t("reglePhotoSignee")}</li>
        </ul>
        <Button variant="warning" onClick={reset} className="w-full font-bold">
          <RotateCcw size={16} /> Reprendre la photo
        </Button>
      </Card>
    );

  // ---- SUCCESS ----
  if (phase === "success")
    return (
      <Card className="mx-auto max-w-md text-center p-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-lime text-brand shadow-glow">
          <CheckCircle2 size={36} />
        </div>
        <h3 className="text-lg font-extrabold text-brand mb-1">{t("operationValidee")}</h3>
        <p className="mb-5 text-xs text-gray-500">
          Facture transmise avec succès à votre comptable pour vérification finale.
        </p>
        {result && (
          <div className="mx-auto mb-6 max-w-xs space-y-1.5 rounded-2xl bg-[#F7FAF7] p-4 text-left text-xs border border-gray-100">
            <Info label={t("fournisseur")} value={result.fournisseur} />
            <Info label={t("date")} value={result.date_facture} />
            <Info label={t("numeroPiece")} value={result.numero_facture} />
            <Info label="Total TTC" value={formatDZD(result.montant_ttc)} />
            <Info label="Indice de confiance" value={`${result.confiance}%`} />
          </div>
        )}
        <Button variant="primary" onClick={reset} className="w-full font-bold shadow-glow-sm">
          <Plus size={16} /> {t("ajouterAutreFacture")}
        </Button>
      </Card>
    );

  // ---- CAPTURE ----
  return (
    <Card className="mx-auto max-w-md text-center p-6 sm:p-8">
      {/* Maiase chip */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-lime-light/60 border border-lime/30 p-3 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/maiase.png" alt="Maiase" className="h-10 w-10 rounded-xl object-contain bg-white/80 p-0.5 shrink-0 ring-2 ring-lime" />
        <div>
          <div className="text-xs font-bold text-brand">Scanner mobile Maiase</div>
          <p className="text-[11px] text-brand/80 leading-snug">
            Cadrez bien votre reçu ou bon de commande. Les 4 coins doivent être visibles.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={importRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={onPick}
      />
      {preview ? (
        <div className="relative mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="facture" className="mx-auto max-h-80 rounded-2xl border border-gray-200 object-contain shadow-md" />
        </div>
      ) : file && isPdf ? (
        <div className="mx-auto mb-4 flex h-60 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand/30 bg-[#F7FAF7] text-brand">
          <div className="rounded-2xl bg-brand p-3.5 text-lime mb-2 shadow-brand-glow">
            <FileText size={36} />
          </div>
          <p className="max-w-xs truncate px-4 text-xs font-bold text-brand">{file.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">PDF prêt pour transmission</p>
        </div>
      ) : (
        <div
          onClick={() => importRef.current?.click()}
          className="mx-auto mb-4 flex h-60 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-[#F7FAF7] hover:border-lime hover:bg-lime-light/20 transition-all text-gray-500"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-light text-brand shadow-glow-sm mb-2">
            <Camera size={28} />
          </div>
          <p className="font-bold text-brand text-xs">{t("prendrePhoto")}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Appuyez pour ouvrir l&apos;appareil photo</p>
        </div>
      )}

      {quality && !quality.ok && (
        <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs font-semibold text-rose-700">
          {quality.reason} {t("qualiteInsuffisante")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => setShowCamera(true)} className="font-bold shadow-glow-sm">
          <Camera size={16} /> Scanner (Caméra guidée)
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()} className="text-xs font-semibold">
            <Camera size={15} /> Photo
          </Button>
          <Button variant="outline" onClick={() => importRef.current?.click()} className="text-xs font-semibold">
            <Upload size={15} /> Importer
          </Button>
        </div>
        <Button
          variant="primary"
          onClick={send}
          disabled={!file || !quality?.ok}
          className="font-bold mt-1"
        >
          <Sparkles size={16} /> {t("envoyer")} à l&apos;expert-comptable
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
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-gray-100 py-1.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-brand">{value}</span>
    </div>
  );
}

