"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { SCF_ACCOUNTS } from "@/lib/algeria";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture, LigneEcriture } from "@/lib/types";
import { formatDZD, sumLignes } from "@/lib/utils";

type LigneInput = { numero_compte: string; libelle: string; montant_debit: number; montant_credit: number };

const emptyLigne = (): LigneInput => ({
  numero_compte: "",
  libelle: "",
  montant_debit: 0,
  montant_credit: 0,
});

export function EcritureForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Ecriture;
  onSubmit: (payload: {
    date_ecriture: string;
    numero_piece: string;
    fournisseur_client: string;
    statut: string;
    lignes: LigneEcriture[];
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(initial?.date_ecriture ?? "");
  const [piece, setPiece] = useState(initial?.numero_piece ?? "");
  const [tiers, setTiers] = useState(initial?.fournisseur_client ?? "");
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

  const totals = sumLignes(
    lignes.map((l) => ({ debit: l.montant_debit, credit: l.montant_credit }))
  );

  const setLigne = (i: number, patch: Partial<LigneInput>) =>
    setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

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
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>{t("date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("numeroPiece")}</Label>
          <Input value={piece} onChange={(e) => setPiece(e.target.value)} />
        </div>
        <div>
          <Label>{t("fournisseur")}</Label>
          <Input value={tiers} onChange={(e) => setTiers(e.target.value)} />
        </div>
      </div>

      {/* SCF account suggestions for the Compte field */}
      <datalist id="scf-accounts">
        {SCF_ACCOUNTS.map((a) => (
          <option key={a.compte} value={a.compte}>
            {a.compte} — {a.libelle}
          </option>
        ))}
      </datalist>

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
                    list="scf-accounts"
                    placeholder="Compte SCF"
                    value={l.numero_compte}
                    onChange={(e) => {
                      const v = e.target.value;
                      const match = SCF_ACCOUNTS.find((a) => a.compte === v);
                      // Auto-fill the libellé when a known SCF account is picked.
                      setLigne(i, match && !l.libelle
                        ? { numero_compte: v, libelle: match.libelle }
                        : { numero_compte: v });
                    }}
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={l.libelle}
                    onChange={(e) => setLigne(i, { libelle: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={l.montant_debit || ""}
                    onChange={(e) =>
                      setLigne(i, { montant_debit: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="number"
                    value={l.montant_credit || ""}
                    onChange={(e) =>
                      setLigne(i, { montant_credit: Number(e.target.value) })
                    }
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
        <Button variant="ghost" size="sm" onClick={() => setLignes((ls) => [...ls, emptyLigne()])}>
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
