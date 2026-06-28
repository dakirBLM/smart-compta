"use client";

import { Fragment } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

const MODE_ICONS: Record<string, string> = {
  "espèces": "💵",
  espece: "💵",
  cash: "💵",
  "chèque": "🏦",
  virement: "💸",
  carte: "💳",
  "prélèvement": "📋",
};

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Group entries by month (preserving date order). */
function groupByMonth(ecritures: Ecriture[]) {
  const sorted = [...ecritures].sort((a, b) =>
    (a.date_ecriture || "").localeCompare(b.date_ecriture || "")
  );
  const groups: { key: string; label: string; items: Ecriture[] }[] = [];
  for (const ec of sorted) {
    const [y, m] = (ec.date_ecriture || "").split("-");
    const key = `${y}-${m}`;
    const label = m ? `${MONTHS[Number(m) - 1]} ${y}` : "Sans date";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(ec);
  }
  return groups;
}

export function JournalTable({
  ecritures,
  onEdit,
  onDelete,
}: {
  ecritures: Ecriture[];
  onEdit?: (e: Ecriture) => void;
  onDelete?: (e: Ecriture) => void;
}) {
  const { t } = useI18n();

  if (!ecritures.length)
    return <p className="py-8 text-center text-gray-400">{t("aucuneDonnee")}</p>;

  // Check if any ecriture has mode_paiement to show that column
  const hasModes = ecritures.some((ec) => ec.mode_paiement);
  const colCount = hasModes ? 10 : 9;
  const groups = groupByMonth(ecritures);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-brand text-left text-white">
          <tr>
            <th className="p-2">{t("date")}</th>
            <th className="p-2">{t("numeroPiece")}</th>
            <th className="p-2">{t("fournisseur")}</th>
            <th className="p-2">{t("numeroCompteDebit")}</th>
            <th className="p-2">{t("numeroCompteCredit")}</th>
            <th className="p-2">{t("libelle")}</th>
            <th className="p-2 text-right">{t("montantDebit")}</th>
            <th className="p-2 text-right">{t("montantCredit")}</th>
             {hasModes && <th className="p-2">{t("modePaiement")}</th>}
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const mDebit = g.items.reduce((s, ec) => s + Number(ec.total_debit), 0);
            const mCredit = g.items.reduce((s, ec) => s + Number(ec.total_credit), 0);
            return (
            <Fragment key={g.key}>
              <tr className="bg-brand/10">
                <td colSpan={colCount} className="p-2 text-sm font-bold uppercase text-brand">
                  {g.label}
                </td>
              </tr>
              {g.items.map((ec) =>
                ec.lignes.map((l, idx) => (
                  <tr key={`${ec.id}-${idx}`} className="border-t hover:bg-gray-50 transition-colors">
                <td className="p-2 whitespace-nowrap">{idx === 0 ? formatDate(ec.date_ecriture) : ""}</td>
                <td className="p-2 font-mono text-xs">{idx === 0 ? ec.numero_piece : ""}</td>
                <td className="p-2 text-xs text-gray-600">{idx === 0 ? ec.fournisseur_client : ""}</td>
                <td className="p-2 font-mono">
                  {Number(l.montant_debit) > 0 ? (
                    <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700">
                      {l.numero_compte}
                    </span>
                  ) : ""}
                </td>
                <td className="p-2 font-mono">
                  {Number(l.montant_credit) > 0 ? (
                    <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
                      {l.numero_compte}
                    </span>
                  ) : ""}
                </td>
                <td className="p-2 text-gray-700">{l.libelle}</td>
                <td className="p-2 text-right font-mono font-semibold text-blue-700">
                  {Number(l.montant_debit) > 0 ? formatDZD(l.montant_debit) : ""}
                </td>
                <td className="p-2 text-right font-mono font-semibold text-emerald-700">
                  {Number(l.montant_credit) > 0 ? formatDZD(l.montant_credit) : ""}
                </td>
                {hasModes && (
                  <td className="p-2">
                    {idx === 0 && ec.mode_paiement ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {MODE_ICONS[ec.mode_paiement] || "💰"}
                        {ec.mode_paiement}
                      </span>
                    ) : ""}
                  </td>
                )}
                <td className="p-2">
                  {idx === 0 && (
                    <div className="flex items-center gap-2">
                      <StatusBadge statut={ec.statut} />
                      {onEdit && (
                        <button onClick={() => onEdit(ec)} className="text-brand hover:opacity-70">
                          <Pencil size={15} />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(ec)} className="text-danger hover:opacity-70">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
                ))
              )}
              <tr className="border-t-2 border-brand/20 bg-gray-50 font-semibold">
                <td colSpan={6} className="p-2 text-right text-xs uppercase text-gray-500">
                  Total {g.label}
                </td>
                <td className="p-2 text-right font-mono text-blue-700">{formatDZD(mDebit)}</td>
                <td className="p-2 text-right font-mono text-emerald-700">{formatDZD(mCredit)}</td>
                {hasModes && <td />}
                <td />
              </tr>
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
