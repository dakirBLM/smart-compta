"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { exportTablePDF } from "@/lib/pdf";
import { formatDate, formatDZD } from "@/lib/utils";

interface Mouvement {
  date: string;
  libelle: string;
  numero_piece: string;
  debit: number;
  credit: number;
  solde: number;
}
interface Compte {
  compte: string;
  libelle: string;
  mouvements: Mouvement[];
  solde_final: number;
}

export default function GrandLivrePage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function load() {
    if (!id) return;
    setLoading(true);
    const qp = new URLSearchParams();
    if (annee) qp.set("annee", String(annee));
    if (start) qp.set("start", start);
    if (end) qp.set("end", end);
    api
      .get<{ comptes: Compte[] }>(`/api/entreprises/${id}/grand-livre/?${qp.toString()}`)
      .then((d) => setComptes(d.comptes))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, annee]);

  function exportPDF() {
    const rows: (string | number)[][] = [];
    comptes.forEach((c) => {
      rows.push([`${c.compte} — ${c.libelle}`, "", "", "", ""]);
      c.mouvements.forEach((m) =>
        rows.push([
          formatDate(m.date),
          m.libelle,
          formatDZD(m.debit),
          formatDZD(m.credit),
          formatDZD(m.solde),
        ])
      );
    });
    exportTablePDF(
      "Grand Livre",
      [t("date"), t("libelle"), t("montantDebit"), t("montantCredit"), t("solde")],
      rows,
      `${entreprise?.nom ?? ""} · Exercice ${annee ?? ""}`
    );
  }

  return (
    <AppShell
      title={t("grandLivre")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm">{t("de")}</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm">{t("a")}</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={load}>{t("rechercher")}</Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportPDF}>
          <Download size={16} /> {t("exportPDF")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <div className="space-y-6">
          {comptes.map((c) => (
            <Card key={c.compte} className="p-0">
              <div className="flex items-center justify-between bg-brand px-4 py-2 text-white">
                <span className="font-semibold">
                  <span className="font-mono">{c.compte}</span> · {c.libelle}
                </span>
                <span className="text-sm">
                  {t("solde")}: {formatDZD(c.solde_final)}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-2">{t("date")}</th>
                    <th className="p-2">{t("libelle")}</th>
                    <th className="p-2 text-right">{t("montantDebit")}</th>
                    <th className="p-2">Let.</th>
                    <th className="p-2 text-right">{t("montantCredit")}</th>
                    <th className="p-2">Let.</th>
                    <th className="p-2 text-right">{t("solde")}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.mouvements.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{formatDate(m.date)}</td>
                      <td className="p-2">{m.libelle}</td>
                      <td className="p-2 text-right">{m.debit ? formatDZD(m.debit) : ""}</td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right">{m.credit ? formatDZD(m.credit) : ""}</td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right font-medium">{formatDZD(m.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {comptes.length === 0 && (
            <p className="py-8 text-center text-gray-400">{t("aucuneDonnee")}</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
