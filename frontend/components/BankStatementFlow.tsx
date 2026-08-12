"use client";

import {
  AlertTriangle,
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
import { useEffect, useRef, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { ConfidenceBadge, confidenceLevel } from "@/components/ConfidenceBadge";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { ApiError, bankStatementImport, bankStatementUpload } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { BankStatementExtraction, BankStatementLigne, Ecriture, EcrituresPreviewRow } from "@/lib/types";
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

/** Single Accounting Row structure for the review screen. */
export interface AccountingOperationRow {
  date: string;
  compte_debit: string;
  compte_credit: string;
  libelle: string;
  montant: number | string;
  tiers: string;
  reference: string;
  confiance?: number;
}

function emptyOperationRow(): AccountingOperationRow {
  return {
    date: new Date().toISOString().split("T")[0],
    compte_debit: "401000",
    compte_credit: "512000",
    libelle: "",
    montant: 0,
    tiers: "",
    reference: "",
  };
}

function lowestConfidence(lignes: AccountingOperationRow[]): number {
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
  const [redirectIn, setRedirectIn] = useState(5);
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [numeroCompte, setNumeroCompte] = useState("");
  const [rows, setRows] = useState<AccountingOperationRow[]>([]);
  const [stepDone, setStepDone] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [savedEcritures, setSavedEcritures] = useState<Ecriture[]>([]);
  const [imageUrl, setImageUrl] = useState("");
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
      setNumeroCompte(res.data.numero_compte || "");
      setImageUrl(res.image_url || "");

      // Prefer the backend-computed accounting preview (ecritures_preview) which
      // already applies classify_operation() rules correctly.
      // Fall back to local reconstruction only when the backend didn't return it.
      const preview: EcrituresPreviewRow[] | undefined = res.ecritures_preview;

      const initialRows: AccountingOperationRow[] = preview && preview.length > 0
        // ── Case 1: backend returned the classified preview ──────────────────
        ? preview.map((p, idx) => {
            const rawLigne: BankStatementLigne = (res.data.lignes || [])[idx] || {};
            const row: AccountingOperationRow = {
              date: p.date || rawLigne.date || "",
              compte_debit: p.compte_debit,
              compte_credit: p.compte_credit,
              libelle: p.libelle || rawLigne.libelle || "",
              montant: rawLigne.montant || 0,
              tiers: rawLigne.tiers || "",
              reference: rawLigne.reference || "",
              confiance: rawLigne.confiance,
            };
            return row;
          })
        // ── Case 2: fallback local reconstruction (mirrors classify_operation) ─
        : (res.data.lignes || []).map((l: BankStatementLigne) => {
            const libNorm = (l.libelle || "")
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase();
            let contrepartie = (l.compte_contrepartie || "").trim();
            let compteDebit = "471000";
            let compteCredit = "512000";

            // Mirror of classify_operation() priority rules
            if (libNorm.includes("VERSEMENT")) {
              compteDebit = "512000"; compteCredit = "581000";
            } else if (libNorm.includes("CHQ RETOUR") || libNorm.includes("CHEQUE RETOUR")) {
              compteDebit = contrepartie.startsWith("401") ? contrepartie : "401000";
              compteCredit = "512000";
            } else if (libNorm.includes("SORT CHQ") || libNorm.includes("SORTIE CHQ")) {
              if (
                ["FRAIS","COMMISSION","AGIOS","TENUE DE COMPTE","TENUE COMPTE","FRAIS DE TENUE",
                 "COTISATION CB","COTISATION CARTE","FRAIS BANCAIRES","INTERETS DEBITEURS"].some(k => libNorm.includes(k)) ||
                contrepartie.startsWith("6")
              ) {
                compteDebit = "627000"; compteCredit = "512000";
              } else if (
                ["REMISE CHQ","REM CHQ","REMISE CHEQUE","ENCAISSEMENT","REGLEMENT CLIENT",
                 "REG CLIENT","VIR CLIENT","VIREMENT CLIENT","CLIENT"].some(k => libNorm.includes(k)) ||
                contrepartie.startsWith("411") || l.sens === "debit"
              ) {
                compteDebit = "512000";
                compteCredit = contrepartie.startsWith("411") ? contrepartie : "411000";
              } else if (
                ["CHQ FOUR","CHEQUE FOUR","VIR FOUR","VIREMENT FOUR","PAIEMENT FOUR",
                 "PAI FOUR","REG FOUR","REGLEMENT FOUR","VIR FOURNISSEUR",
                 "PAIEMENT FOURNISSEUR","REGLEMENT FOURNISSEUR","FOURNISSEUR"].some(k => libNorm.includes(k)) ||
                contrepartie.startsWith("401") || (l.tiers || "").trim() !== ""
              ) {
                compteDebit = contrepartie.startsWith("401") ? contrepartie : "401000";
                compteCredit = "512000";
              } else if (l.sens === "credit") {
                compteDebit = "471000"; compteCredit = "512000";
              } else {
                compteDebit = "512000"; compteCredit = "471000";
              }
            } else if (
              ["CHQ FOUR","CHEQUE FOUR","VIR FOUR","VIREMENT FOUR",
               "PAIEMENT FOUR","PAI FOUR","REG FOUR","REGLEMENT FOUR","VIR FOURNISSEUR",
               "PAIEMENT FOURNISSEUR","REGLEMENT FOURNISSEUR"].some(k => libNorm.includes(k))
            ) {
              compteDebit = contrepartie.startsWith("401") ? contrepartie : "401000";
              compteCredit = "512000";
            } else if (
              ["REMISE CHQ","REM CHQ","REMISE CHEQUE","ENCAISSEMENT","REGLEMENT CLIENT",
               "REG CLIENT","VIR CLIENT","VIREMENT CLIENT"].some(k => libNorm.includes(k))
            ) {
              compteDebit = "512000";
              compteCredit = contrepartie.startsWith("411") ? contrepartie : "411000";
            } else if (
              ["FRAIS","COMMISSION","AGIOS","TENUE DE COMPTE","TENUE COMPTE",
               "FRAIS DE TENUE","COTISATION CB","COTISATION CARTE","FRAIS BANCAIRES",
               "INTERETS DEBITEURS"].some(k => libNorm.includes(k))
            ) {
              compteDebit = "627000"; compteCredit = "512000";
            } else if (contrepartie && contrepartie !== "512000" && /^\d{3,20}$/.test(contrepartie)) {
              if (contrepartie.startsWith("401")) {
                compteDebit = contrepartie; compteCredit = "512000";
              } else if (contrepartie.startsWith("411")) {
                compteDebit = "512000"; compteCredit = contrepartie;
              } else if (l.sens === "credit") {
                compteDebit = contrepartie; compteCredit = "512000";
              } else {
                compteDebit = "512000"; compteCredit = contrepartie;
              }
            } else if (l.sens === "credit") {
              compteDebit = "471000"; compteCredit = "512000";
            } else {
              compteDebit = "512000"; compteCredit = "471000";
            }

            return {
              date: l.date || "",
              compte_debit: compteDebit,
              compte_credit: compteCredit,
              libelle: l.libelle || "",
              montant: l.montant || 0,
              tiers: l.tiers || "",
              reference: l.reference || "",
              confiance: l.confiance,
            };
          });

      setRows(initialRows);
      setPhase("review");
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "Erreur");
      setPhase("capture");
    }
  }

  async function confirm() {
    if (!rows.length || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      // Reconstruct payload for backend import
      const payload: BankStatementExtraction = {
        numero_compte: numeroCompte,
        image_url: imageUrl,
        lignes: rows.map((r) => {
          const isDebit = r.compte_debit.trim().startsWith("512");
          return {
            date: r.date,
            libelle: r.libelle,
            reference: r.reference,
            sens: isDebit ? "debit" : "credit",
            montant: Number(r.montant) || 0,
            compte_contrepartie: isDebit ? r.compte_credit : r.compte_debit,
            tiers: r.tiers,
            confiance: r.confiance,
          };
        }),
      };

      const res = await bankStatementImport(entrepriseId, payload);
      setSavedEcritures(res.ecritures || []);
      setPhase("success");
      onImported?.();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Erreur lors de l'enregistrement. Vérifiez la connexion et réessayez."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPhase("capture");
    setPreview(null);
    setFile(null);
    setNumeroCompte("");
    setRows([]);
    setError("");
    setSavedEcritures([]);
    setImageUrl("");
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
  if (phase === "success") {
    return (
      <Card className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-col items-center">
          <CheckCircle2 className="mb-2 text-success" size={48} />
          <h2 className="text-xl font-bold text-success">{t("releveImporteAvecSucces")}</h2>
          <p className="text-sm text-gray-600">
            {savedEcritures.length} {t("ecrituresGenerees")} enregistrées dans le Journal Banque.
          </p>
          <p className="text-xs text-gray-400">Nouveau relevé dans {redirectIn}s…</p>
        </div>

        {/* Single accounting table of saved entries */}
        <div className="mb-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-brand text-white">
                <th className="p-2 text-left">{t("date")}</th>
                <th className="p-2 text-left">Compte Débit</th>
                <th className="p-2 text-left">Compte Crédit</th>
                <th className="p-2 text-left">{t("libelle")}</th>
                <th className="p-2 text-right">Montant (DZD)</th>
                <th className="p-2 text-left">Tiers</th>
              </tr>
            </thead>
            <tbody>
              {savedEcritures.map((e) => {
                const lDebit = e.lignes.find((l) => Number(l.montant_debit) > 0);
                const lCredit = e.lignes.find((l) => Number(l.montant_credit) > 0);
                const montant = lDebit ? lDebit.montant_debit : lCredit?.montant_credit || 0;
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{e.date_ecriture}</td>
                    <td className="p-2 font-mono font-bold text-blue-700">{lDebit?.numero_compte || "—"}</td>
                    <td className="p-2 font-mono font-bold text-green-700">{lCredit?.numero_compte || "—"}</td>
                    <td className="p-2">{lDebit?.libelle || lCredit?.libelle}</td>
                    <td className="p-2 text-right font-mono font-bold">{formatDZD(Number(montant))}</td>
                    <td className="p-2 text-gray-600">{e.fournisseur_client || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-center">
          <Button variant="outline" onClick={reset}>
            <RotateCcw size={16} /> {t("scannerAutre")}
          </Button>
        </div>
      </Card>
    );
  }

  // ---- REVIEW ----
  if (phase !== "review") return null;

  const level = confidenceLevel(lowestConfidence(rows));
  const hasRows = rows.length > 0;
  const invalidRows = rows.filter(
    (r) =>
      !r.date ||
      !r.libelle.trim() ||
      !r.compte_debit.trim() ||
      !r.compte_credit.trim() ||
      !(Number(r.montant) > 0)
  );

  const missingCompte = rows.filter(
    (r) => r.compte_debit.trim() === "471000" || r.compte_credit.trim() === "471000"
  );
  const canConfirm = hasRows && invalidRows.length === 0;

  const updateRow = (i: number, patch: Partial<AccountingOperationRow>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, emptyOperationRow()]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand">{t("propositionEcriture")}</h2>
          <ConfidenceBadge score={lowestConfidence(rows)} />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          <span>{t("numeroCompteReleve")}</span>
          <span className="font-mono font-semibold">{numeroCompte}</span>
        </div>
        {level === "yellow" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-warning">
            ⚠ {t("confiance")} moyenne — vérifiez les comptes et les montants avant de confirmer.
          </p>
        )}
        {level === "red" && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-danger">
            ⛔ {t("confiance")} faible — révision manuelle complète requise.
          </p>
        )}
        {missingCompte.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {missingCompte.length} ligne(s) utilise(nt) le compte d'attente{" "}
              <strong>471000</strong>. Corrigez le compte si nécessaire.
            </span>
          </div>
        )}
      </Card>

      {/* ─── SINGLE ACCOUNTING TABLE ONLY ─── */}
      <Card className="overflow-x-auto p-0">
        <div className="bg-brand/5 px-4 py-3 border-b">
          <h3 className="text-sm font-bold text-brand">
            Tableau d'écritures comptables — Relevé bancaire
          </h3>
          <p className="text-xs text-gray-500">
            Une ligne par opération bancaire. Compte 512000 = banque.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-2">{t("date")}</th>
              <th className="p-2">Compte Débit</th>
              <th className="p-2">Compte Crédit</th>
              <th className="p-2">{t("libelle")}</th>
              <th className="p-2 text-right">Montant (DZD)</th>
              <th className="p-2">Tiers / Réf</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const invalid = invalidRows.includes(r);
              const isHolding = missingCompte.includes(r);
              return (
                <tr
                  key={i}
                  className={
                    invalid
                      ? "border-t bg-red-50"
                      : isHolding
                      ? "border-t bg-amber-50"
                      : "border-t hover:bg-gray-50"
                  }
                >
                  <td className="p-2 w-32">
                    <Input
                      value={r.date}
                      placeholder="JJ/MM/AAAA"
                      onChange={(e) => updateRow(i, { date: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-32">
                    <Input
                      value={r.compte_debit}
                      className="font-mono font-bold text-blue-700"
                      onChange={(e) => updateRow(i, { compte_debit: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-32">
                    <Input
                      value={r.compte_credit}
                      className="font-mono font-bold text-green-700"
                      onChange={(e) => updateRow(i, { compte_credit: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={r.libelle}
                      onChange={(e) => updateRow(i, { libelle: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-36 text-right">
                    <Input
                      type="number"
                      value={r.montant}
                      className="text-right font-mono font-semibold"
                      onChange={(e) => updateRow(i, { montant: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-36">
                    <Input
                      value={r.tiers}
                      placeholder="Tiers (ex: Fournisseur)"
                      onChange={(e) => updateRow(i, { tiers: e.target.value })}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="text-danger hover:opacity-70"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t bg-gray-50">
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus size={15} /> Ajouter une opération
          </Button>
          <span className="text-sm font-semibold text-brand">
            {rows.length} opération(s) · Total :{" "}
            {formatDZD(
              rows.reduce((s, r) => s + Number(r.montant || 0), 0)
            )}
          </span>
        </div>
      </Card>

      {!canConfirm && hasRows && (
        <p className="text-sm font-semibold text-danger">
          Corrigez les opérations en rouge (date, comptes non vides, montant &gt; 0) avant de confirmer.
        </p>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={reset}>
          <RotateCcw size={16} /> {t("scannerAutre")}
        </Button>
        <Button
          variant={canConfirm ? "success" : "warning"}
          onClick={confirm}
          disabled={!canConfirm || submitting}
          id="btn-confirmer-releve"
        >
          {submitting ? <Spinner /> : t("importerCeReleve")}
        </Button>
      </div>
    </div>
  );
}
