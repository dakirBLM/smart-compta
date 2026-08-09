"use client";

import {
  BookOpen,
  CheckCircle,
  ExternalLink,
  Eye,
  Receipt,
  ScanLine,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScannerFlow } from "@/components/ScannerFlow";
import { Button, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { EcritureDetail, Facture } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn, formatDate, formatDateTime, formatDZD } from "@/lib/utils";

/* ─── Mode paiement display ──────────────────────────────────────────────── */
const MODE_LABELS: Record<string, string> = {
  espèces: "💵 Espèces (Caisse)",
  chèque: "🏦 Chèque (Banque)",
  virement: "💸 Virement (Banque)",
  carte: "💳 Carte bancaire (Banque)",
};
function modeLabel(m: string) {
  return MODE_LABELS[m?.toLowerCase()] ?? m ?? "—";
}

type Tab = "scanner" | "clients";

/* ═══════════════════════════════════════════════════════════════════════════
   Modale de détail d'une facture validée
   ═══════════════════════════════════════════════════════════════════════════ */
function FactureDetailModal({
  facture,
  onClose,
}: {
  facture: Facture;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const ecriture: EcritureDetail | null | undefined = facture.ecriture_detail;

  /* Close on overlay click */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* Close on Escape */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const hasImage = facture.image_url?.startsWith("http");

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      style={{ animation: "fadeIn .15s ease" }}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ animation: "slideUp .2s ease" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-brand/5 to-emerald-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
              <BookOpen size={20} className="text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand">
                Facture {facture.numero_facture || `#${facture.id}`}
              </h2>
              <p className="text-xs text-gray-500">
                Comptabilisée le {formatDateTime(facture.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-0 overflow-auto md:flex-row">

          {/* Left — Invoice image */}
          <div className="flex flex-col items-center justify-start border-r bg-gray-50 p-5 md:w-[42%]">
            <p className="mb-3 w-full text-xs font-semibold uppercase tracking-wide text-gray-400">
              Image de la facture
            </p>
            {hasImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={facture.image_url}
                  alt={`Facture ${facture.numero_facture || facture.id}`}
                  className="w-full rounded-xl border object-contain shadow-sm"
                  style={{ maxHeight: 460 }}
                />
                <a
                  href={facture.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                >
                  <ExternalLink size={13} /> Ouvrir en plein écran
                </a>
              </>
            ) : (
              <div className="flex h-56 w-full items-center justify-center rounded-xl border bg-white text-gray-300">
                <Receipt size={48} />
              </div>
            )}

            {/* Quick facture info */}
            <div className="mt-5 w-full space-y-2 rounded-xl border bg-white p-4 text-sm">
              <Row label="N° facture" value={facture.numero_facture || `#${facture.id}`} />
              <Row label="Date" value={formatDate(facture.date_facture)} />
              <Row label="Tiers" value={facture.fournisseur_client || "—"} />
              <Row label="Mode de paiement" value={modeLabel(facture.mode_paiement)} />
              <Divider />
              <Row label="Montant HT"  value={formatDZD(facture.montant_ht)}  />
              <Row label={`TVA (${facture.tva_pourcentage}%)`} value={formatDZD(facture.montant_tva)} />
              <Row label="Montant TTC" value={formatDZD(facture.montant_ttc)} bold />
            </div>
          </div>

          {/* Right — Écriture comptable */}
          <div className="flex flex-1 flex-col p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Écriture comptable associée
            </p>

            {!ecriture ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                Aucune écriture associée.
              </div>
            ) : (
              <div className="space-y-5">
                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3 rounded-xl border bg-gray-50 p-4 text-sm">
                  <MetaCell label="Journal" value={ecriture.journal_nom || `#${ecriture.journal}`} highlight />
                  <MetaCell label="Date d'écriture" value={formatDate(ecriture.date_ecriture)} />
                  <MetaCell label="N° pièce" value={ecriture.numero_piece || "—"} />
                  <MetaCell label="Tiers" value={ecriture.fournisseur_client || "—"} />
                  <MetaCell label="Mode de paiement" value={modeLabel(ecriture.mode_paiement)} />
                  <MetaCell label="Statut" value={
                    ecriture.statut === "valide" ? "✅ Validé" :
                    ecriture.statut === "en_cours" ? "🕐 En cours" : "❌ Rejeté"
                  } />
                </div>

                {/* Lignes d'écriture */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-500">Lignes d'écriture</p>
                  <div className="overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-brand/5 text-left text-xs font-semibold text-brand">
                        <tr>
                          <th className="px-3 py-2.5">Compte</th>
                          <th className="px-3 py-2.5">Libellé</th>
                          <th className="px-3 py-2.5 text-right">Débit</th>
                          <th className="px-3 py-2.5 text-right">Crédit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {ecriture.lignes.map((l, i) => (
                          <tr key={l.id ?? i} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-xs font-bold text-brand">
                              {l.numero_compte}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">{l.libelle || "—"}</td>
                            <td className="px-3 py-2.5 text-right">
                              {Number(l.montant_debit) !== 0
                                ? <span className="font-medium text-blue-700">{formatDZD(l.montant_debit)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {Number(l.montant_credit) !== 0
                                ? <span className="font-medium text-emerald-700">{formatDZD(l.montant_credit)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 text-xs font-bold">
                        <tr className="border-t-2 border-brand/20">
                          <td colSpan={2} className="px-3 py-2.5 text-gray-500">Totaux</td>
                          <td className="px-3 py-2.5 text-right text-blue-700">
                            {formatDZD(ecriture.total_debit)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-700">
                            {formatDZD(ecriture.total_credit)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Balance indicator */}
                  {Math.abs(Number(ecriture.total_debit) - Number(ecriture.total_credit)) < 0.01 ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <CheckCircle size={13} /> Écriture équilibrée
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-medium text-red-500">
                      ⚠ Déséquilibre détecté
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end border-t bg-gray-50/60 px-6 py-3">
          <Button variant="outline" onClick={onClose} className="text-sm">
            Fermer
          </Button>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { transform:translateY(16px); opacity:0 } to { transform:translateY(0); opacity:1 } }
      `}</style>
    </div>
  );
}

/* ─── Tiny helpers ────────────────────────────────────────────────────────── */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className={cn("text-right text-gray-800", bold && "font-bold text-brand")}>{value}</span>
    </div>
  );
}
function Divider() {
  return <hr className="border-gray-100" />;
}
function MetaCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn("mt-0.5 font-semibold", highlight ? "text-brand" : "text-gray-800")}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page principale
   ═══════════════════════════════════════════════════════════════════════════ */
export default function FacturesAccountantPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [tab, setTab] = useState<Tab>("scanner");
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);

  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Modal state */
  const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);

  const fetchFactures = () => {
    if (!id) return;
    setLoading(true);
    api
      .get<Facture[]>(`/api/factures/?entreprise=${id}`)
      .then(setFactures)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFactures();
  }, [id]);

  const handleValidate = async (factureId: number) => {
    setValidatingId(factureId);
    setErrorMsg(null);
    try {
      await api.post(`/api/factures/${factureId}/validate/`, {});
      fetchFactures();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err.message || "Erreur lors de la validation");
    } finally {
      setValidatingId(null);
    }
  };

  const enAttente = factures.filter((f) => f.statut === "en_cours");
  const comptabilisees = factures.filter((f) => f.statut === "valide");

  return (
    <AppShell
      title={t("mesFactures")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {/* ── Tabs ── */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("scanner")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            tab === "scanner"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-brand border hover:bg-brand/5"
          )}
        >
          <ScanLine size={16} />
          {t("scannerImport")}
        </button>
        <button
          onClick={() => setTab("clients")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            tab === "clients"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-brand border hover:bg-brand/5"
          )}
        >
          <Receipt size={16} />
          {t("mesFactures")} {enAttente.length > 0 && `(${enAttente.length} à valider)`}
        </button>
      </div>

      {tab === "scanner" && id && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t("importerFacture")}</p>
          <p className="text-xs text-gray-400">{t("formatsAcceptes")}</p>
          <ScannerFlow entrepriseId={id} annee={annee} />
        </div>
      )}

      {tab === "clients" && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-8 w-8 text-brand" />
            </div>
          ) : (
            <div className="space-y-8">
              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {errorMsg}
                </div>
              )}

              {/* ── Factures en attente de validation ── */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt size={18} className="text-amber-500" />
                    <span className="font-semibold text-brand">
                      Factures à valider par le comptable ({enAttente.length})
                    </span>
                  </div>
                </div>

                {enAttente.length === 0 ? (
                  <Card>
                    <p className="py-4 text-center text-sm text-gray-400">
                      Aucune facture en attente de validation.
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {enAttente.map((f) => (
                      <Card key={f.id} className="flex flex-col justify-between overflow-hidden p-0 border-amber-200 bg-amber-50/20">
                        <div>
                          {f.image_url && f.image_url.startsWith("http") ? (
                            <a href={f.image_url} target="_blank" rel="noopener noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={f.image_url}
                                alt={`Facture ${f.numero_facture || f.id}`}
                                className="h-40 w-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="flex h-40 w-full items-center justify-center bg-gray-100 text-gray-400">
                              <Receipt size={32} />
                            </div>
                          )}
                          <div className="space-y-1 p-3">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-brand">
                                {f.numero_facture || `#${f.id}`}
                              </span>
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                En attente
                              </span>
                            </div>
                            <div className="text-sm font-semibold">{formatDZD(f.montant_ttc)}</div>
                            <div className="text-xs text-gray-600">
                              <span className="font-medium">Tiers:</span> {f.fournisseur_client || "À identifier"}
                            </div>
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Mode:</span> {f.mode_paiement || "Non spécifié"}
                            </div>
                            <div className="text-xs text-gray-500">{formatDate(f.date_facture)}</div>
                          </div>
                        </div>
                        <div className="border-t p-3 bg-white">
                          <Button
                            className="w-full text-xs"
                            variant="success"
                            disabled={validatingId === f.id}
                            onClick={() => handleValidate(f.id)}
                          >
                            {validatingId === f.id ? (
                              <Spinner className="h-4 w-4 text-white" />
                            ) : (
                              "Valider & comptabiliser"
                            )}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Factures comptabilisées ── */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span className="font-semibold text-brand">
                    Factures comptabilisées ({comptabilisees.length})
                  </span>
                </div>
                {comptabilisees.length === 0 ? (
                  <Card>
                    <p className="py-6 text-center text-gray-400">
                      Aucune facture comptabilisée pour le moment.
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {comptabilisees.map((f) => (
                      <Card key={f.id} className="group overflow-hidden p-0 transition-shadow hover:shadow-md">
                        {/* Image */}
                        <div className="relative overflow-hidden">
                          {f.image_url && f.image_url.startsWith("http") ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={f.image_url}
                              alt={`Facture ${f.numero_facture || f.id}`}
                              className="h-44 w-full object-cover transition-transform group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-44 w-full items-center justify-center bg-gray-100 text-gray-400">
                              <Receipt size={32} />
                            </div>
                          )}
                          {/* Hover overlay with "Afficher" button */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => setSelectedFacture(f)}
                              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-brand shadow-lg transition hover:bg-brand hover:text-white"
                            >
                              <Eye size={14} /> Afficher
                            </button>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="space-y-0.5 p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-brand">
                              {f.numero_facture || `#${f.id}`}
                            </span>
                            <CheckCircle size={14} className="text-emerald-600" />
                          </div>
                          <div className="text-sm font-semibold">{formatDZD(f.montant_ttc)}</div>
                          <div className="text-xs text-gray-500">{formatDate(f.date_facture)}</div>
                          <div className="text-[11px] text-gray-400">
                            Comptabilisée le {formatDateTime(f.created_at)}
                          </div>
                        </div>

                        {/* Explicit "Afficher" button below the card */}
                        <div className="border-t px-3 pb-3">
                          <button
                            onClick={() => setSelectedFacture(f)}
                            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand hover:text-white"
                          >
                            <Eye size={13} /> Afficher
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal détail ── */}
      {selectedFacture && (
        <FactureDetailModal
          facture={selectedFacture}
          onClose={() => setSelectedFacture(null)}
        />
      )}
    </AppShell>
  );
}
