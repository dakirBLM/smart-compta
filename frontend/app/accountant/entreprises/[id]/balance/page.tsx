"use client";

import { Fragment, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";
import { ReportActions } from "@/components/ReportActions";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

interface BalanceCompte {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
  solde_debiteur: number;
  solde_crediteur: number;
}
interface BalanceClasse {
  classe: string;
  label: string;
  comptes: BalanceCompte[];
  total_debit: number;
  total_credit: number;
  total_solde_debiteur: number;
  total_solde_crediteur: number;
}
interface BalanceData {
  classes: BalanceClasse[];
  totals: { debit: number; credit: number; solde_debiteur: number; solde_crediteur: number };
}

export default function BalancePage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const qs = annee ? `?annee=${annee}` : "";
    api
      .get<BalanceData>(`/api/entreprises/${id}/balance/${qs}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id, annee]);

  return (
    <AppShell
      title={t("balance")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <div className="print-report">
          <h1 className="print-only hidden mb-2 text-xl font-bold">
            {entreprise?.nom} — {t("balance")}
          </h1>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">Exercice {annee}</p>
            <ReportActions title={`Balance ${annee ?? ""}`} disabled={!data} />
          </div>
          <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-brand text-left text-white">
              <tr>
                <th className="p-2">{t("compte")}</th>
                <th className="p-2">{t("libelle")}</th>
                <th className="p-2 text-right">{t("montantDebit")}</th>
                <th className="p-2 text-right">{t("montantCredit")}</th>
                <th className="p-2 text-right">{t("soldeDebiteur")}</th>
                <th className="p-2 text-right">{t("soldeCrediteur")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.classes.map((c) => (
                <Fragment key={`c-${c.classe}`}>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="p-2" colSpan={6}>
                      {t("classe")} {c.classe} — {c.label}
                    </td>
                  </tr>
                  {c.comptes.map((cp) => (
                    <tr key={cp.compte} className="border-t">
                      <td className="p-2 font-mono">{cp.compte}</td>
                      <td className="p-2">{cp.libelle}</td>
                      <td className="p-2 text-right">{formatDZD(cp.debit)}</td>
                      <td className="p-2 text-right">{formatDZD(cp.credit)}</td>
                      <td className="p-2 text-right">{formatDZD(cp.solde_debiteur)}</td>
                      <td className="p-2 text-right">{formatDZD(cp.solde_crediteur)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-brand/10 font-bold">
              <tr>
                <td className="p-2" colSpan={2}>
                  {t("total")}
                </td>
                <td className="p-2 text-right">{formatDZD(data?.totals.debit)}</td>
                <td className="p-2 text-right">{formatDZD(data?.totals.credit)}</td>
                <td className="p-2 text-right">{formatDZD(data?.totals.solde_debiteur)}</td>
                <td className="p-2 text-right">{formatDZD(data?.totals.solde_crediteur)}</td>
              </tr>
            </tfoot>
          </table>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
