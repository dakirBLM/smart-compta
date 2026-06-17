"use client";

import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { exportTablePDF } from "@/lib/pdf";
import { cn, formatDate, formatDZD } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  function load() {
    if (!id) return;
    setLoading(true);
    const qp = new URLSearchParams();
    if (annee) qp.set("annee", String(annee));
    if (start) qp.set("start", start);
    if (end) qp.set("end", end);
    api
      .get<{ comptes: Compte[] }>(`/api/entreprises/${id}/grand-livre/?${qp.toString()}`)
      .then((d) => {
        setComptes(d.comptes);
        setSelected(d.comptes[0]?.compte ?? null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, annee]);

  const filtered = useMemo(
    () =>
      comptes.filter(
        (c) =>
          c.compte.toLowerCase().includes(search.toLowerCase()) ||
          c.libelle.toLowerCase().includes(search.toLowerCase())
      ),
    [comptes, search]
  );

  const current = comptes.find((c) => c.compte === selected) ?? null;

  function exportPDF() {
    if (!current) return;
    exportTablePDF(
      `Grand Livre - ${current.compte}`,
      [t("date"), t("numeroPiece"), t("libelle"), t("montantDebit"), t("montantCredit"), t("solde")],
      current.mouvements.map((m) => [
        formatDate(m.date),
        m.numero_piece,
        m.libelle,
        formatDZD(m.debit),
        formatDZD(m.credit),
        formatDZD(m.solde),
      ]),
      `${entreprise?.nom ?? ""} · ${current.compte} ${current.libelle} · Exercice ${annee ?? ""}`
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
        <Button variant="outline" onClick={exportPDF} disabled={!current}>
          <Download size={16} /> {t("exportPDF")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : comptes.length === 0 ? (
        <p className="py-8 text-center text-gray-400">{t("aucuneDonnee")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* Account list (master) */}
          <Card className="p-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                className="h-8 w-full text-sm outline-none"
                placeholder={`${t("compte")} / ${t("libelle")}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.compte}
                  onClick={() => setSelected(c.compte)}
                  className={cn(
                    "flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-gray-50",
                    selected === c.compte && "bg-brand/10"
                  )}
                >
                  <span className="min-w-0">
                    <span className="font-mono font-semibold">{c.compte}</span>
                    <span className="block truncate text-xs text-gray-500">{c.libelle}</span>
                  </span>
                  <span className="ml-2 shrink-0 text-xs font-medium">
                    {formatDZD(c.solde_final)}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-sm text-gray-400">{t("aucuneDonnee")}</p>
              )}
            </div>
          </Card>

          {/* Selected account movements (detail) */}
          <Card className="p-0">
            {current ? (
              <>
                <div className="flex items-center justify-between bg-brand px-4 py-2 text-white">
                  <span className="font-semibold">
                    <span className="font-mono">{current.compte}</span> · {current.libelle}
                  </span>
                  <span className="text-sm">
                    {t("solde")}: {formatDZD(current.solde_final)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="p-2">{t("date")}</th>
                        <th className="p-2">{t("numeroPiece")}</th>
                        <th className="p-2">{t("libelle")}</th>
                        <th className="p-2 text-right">{t("montantDebit")}</th>
                        <th className="p-2 text-right">{t("montantCredit")}</th>
                        <th className="p-2 text-right">{t("solde")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.mouvements.map((m, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{formatDate(m.date)}</td>
                          <td className="p-2">{m.numero_piece}</td>
                          <td className="p-2">{m.libelle}</td>
                          <td className="p-2 text-right">{m.debit ? formatDZD(m.debit) : ""}</td>
                          <td className="p-2 text-right">{m.credit ? formatDZD(m.credit) : ""}</td>
                          <td className="p-2 text-right font-medium">{formatDZD(m.solde)}</td>
                        </tr>
                      ))}
                      {current.mouvements.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-400">
                            {t("aucuneDonnee")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="p-8 text-center text-gray-400">
                Sélectionnez un compte à gauche.
              </p>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
