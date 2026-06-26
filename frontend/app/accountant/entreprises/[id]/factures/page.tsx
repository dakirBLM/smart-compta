"use client";

import { CheckCircle, CreditCard, Banknote, Receipt, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScannerFlow } from "@/components/ScannerFlow";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { Button, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture, Ecriture } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn, formatDate, formatDZD } from "@/lib/utils";

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

  const [validating, setValidating] = useState<Facture | null>(null);
  const [modePaiement, setModePaiement] = useState("espèces");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [successEcriture, setSuccessEcriture] = useState<{
    facture: Facture;
    ecriture: Ecriture;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Facture[]>(`/api/factures/?entreprise=${id}`)
      .then(setFactures)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  function reload() {
    if (!id) return;
    api.get<Facture[]>(`/api/factures/?entreprise=${id}`).then(setFactures).catch(() => {});
  }

  function openValidate(f: Facture) {
    setValidating(f);
    setModePaiement(f.mode_paiement || "espèces");
    setError("");
  }

  async function handleValidate() {
    if (!validating) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.post<{ facture: Facture; ecriture: Ecriture }>(
        `/api/factures/${validating.id}/validate/`,
        { mode_paiement: modePaiement }
      );
      setValidating(null);
      setSuccessEcriture(result);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la validation.");
    } finally {
      setSaving(false);
    }
  }

  const isCash = modePaiement === "espèces";

  return (
    <AppShell
      title={t("mesFactures")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {/* Onglets Scanner / Factures clients */}
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
          {t("facturesClients")}
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
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-brand/5 to-transparent flex items-center gap-2">
                <Receipt size={18} className="text-brand" />
                <span className="font-semibold text-brand">
                  {factures.length} facture{factures.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand text-left text-white">
                    <tr>
                      <th className="p-3">{t("factureNo")}</th>
                      <th className="p-3">Client</th>
                      <th className="p-3">{t("date")}</th>
                      <th className="p-3 text-right">HT</th>
                      <th className="p-3 text-right">TVA</th>
                      <th className="p-3 text-right">TTC</th>
                      <th className="p-3">{t("modePaiement")}</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-mono text-xs font-semibold text-brand">
                          {f.numero_facture || `#${f.id}`}
                        </td>
                        <td className="p-3 text-gray-700">{f.client_nom}</td>
                        <td className="p-3 text-gray-500">{formatDate(f.date_facture)}</td>
                        <td className="p-3 text-right font-mono">{formatDZD(f.montant_ht)}</td>
                        <td className="p-3 text-right font-mono text-gray-500">
                          {formatDZD(f.montant_tva)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {formatDZD(f.montant_ttc)}
                        </td>
                        <td className="p-3">
                          {f.mode_paiement ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {f.mode_paiement === "espèces" ? (
                                <Banknote size={12} />
                              ) : (
                                <CreditCard size={12} />
                              )}
                              {f.mode_paiement}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">Non défini</span>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusBadge statut={f.statut} />
                        </td>
                        <td className="p-3">
                          {f.statut === "en_cours" && (
                            <button
                              onClick={() => openValidate(f)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
                            >
                              <CheckCircle size={13} />
                              Valider
                            </button>
                          )}
                          {f.statut === "valide" && f.ecriture && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <CheckCircle size={13} />
                              {t("comptabilise")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {factures.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-400">
                          {t("aucuneDonnee")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={!!validating}
        onClose={() => setValidating(null)}
        title={t("validerFacture")}
      >
        {validating && (
          <div className="space-y-5">
            <div className="rounded-xl bg-gradient-to-br from-brand/5 to-blue-50 border border-brand/20 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Facture N°</span>
                <span className="font-mono font-bold text-brand">
                  {validating.numero_facture || `#${validating.id}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Client</span>
                <span className="font-semibold">{validating.client_nom}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span>{formatDate(validating.date_facture)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-gray-500">Montant TTC</span>
                <span className="text-lg font-bold text-brand">
                  {formatDZD(validating.montant_ttc)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t("modePaiement")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setModePaiement(opt.value)}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                      modePaiement === opt.value
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-gray-200 text-gray-600 hover:border-brand/40"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="text-left leading-tight">
                      {opt.label.replace(opt.icon + " ", "")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`rounded-lg border p-3 text-sm ${
                isCash
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              <div className="font-semibold mb-1">
                {isCash ? "🏧 Journal Caisse" : "🏦 Journal Banque"}
              </div>
              {isCash ? (
                <p className="text-xs">
                  Une écriture sera automatiquement créée dans le <strong>journal Caisse</strong> :
                  <br />
                  Débit <code className="bg-white px-1 rounded">530</code> (Caisse) /{" "}
                  Crédit <code className="bg-white px-1 rounded">411xxx</code> (Client)
                </p>
              ) : (
                <p className="text-xs">
                  Une écriture sera automatiquement créée dans le <strong>journal Banque</strong> :
                  <br />
                  Débit <code className="bg-white px-1 rounded">512</code> (Banque) /{" "}
                  Crédit <code className="bg-white px-1 rounded">411xxx</code> (Client)
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setValidating(null)}>
                {t("annuler")}
              </Button>
              <Button variant="success" onClick={handleValidate} disabled={saving}>
                {saving ? "Validation..." : "✓ Valider et comptabiliser"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!successEcriture}
        onClose={() => setSuccessEcriture(null)}
        title="✅ Facture validée !"
      >
        {successEcriture && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <CheckCircle className="mx-auto mb-2 text-emerald-500" size={40} />
              <p className="font-semibold text-emerald-800">Écriture comptable créée avec succès</p>
              <p className="text-sm text-emerald-600 mt-1">
                Enregistrée dans le journal{" "}
                <strong>
                  {successEcriture.facture.mode_paiement === "espèces" ? "Caisse" : "Banque"}
                </strong>
              </p>
            </div>
            <div className="rounded-lg border divide-y text-sm">
              {successEcriture.ecriture.lignes.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="font-mono font-bold text-brand">{l.numero_compte}</span>
                    <span className="ml-2 text-gray-600">{l.libelle}</span>
                  </div>
                  <div className="text-right font-mono text-xs">
                    {Number(l.montant_debit) > 0 && (
                      <span className="text-blue-600">D: {formatDZD(l.montant_debit)}</span>
                    )}
                    {Number(l.montant_credit) > 0 && (
                      <span className="text-emerald-600">C: {formatDZD(l.montant_credit)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setSuccessEcriture(null)}
            >
              Fermer
            </Button>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
