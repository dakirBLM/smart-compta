"use client";

import { Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture } from "@/lib/types";
import { formatDate, formatDZD } from "@/lib/utils";

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

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-brand text-left text-white">
          <tr>
            <th className="p-2">{t("date")}</th>
            <th className="p-2">{t("numeroPiece")}</th>
            <th className="p-2">{t("numeroCompteDebit")}</th>
            <th className="p-2">{t("numeroCompteCredit")}</th>
            <th className="p-2">{t("libelle")}</th>
            <th className="p-2 text-right">{t("montantDebit")}</th>
            <th className="p-2 text-right">{t("montantCredit")}</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {ecritures.map((ec) =>
            ec.lignes.map((l, idx) => (
              <tr key={`${ec.id}-${idx}`} className="border-t hover:bg-gray-50">
                <td className="p-2">{idx === 0 ? formatDate(ec.date_ecriture) : ""}</td>
                <td className="p-2">{idx === 0 ? ec.numero_piece : ""}</td>
                <td className="p-2 font-mono">
                  {Number(l.montant_debit) > 0 ? l.numero_compte : ""}
                </td>
                <td className="p-2 font-mono">
                  {Number(l.montant_credit) > 0 ? l.numero_compte : ""}
                </td>
                <td className="p-2">{l.libelle}</td>
                <td className="p-2 text-right">
                  {Number(l.montant_debit) > 0 ? formatDZD(l.montant_debit) : ""}
                </td>
                <td className="p-2 text-right">
                  {Number(l.montant_credit) > 0 ? formatDZD(l.montant_credit) : ""}
                </td>
                <td className="p-2">
                  {idx === 0 && (
                    <div className="flex items-center gap-2">
                      <StatusBadge statut={ec.statut} />
                      {onEdit && (
                        <button onClick={() => onEdit(ec)} className="text-brand">
                          <Pencil size={15} />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(ec)} className="text-danger">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
