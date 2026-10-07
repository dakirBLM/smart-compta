"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
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

interface BilanLine {
  compte: string;
  libelle: string;
  brut: number;
  amortissement: number;
  net: number;
  netPrecedent: number;
}

interface BilanSection {
  label: string;
  lines: BilanLine[];
}

interface ActifData {
  sections: BilanSection[];
  brut: number;
  amortissement: number;
  net: number;
  netPrecedent: number;
}

interface PassifLine {
  compte: string;
  libelle: string;
  current: number;
  previous: number;
}

interface PassifSection {
  label: string;
  lines: PassifLine[];
  current: number;
  previous: number;
}

interface PassifData {
  sections: PassifSection[];
  current: number;
  previous: number;
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ActifTable({
  data,
  currentYear,
  previousYear,
}: {
  data: ActifData;
  currentYear: number;
  previousYear: number;
}) {
  return (
    <section className="overflow-hidden border-2 border-black bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead className="bg-[#f7f7f5]">
            <tr className="border-b border-black">
              <th rowSpan={2} className="border-r border-black px-3 py-3 text-center text-base font-bold tracking-[0.2em]">
                ACTIF
              </th>
              <th rowSpan={2} className="w-14 border-r border-black px-2 py-3 text-center">Note</th>
              <th colSpan={3} className="border-r border-black px-2 py-2 text-center font-bold">
                Exercice {currentYear}
              </th>
              <th className="px-2 py-2 text-center font-bold">Exercice {previousYear}</th>
            </tr>
            <tr className="border-b border-black">
              <th className="border-r border-black px-2 py-2 text-right">Brut</th>
              <th className="border-r border-black px-2 py-2 text-right">Amort.-Prov.</th>
              <th className="border-r border-black px-2 py-2 text-right">Net</th>
              <th className="px-2 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.sections.map((section) => (
              <Fragment key={section.label}>
                <tr className="border-b border-black bg-[#f1f1ef] font-bold uppercase">
                  <td colSpan={2} className="px-3 py-2">{section.label}</td>
                  <td className="border-r border-black" />
                  <td className="border-r border-black" />
                  <td className="border-r border-black" />
                  <td />
                </tr>
                {section.lines.map((line) => (
                  <tr key={`${section.label}-${line.compte}`} className="border-b border-gray-300">
                    <td className="border-r border-black px-3 py-1.5">
                      <span className="mr-2 font-mono text-gray-500">{line.compte}</span>
                      {line.libelle}
                    </td>
                    <td className="border-r border-black" />
                    <td className="border-r border-black px-2 py-1.5 text-right">{formatDZD(line.brut)}</td>
                    <td className="border-r border-black px-2 py-1.5 text-right">{formatDZD(line.amortissement)}</td>
                    <td className="border-r border-black px-2 py-1.5 text-right">{formatDZD(line.net)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDZD(line.netPrecedent)}</td>
                  </tr>
                ))}
                <tr className="border-b border-black font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-right">TOTAL {section.label}</td>
                  <td className="border-r border-black px-2 py-2 text-right">
                    {formatDZD(section.lines.reduce((sum, line) => sum + line.brut, 0))}
                  </td>
                  <td className="border-r border-black px-2 py-2 text-right">
                    {formatDZD(section.lines.reduce((sum, line) => sum + line.amortissement, 0))}
                  </td>
                  <td className="border-r border-black px-2 py-2 text-right">
                    {formatDZD(section.lines.reduce((sum, line) => sum + line.net, 0))}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {formatDZD(section.lines.reduce((sum, line) => sum + line.netPrecedent, 0))}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black bg-[#e2e2df] font-bold uppercase">
            <tr>
              <td className="px-3 py-2">TOTAL GENERAL ACTIF</td>
              <td className="border-x border-black" />
              <td className="border-r border-black px-2 py-2 text-right">{formatDZD(data.brut)}</td>
              <td className="border-r border-black px-2 py-2 text-right">{formatDZD(data.amortissement)}</td>
              <td className="border-r border-black px-2 py-2 text-right">{formatDZD(data.net)}</td>
              <td className="px-2 py-2 text-right">{formatDZD(data.netPrecedent)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function PassifTable({
  data,
  currentYear,
  previousYear,
}: {
  data: PassifData;
  currentYear: number;
  previousYear: number;
}) {
  return (
    <section className="overflow-hidden border-2 border-black bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead className="bg-[#f7f7f5]">
            <tr className="border-b border-black">
              <th className="border-r border-black px-3 py-3 text-center text-base font-bold tracking-[0.2em]">
                PASSIF
              </th>
              <th className="w-14 border-r border-black px-2 py-3 text-center">Note</th>
              <th className="w-36 border-r border-black px-2 py-3 text-right font-bold">Exercice {currentYear}</th>
              <th className="w-36 px-2 py-3 text-right font-bold">Exercice {previousYear}</th>
            </tr>
          </thead>
          <tbody>
            {data.sections.map((section) => (
              <Fragment key={section.label}>
                <tr className="border-b border-black bg-[#f1f1ef] font-bold uppercase">
                  <td className="px-3 py-2">{section.label}</td>
                  <td className="border-x border-black" />
                  <td className="border-r border-black" />
                  <td />
                </tr>
                {section.lines.map((line) => (
                  <tr key={`${section.label}-${line.compte}`} className="border-b border-gray-300">
                    <td className="border-r border-black px-3 py-1.5">
                      <span className="mr-2 font-mono text-gray-500">{line.compte}</span>
                      {line.libelle}
                    </td>
                    <td className="border-r border-black" />
                    <td className="border-r border-black px-2 py-1.5 text-right">{formatDZD(line.current)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDZD(line.previous)}</td>
                  </tr>
                ))}
                <tr className="border-b border-black font-semibold">
                  <td className="px-3 py-2 text-right">TOTAL {section.label}</td>
                  <td className="border-x border-black" />
                  <td className="border-r border-black px-2 py-2 text-right">{formatDZD(section.current)}</td>
                  <td className="px-2 py-2 text-right">{formatDZD(section.previous)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black bg-[#e2e2df] font-bold uppercase">
            <tr>
              <td className="px-3 py-2">TOTAL GENERAL PASSIF</td>
              <td className="border-x border-black" />
              <td className="border-r border-black px-2 py-2 text-right">{formatDZD(data.current)}</td>
              <td className="px-2 py-2 text-right">{formatDZD(data.previous)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function BilanPage() {
  const { id, entreprise, annee } = useEntreprise();
  const [currentData, setCurrentData] = useState<BalanceData | null>(null);
  const [previousData, setPreviousData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const currentYear = annee ?? new Date().getFullYear();
  const previousYear = currentYear - 1;

  useEffect(() => {
    if (!id) return;

    const currentQs = annee ? `?annee=${annee}` : "";
    const previousQs = `?annee=${previousYear}`;

    async function load() {
      try {
        const [currentRes, previousRes] = await Promise.all([
          api.get<BalanceData>(`/api/entreprises/${id}/balance/${currentQs}`),
          api.get<BalanceData>(`/api/entreprises/${id}/balance/${previousQs}`).catch(() => null),
        ]);
        setCurrentData(currentRes);
        setPreviousData(previousRes);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, annee, previousYear]);

  const bilan = useMemo(() => {
    if (!currentData) return null;

    const accountsByNumber = (data: BalanceData | null) =>
      new Map((data?.classes.flatMap((classe) => classe.comptes) ?? [])
        .map((account) => [account.compte, account] as const));
    const currentAccounts = accountsByNumber(currentData);
    const previousAccounts = accountsByNumber(previousData);
    const numbers = Array.from(new Set([
      ...Array.from(currentAccounts.keys()),
      ...Array.from(previousAccounts.keys()),
    ])).sort((a, b) => a.localeCompare(b));
    const assetBuckets = new Map<string, BilanLine[]>();
    const liabilityBuckets = new Map<string, PassifLine[]>();

    const addAsset = (label: string, account: BalanceCompte | undefined, previous: BalanceCompte | undefined) => {
      const brut = asNumber(account?.solde_debiteur);
      const amortissement = asNumber(account?.solde_crediteur);
      const net = brut - amortissement;
      const netPrecedent = asNumber(previous?.solde_debiteur) - asNumber(previous?.solde_crediteur);
      if (brut === 0 && amortissement === 0 && netPrecedent === 0) return;
      const lines = assetBuckets.get(label) ?? [];
      lines.push({
        compte: account?.compte ?? previous?.compte ?? "",
        libelle: account?.libelle || previous?.libelle || "",
        brut,
        amortissement,
        net,
        netPrecedent,
      });
      assetBuckets.set(label, lines);
    };

    const addLiability = (label: string, account: BalanceCompte | undefined, previous: BalanceCompte | undefined) => {
      const current = asNumber(account?.solde_crediteur) - asNumber(account?.solde_debiteur);
      const prior = asNumber(previous?.solde_crediteur) - asNumber(previous?.solde_debiteur);
      if (current === 0 && prior === 0) return;
      const lines = liabilityBuckets.get(label) ?? [];
      lines.push({
        compte: account?.compte ?? previous?.compte ?? "",
        libelle: account?.libelle || previous?.libelle || "",
        current,
        previous: prior,
      });
      liabilityBuckets.set(label, lines);
    };

    for (const code of numbers) {
      const account = currentAccounts.get(code);
      const prior = previousAccounts.get(code);
      const balanceAccount = account ?? prior;
      if (!balanceAccount) continue;
      const classNumber = code.slice(0, 1);
      const netDebit = asNumber(account?.solde_debiteur) - asNumber(account?.solde_crediteur);
      const priorNetDebit = asNumber(prior?.solde_debiteur) - asNumber(prior?.solde_crediteur);

      if (classNumber === "2") {
        addAsset("ACTIF NON COURANT", account, prior);
      } else if (classNumber === "3") {
        addAsset("STOCKS ET EN-COURS", account, prior);
      } else if (classNumber === "4" && (netDebit > 0 || (netDebit === 0 && priorNetDebit > 0))) {
        addAsset("CRÉANCES ET EMPLOIS ASSIMILÉS", account, prior);
      } else if (classNumber === "5" && (netDebit >= 0 || priorNetDebit > 0)) {
        addAsset("DISPONIBILITÉS ET ASSIMILÉS", account, prior);
      } else if (classNumber === "1") {
        const label = ["16", "17", "18"].some((prefix) => code.startsWith(prefix))
          ? "PASSIFS NON COURANTS"
          : "CAPITAUX PROPRES";
        addLiability(label, account, prior);
      } else if (
        (classNumber === "4" || classNumber === "5") &&
        (netDebit < 0 || (netDebit === 0 && priorNetDebit < 0))
      ) {
        addLiability("PASSIFS COURANTS", account, prior);
      }
    }

    const assetLabels = [
      "ACTIF NON COURANT",
      "STOCKS ET EN-COURS",
      "CRÉANCES ET EMPLOIS ASSIMILÉS",
      "DISPONIBILITÉS ET ASSIMILÉS",
    ];
    const actifSections = assetLabels
      .map((label) => ({ label, lines: assetBuckets.get(label) ?? [] }))
      .filter((section) => section.lines.length > 0);
    const actif = actifSections.reduce<ActifData>(
      (totals, section) => {
        for (const line of section.lines) {
          totals.brut += line.brut;
          totals.amortissement += line.amortissement;
          totals.net += line.net;
          totals.netPrecedent += line.netPrecedent;
        }
        return totals;
      },
      { sections: actifSections, brut: 0, amortissement: 0, net: 0, netPrecedent: 0 }
    );

    const liabilityLabels = ["CAPITAUX PROPRES", "PASSIFS NON COURANTS", "PASSIFS COURANTS"];
    const passifSections = liabilityLabels
      .map((label) => {
        const lines = liabilityBuckets.get(label) ?? [];
        return {
          label,
          lines,
          current: lines.reduce((sum, line) => sum + line.current, 0),
          previous: lines.reduce((sum, line) => sum + line.previous, 0),
        };
      })
      .filter((section) => section.lines.length > 0);
    const passif: PassifData = {
      sections: passifSections,
      current: passifSections.reduce((sum, section) => sum + section.current, 0),
      previous: passifSections.reduce((sum, section) => sum + section.previous, 0),
    };

    return { actif, passif };
  }, [currentData, previousData]);

  return (
    <AppShell
      title="Bilan"
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading || !currentData ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-5 border border-black bg-[#efefef] p-3 text-[13px] text-black shadow-sm sm:p-5">
          <header className="grid gap-4 border-b-2 border-black pb-4 md:grid-cols-[1fr_auto] md:items-start">
            <div className="max-w-2xl border-2 border-black bg-white">
              <div className="grid grid-cols-[145px_1fr] border-b border-dotted border-black px-2 py-2">
                <span className="font-bold">Désignation de l&apos;entreprise :</span>
                <span className="font-semibold uppercase">{entreprise?.nom || "—"}</span>
              </div>
              <div className="grid grid-cols-[145px_1fr] border-b border-dotted border-black px-2 py-2">
                <span className="font-bold">Activité :</span>
                <span className="uppercase">{entreprise?.activite || "—"}</span>
              </div>
              <div className="grid grid-cols-[145px_1fr] px-2 py-2">
                <span className="font-bold">Adresse :</span>
                <span className="uppercase">{entreprise?.adresse || "—"}</span>
              </div>
              <div className="grid grid-cols-3 border-t-2 border-black">
                {[
                  ["N° Article", entreprise?.nin],
                  ["N° NIF", entreprise?.nif],
                  ["N° RC", entreprise?.nis],
                ].map(([label, value]) => (
                  <div key={label} className="border-r border-black px-2 py-1.5 last:border-r-0">
                    <div className="font-bold">{label}</div>
                    <div className="mt-1 min-h-4">{value || "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 md:items-end">
              <div className="min-w-44 border-2 border-black bg-white px-4 py-2 text-sm">
                <div className="mb-1 text-center font-bold">La période</div>
                <div className="flex justify-between gap-3"><b>Du :</b><span>01/01/{currentYear}</span></div>
                <div className="flex justify-between gap-3"><b>au :</b><span>31/12/{currentYear}</span></div>
              </div>
              <div className="border border-dashed border-black px-3 py-1 font-bold tracking-wide">
                ÉDITION PROVISOIRE
              </div>
            </div>
          </header>

          <div className="py-1 text-center text-xl font-bold uppercase tracking-wide">BILAN</div>

          <div className="space-y-7">
            {bilan && (
              <div className="space-y-7">
                <ActifTable
                  data={bilan.actif}
                  currentYear={currentYear}
                  previousYear={previousYear}
                />
                <PassifTable
                  data={bilan.passif}
                  currentYear={currentYear}
                  previousYear={previousYear}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-black px-1 pt-3 text-sm font-bold italic">
            Édition du : {new Date().toLocaleDateString("fr-DZ")}
          </div>
        </div>
      )}
    </AppShell>
  );
}
