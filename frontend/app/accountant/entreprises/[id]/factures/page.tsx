"use client";

import { CheckCircle, Receipt, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScannerFlow } from "@/components/ScannerFlow";
import { Modal } from "@/components/Modal";
import { Button, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture, Ecriture } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn, formatDate, formatDateTime, formatDZD } from "@/lib/utils";

const MODE_OPTIONS = [
  { value: "espèces", label: "💵 Espèces (Caisse)", icon: "💵" },
  { value: "chèque", label: "🏦 Chèque (Banque)", icon: "🏦" },
  { value: "virement", label: "💸 Virement (Banque)", icon: "💸" },
  { value: "carte", label: "💳 Carte bancaire (Banque)", icon: "💳" },
];

type Tab = "scanner" | "clients";

export default function FacturesAccountantPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [tab, setTab] = useState<Tab>("scanner");
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);

  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      {/* Onglets Scanner / Mes factures */}
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

              {/* ---- Factures en attente de validation (scannées par le client) ---- */}
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

              {/* ---- Factures comptabilisées : galerie d'images ---- */}
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
                      <Card key={f.id} className="overflow-hidden p-0">
                        {f.image_url && f.image_url.startsWith("http") ? (
                          <a href={f.image_url} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.image_url}
                              alt={`Facture ${f.numero_facture || f.id}`}
                              className="h-44 w-full object-cover transition-transform hover:scale-[1.03]"
                            />
                          </a>
                        ) : (
                          <div className="flex h-44 w-full items-center justify-center bg-gray-100 text-gray-400">
                            <Receipt size={32} />
                          </div>
                        )}
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
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
