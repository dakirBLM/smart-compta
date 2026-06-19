"use client";

import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture, LigneEcriture } from "@/lib/types";
import { formatDZD, sumLignes } from "@/lib/utils";

type LigneInput = {
  numero_compte: string;
  libelle: string;
  montant_debit: number;
  montant_credit: number;
};

const emptyLigne = (): LigneInput => ({
  numero_compte: "",
  libelle: "",
  montant_debit: 0,
  montant_credit: 0,
});

// Preset templates for each journal type
const BANQUE_TEMPLATES = [
  {
    label: "Encaissement client (chèque)",
    lignes: [
      { numero_compte: "512", libelle: "Encaissement par chèque", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "411", libelle: "Clients", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Paiement fournisseur",
    lignes: [
      { numero_compte: "401", libelle: "Fournisseurs", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "512", libelle: "Banque", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Remboursement emprunt",
    lignes: [
      { numero_compte: "164", libelle: "Emprunt bancaire", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "661", libelle: "Intérêts d'emprunt", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "512", libelle: "Banque", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Virement bancaire reçu",
    lignes: [
      { numero_compte: "512", libelle: "Virement reçu", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "411", libelle: "Clients", montant_debit: 0, montant_credit: 0 },
    ],
  },
];

const CAISSE_TEMPLATES = [
  {
    label: "Encaissement espèces",
    lignes: [
      { numero_compte: "530", libelle: "Caisse – Encaissement espèces", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "411", libelle: "Clients", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Paiement en espèces",
    lignes: [
      { numero_compte: "401", libelle: "Fournisseurs", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "530", libelle: "Caisse", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Dépense de petite caisse",
    lignes: [
      { numero_compte: "606", libelle: "Achats non stockés", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "530", libelle: "Caisse", montant_debit: 0, montant_credit: 0 },
    ],
  },
];

const OD_TEMPLATES = [
  {
    label: "Facture d'électricité",
    lignes: [
      { numero_compte: "606", libelle: "Facture d'électricité", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "44566", libelle: "TVA déductible", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "401", libelle: "Sonelgaz / Fournisseur", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Facture téléphone / internet",
    lignes: [
      { numero_compte: "626", libelle: "Frais de télécommunication", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "44566", libelle: "TVA déductible", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "401", libelle: "Fournisseur télécom", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Loyer local",
    lignes: [
      { numero_compte: "613", libelle: "Loyer du local", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "44566", libelle: "TVA déductible", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "401", libelle: "Bailleur", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Salaires à payer",
    lignes: [
      { numero_compte: "641", libelle: "Salaires bruts", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "431", libelle: "Sécurité sociale", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "421", libelle: "Personnel – Rémunérations dues", montant_debit: 0, montant_credit: 0 },
    ],
  },
  {
    label: "Amortissement",
    lignes: [
      { numero_compte: "681", libelle: "Dotation aux amortissements", montant_debit: 0, montant_credit: 0 },
      { numero_compte: "28", libelle: "Amortissements", montant_debit: 0, montant_credit: 0 },
    ],
  },
];

const JOURNAL_TEMPLATES: Record<string, typeof BANQUE_TEMPLATES> = {
  banque: BANQUE_TEMPLATES,
  caisse: CAISSE_TEMPLATES,
  od: OD_TEMPLATES,
};

const JOURNAL_COLORS: Record<string, string> = {
  banque: "bg-blue-500",
  caisse: "bg-amber-500",
  od: "bg-purple-500",
};

const JOURNAL_BADGES: Record<string, string> = {
  banque: "🏦 Banque",
  caisse: "💵 Caisse",
  od: "📋 OD",
};

export function EcritureForm({
  initial,
  onSubmit,
  onCancel,
  journalType,
}: {
  initial?: Ecriture;
  onSubmit: (payload: {
    date_ecriture: string;
    numero_piece: string;
    fournisseur_client: string;
    statut: string;
    mode_paiement?: string;
    lignes: LigneEcriture[];
  }) => Promise<void>;
  onCancel: () => void;
  journalType?: string;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(initial?.date_ecriture ?? "");
  const [piece, setPiece] = useState(initial?.numero_piece ?? "");
  const [tiers, setTiers] = useState(initial?.fournisseur_client ?? "");
  const [modePaiement, setModePaiement] = useState(initial?.mode_paiement ?? "");
  const [lignes, setLignes] = useState<LigneInput[]>(
    initial?.lignes.map((l) => ({
      numero_compte: l.numero_compte,
      libelle: l.libelle,
      montant_debit: Number(l.montant_debit),
      montant_credit: Number(l.montant_credit),
    })) ?? [emptyLigne(), emptyLigne()]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const templates = journalType ? JOURNAL_TEMPLATES[journalType] || [] : [];

  const totals = sumLignes(
    lignes.map((l) => ({ debit: l.montant_debit, credit: l.montant_credit }))
  );

  const setLigne = (i: number, patch: Partial<LigneInput>) =>
    setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  function applyTemplate(tpl: (typeof BANQUE_TEMPLATES)[0]) {
    setLignes(tpl.lignes.map((l) => ({ ...l })));
    setShowTemplates(false);
  }

  async function handleSave() {
    setError("");
    if (!totals.balanced) {
      setError(t("debitCreditError"));
      return;
    }
    if (!date) {
      setError(t("date"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        date_ecriture: date,
        numero_piece: piece,
        fournisseur_client: tiers,
        statut: "valide",
        mode_paiement: modePaiement || undefined,
        lignes: lignes
          .filter((l) => l.numero_compte)
          .map((l) => ({
            numero_compte: l.numero_compte,
            libelle: l.libelle,
            montant_debit: l.montant_debit,
            montant_credit: l.montant_credit,
          })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Journal type badge */}
      {journalType && JOURNAL_BADGES[journalType] && (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white ${
              JOURNAL_COLORS[journalType] || "bg-gray-500"
            }`}
          >
            {JOURNAL_BADGES[journalType]}
          </span>
          <span className="text-xs text-gray-400">Nouvelle écriture</span>
        </div>
      )}

      {/* Quick templates */}
      {templates.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowTemplates((s) => !s)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/40 bg-brand/5 px-3 py-1.5 text-sm text-brand hover:bg-brand/10 transition-colors"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showTemplates ? "rotate-180" : ""}`}
            />
            Modèles prédéfinis
          </button>
          {showTemplates && (
            <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-xl border bg-white shadow-lg">
              {templates.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => applyTemplate(tpl)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl border-b last:border-0"
                >
                  <span className="mt-0.5 text-brand">→</span>
                  <div>
                    <div className="font-medium text-gray-800">{tpl.label}</div>
                    <div className="text-xs text-gray-400">
                      {tpl.lignes.map((l) => l.numero_compte).join(" / ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>{t("date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("numeroPiece")}</Label>
          <Input value={piece} onChange={(e) => setPiece(e.target.value)} placeholder="F-001" />
        </div>
        <div>
          <Label>{t("fournisseur")}</Label>
          <Input
            value={tiers}
            onChange={(e) => setTiers(e.target.value)}
            placeholder="Nom tiers"
          />
        </div>
        {(journalType === "banque" || journalType === "caisse") && (
          <div>
            <Label>{t("modePaiement")}</Label>
            <select
              value={modePaiement}
              onChange={(e) => setModePaiement(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              <option value="">— Choisir —</option>
              {journalType === "caisse" && (
                <option value="espèces">💵 Espèces</option>
              )}
              {journalType === "banque" && (
                <>
                  <option value="chèque">🏦 Chèque</option>
                  <option value="virement">💸 Virement</option>
                  <option value="carte">💳 Carte bancaire</option>
                  <option value="prélèvement">📋 Prélèvement</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">{t("compte")}</th>
              <th className="p-2">{t("libelle")}</th>
              <th className="p-2">{t("montantDebit")}</th>
              <th className="p-2">{t("montantCredit")}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-1">
                  <Input
                    value={l.numero_compte}
                    onChange={(e) => setLigne(i, { numero_compte: e.target.value })}
                    placeholder="ex: 512"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={l.libelle}
                    onChange={(e) => setLigne(i, { libelle: e.target.value })}
                    placeholder="Description"
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={l.montant_debit || ""}
                    onChange={(e) =>
                      setLigne(i, { montant_debit: Number(e.target.value) })
                    }
                    placeholder="0"
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={l.montant_credit || ""}
                    onChange={(e) =>
                      setLigne(i, { montant_credit: Number(e.target.value) })
                    }
                    placeholder="0"
                  />
                </td>
                <td className="p-1 text-center">
                  <button
                    onClick={() => setLignes((ls) => ls.filter((_, idx) => idx !== i))}
                    className="text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr className="border-t">
              <td className="p-2" colSpan={2}>
                {t("total")}
              </td>
              <td className="p-2">{formatDZD(totals.debit)}</td>
              <td className="p-2">{formatDZD(totals.credit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLignes((ls) => [...ls, emptyLigne()])}
        >
          <Plus size={16} /> Ligne
        </Button>
        <span
          className={`text-sm font-semibold ${
            totals.balanced ? "text-success" : "text-danger"
          }`}
        >
          {totals.balanced ? "✓ Équilibré" : t("debitCreditError")}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("annuler")}
        </Button>
        <Button
          variant="success"
          onClick={handleSave}
          disabled={saving || !totals.balanced}
        >
          {t("enregistrer")}
        </Button>
      </div>
    </div>
  );
}
