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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Facture[]>(`/api/factures/?entreprise=${id}`)
      .then(setFactures)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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
          {t("mesFactures")}
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
