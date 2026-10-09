"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReportActions } from "@/components/ReportActions";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useEntreprise } from "@/lib/useEntreprise";

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

interface BilanRow {
  label: string;
  kind: "section" | "group" | "line" | "total";
  indent?: boolean;
  brut?: number;
  amortissement?: number;
  net?: number;
  previous?: number;
}

interface ActifData {
  rows: BilanRow[];
  brut: number;
  amortissement: number;
  net: number;
  netPrecedent: number;
}

interface PassifData {
  rows: BilanRow[];
  current: number;
  previous: number;
}

interface AssetRowSpec {
  label: string;
  prefixes: string[];
  exclusions?: string[];
  provisionPrefixes?: string[];
  provisionExclusions?: string[];
  indent?: boolean;
}

interface LiabilityRowSpec {
  label: string;
  prefixes: string[];
  exclusions?: string[];
  signed?: boolean;
  indent?: boolean;
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatReportAmount(value: number | undefined) {
  if (value === undefined || Math.abs(value) < 0.005) return "";
  return value
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/ | /g, " ");
}

function matchesAccount(account: BalanceCompte, prefixes: string[], exclusions: string[] = []) {
  return prefixes.some((prefix) => account.compte.startsWith(prefix)) &&
    !exclusions.some((prefix) => account.compte.startsWith(prefix));
}

function assetRow(
  spec: AssetRowSpec,
  currentAccounts: Map<string, BalanceCompte>,
  previousAccounts: Map<string, BalanceCompte>
): BilanRow {
  const accounts = Array.from(
    new Set(Array.from(currentAccounts.keys()).concat(Array.from(previousAccounts.keys())))
  );
  const totals = accounts.reduce(
    (result, code) => {
      const current = currentAccounts.get(code);
      const previous = previousAccounts.get(code);
      const isBaseAccount = current
        ? matchesAccount(current, spec.prefixes, spec.exclusions)
        : previous
          ? matchesAccount(previous, spec.prefixes, spec.exclusions)
          : false;
      const isProvisionAccount = current
        ? matchesAccount(current, spec.provisionPrefixes ?? [], spec.provisionExclusions)
        : previous
          ? matchesAccount(previous, spec.provisionPrefixes ?? [], spec.provisionExclusions)
          : false;

      if (isBaseAccount) {
        result.brut += asNumber(current?.solde_debiteur);
        result.net += asNumber(current?.solde_debiteur) - asNumber(current?.solde_crediteur);
        result.previous += asNumber(previous?.solde_debiteur) - asNumber(previous?.solde_crediteur);
      }
      if (isProvisionAccount) {
        result.amortissement += asNumber(current?.solde_crediteur);
        result.net -= asNumber(current?.solde_crediteur) - asNumber(current?.solde_debiteur);
        result.previous -= asNumber(previous?.solde_crediteur) - asNumber(previous?.solde_debiteur);
      }
      return result;
    },
    { brut: 0, amortissement: 0, net: 0, previous: 0 }
  );

  return { ...spec, kind: spec.prefixes.length === 0 ? "group" : "line", ...totals };
}

function liabilityRow(
  spec: LiabilityRowSpec,
  currentAccounts: Map<string, BalanceCompte>,
  previousAccounts: Map<string, BalanceCompte>
): BilanRow {
  const accounts = Array.from(
    new Set(Array.from(currentAccounts.keys()).concat(Array.from(previousAccounts.keys())))
  );
  const amount = (map: Map<string, BalanceCompte>) =>
    accounts.reduce((sum, code) => {
      const account = map.get(code);
      if (!account || !matchesAccount(account, spec.prefixes, spec.exclusions)) return sum;
      const credit = asNumber(account.solde_crediteur);
      const debit = asNumber(account.solde_debiteur);
      return sum + (spec.signed ? credit - debit : credit);
    }, 0);

  return {
    ...spec,
    kind: "line",
    net: amount(currentAccounts),
    previous: amount(previousAccounts),
  };
}

function sumAssetRows(rows: BilanRow[]) {
  return rows.reduce(
    (sum, row) => ({
      brut: sum.brut + (row.brut ?? 0),
      amortissement: sum.amortissement + (row.amortissement ?? 0),
      net: sum.net + (row.net ?? 0),
      previous: sum.previous + (row.previous ?? 0),
    }),
    { brut: 0, amortissement: 0, net: 0, previous: 0 }
  );
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
        <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[5%]" />
            <col className="w-[15.25%]" />
            <col className="w-[15.25%]" />
            <col className="w-[15.25%]" />
            <col className="w-[15.25%]" />
          </colgroup>
          <thead className="bg-white">
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
            {data.rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className={
                  row.kind === "section"
                    ? "border-b border-dotted border-black font-bold uppercase"
                    : row.kind === "group"
                      ? "border-b border-dotted border-black font-bold"
                    : row.kind === "total"
                      ? "border-y border-black font-bold uppercase"
                      : "border-b border-dotted border-gray-400"
                }
              >
                <td className={`${row.indent ? "pl-8" : "px-3"} border-r border-black py-1.5`}>
                  {row.label}
                </td>
                <td className="border-r border-black" />
                <td className="border-r border-black px-2 py-1.5 text-right">{formatReportAmount(row.brut)}</td>
                <td className="border-r border-black px-2 py-1.5 text-right">{formatReportAmount(row.amortissement)}</td>
                <td className="border-r border-black px-2 py-1.5 text-right">{formatReportAmount(row.net)}</td>
                <td className="px-2 py-1.5 text-right">{formatReportAmount(row.previous)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black bg-white font-bold uppercase">
            <tr>
              <td className="px-3 py-2">TOTAL GENERAL ACTIF</td>
              <td className="border-x border-black" />
              <td className="border-r border-black px-2 py-2 text-right">{formatReportAmount(data.brut)}</td>
              <td className="border-r border-black px-2 py-2 text-right">{formatReportAmount(data.amortissement)}</td>
              <td className="border-r border-black px-2 py-2 text-right">{formatReportAmount(data.net)}</td>
              <td className="px-2 py-2 text-right">{formatReportAmount(data.netPrecedent)}</td>
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
        <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[53%]" />
            <col className="w-[6%]" />
            <col className="w-[20.5%]" />
            <col className="w-[20.5%]" />
          </colgroup>
          <thead className="bg-white">
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
            {data.rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className={
                  row.kind === "section"
                    ? "border-b border-dotted border-black font-bold uppercase"
                    : row.kind === "total"
                      ? "border-y border-black font-bold uppercase"
                      : "border-b border-dotted border-gray-400"
                }
              >
                <td className={`${row.indent ? "pl-8" : "px-3"} border-r border-black py-1.5`}>
                  {row.label}
                </td>
                <td className="border-r border-black" />
                <td className="border-r border-black px-2 py-1.5 text-right">{formatReportAmount(row.net)}</td>
                <td className="px-2 py-1.5 text-right">{formatReportAmount(row.previous)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black bg-white font-bold uppercase">
            <tr>
              <td className="px-3 py-2">TOTAL GENERAL PASSIF</td>
              <td className="border-x border-black" />
              <td className="border-r border-black px-2 py-2 text-right">{formatReportAmount(data.current)}</td>
              <td className="px-2 py-2 text-right">{formatReportAmount(data.previous)}</td>
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
    const makeAssetRows = (specs: AssetRowSpec[]) =>
      specs.map((spec) => assetRow(spec, currentAccounts, previousAccounts));
    const makeLiabilityRows = (specs: LiabilityRowSpec[]) =>
      specs.map((spec) => liabilityRow(spec, currentAccounts, previousAccounts));
    const sectionRow = (label: string): BilanRow => ({ label, kind: "section" });
    const totalRow = (label: string, totals: ReturnType<typeof sumAssetRows>): BilanRow => ({
      label,
      kind: "total",
      ...totals,
    });
    const nonCurrentAssets = makeAssetRows([
      { label: "Écart d’acquisition (ou goodwill)", prefixes: ["207"], provisionPrefixes: ["2807", "2907"] },
      {
        label: "Immobilisations incorporelles",
        prefixes: ["20"],
        exclusions: ["207"],
        provisionPrefixes: ["280", "290"],
        provisionExclusions: ["2807", "2907"],
      },
      { label: "Immobilisations corporelles", prefixes: [], indent: false },
      { label: "Terrains", prefixes: ["211", "221"], indent: true },
      {
        label: "Bâtiments",
        prefixes: ["213", "223"],
        provisionPrefixes: ["2813", "2913", "2823"],
        indent: true,
      },
      {
        label: "Autres immobilisations corporelles",
        prefixes: ["212", "215", "218"],
        provisionPrefixes: ["2812", "2815", "2818", "2912", "2915", "2918"],
        indent: true,
      },
      {
        label: "Immobilisations en concession",
        prefixes: ["22"],
        exclusions: ["221", "223"],
        provisionPrefixes: ["282", "292"],
        provisionExclusions: ["2823"],
        indent: true,
      },
      { label: "Immobilisations en cours", prefixes: ["23"], provisionPrefixes: ["293"] },
      { label: "Immobilisations financières", prefixes: [], indent: false },
      { label: "Titres mis en équivalence", prefixes: ["265"], indent: true },
      {
        label: "Autres participations et créances rattachées",
        prefixes: ["26"],
        exclusions: ["265", "269"],
        provisionPrefixes: ["269", "296"],
        indent: true,
      },
      { label: "Autres titres immobilisés", prefixes: ["271", "272", "273"], provisionPrefixes: ["297"] },
      {
        label: "Prêts et autres actifs financiers non courants",
        prefixes: ["274", "275", "276"],
        provisionPrefixes: ["279", "298"],
      },
      { label: "Impôts différés actif", prefixes: ["133"] },
    ]);
    const nonCurrentAssetTotals = sumAssetRows(nonCurrentAssets);
    const currentAssets = makeAssetRows([
      { label: "Stocks et en-cours", prefixes: ["30", "31", "32", "33", "34", "35", "36", "37", "38"], provisionPrefixes: ["39"] },
      { label: "Créances et emplois assimilés", prefixes: [], indent: false },
      { label: "Clients", prefixes: ["41"], exclusions: ["419"], provisionPrefixes: ["491"], indent: true },
      { label: "Autres débiteurs", prefixes: ["409", "42", "43"], indent: true },
      { label: "Impôts et assimilés", prefixes: ["44"], indent: true },
      {
        label: "Autres créances et emplois assimilés",
        prefixes: ["45", "46", "47", "486"],
        provisionPrefixes: ["495", "496", "498"],
        indent: true,
      },
      { label: "Disponibilités et assimilés", prefixes: [], indent: false },
      {
        label: "Placements et autres actifs financiers courants",
        prefixes: ["50", "52"],
        exclusions: ["509"],
        provisionPrefixes: ["509"],
        indent: true,
      },
      {
        label: "Trésorerie",
        prefixes: ["51", "53", "54", "58"],
        exclusions: ["519"],
        provisionPrefixes: ["591", "594"],
        indent: true,
      },
    ]);
    const currentAssetTotals = sumAssetRows(currentAssets);
    const actif: ActifData = {
      rows: [
        sectionRow("ACTIF NON COURANTS"),
        ...nonCurrentAssets.slice(0, 2),
        nonCurrentAssets[2],
        ...nonCurrentAssets.slice(3, 7),
        nonCurrentAssets[7],
        nonCurrentAssets[8],
        ...nonCurrentAssets.slice(9),
        totalRow("TOTAL ACTIF NON COURANT", nonCurrentAssetTotals),
        sectionRow("ACTIF COURANT"),
        ...currentAssets.slice(0, 1),
        currentAssets[1],
        ...currentAssets.slice(2, 6),
        currentAssets[6],
        ...currentAssets.slice(7),
        totalRow("TOTAL ACTIF COURANT", currentAssetTotals),
      ],
      brut: nonCurrentAssetTotals.brut + currentAssetTotals.brut,
      amortissement: nonCurrentAssetTotals.amortissement + currentAssetTotals.amortissement,
      net: nonCurrentAssetTotals.net + currentAssetTotals.net,
      netPrecedent: nonCurrentAssetTotals.previous + currentAssetTotals.previous,
    };

    const equityRows = makeLiabilityRows([
      { label: "Capital émis", prefixes: ["101"], signed: true, indent: true },
      { label: "Capital non appelé", prefixes: ["109"], signed: true, indent: true },
      { label: "Primes et réserves /(Réserves consolidées(1))", prefixes: ["103", "106"], signed: true, indent: true },
      { label: "Écarts de réévaluation", prefixes: ["104", "105"], signed: true, indent: true },
      { label: "Écart d’équivalence (1)", prefixes: ["107"], signed: true, indent: true },
      { label: "Résultat net /(Résultat net part du groupe /(1))", prefixes: ["12"], signed: true, indent: true },
      {
        label: "Autres capitaux propres - Report à nouveau",
        prefixes: ["11", "13", "14", "19"],
        exclusions: ["133", "134"],
        signed: true,
        indent: true,
      },
      { label: "Part de la société consolidante (1)", prefixes: [], signed: true, indent: true },
      { label: "Part des minoritaires (1)", prefixes: [], signed: true, indent: true },
    ]);
    const nonCurrentLiabilityRows = makeLiabilityRows([
      { label: "Emprunts et dettes financières", prefixes: ["16", "17"], indent: true },
      { label: "Impôts (différés et provisionnés)", prefixes: ["134", "155"], indent: true },
      { label: "Autres dettes non courantes", prefixes: ["18"], indent: true },
      { label: "Provisions et produits constatés d’avance", prefixes: ["15"], exclusions: ["155"], indent: true },
    ]);
    const currentLiabilityRows = makeLiabilityRows([
      { label: "Fournisseurs et comptes rattachés", prefixes: ["40"], exclusions: ["409"], indent: true },
      { label: "Impôts", prefixes: ["44"], indent: true },
      { label: "Autres dettes", prefixes: ["41", "42", "43", "45", "46", "47", "48"], indent: true },
      { label: "Trésorerie Passif", prefixes: ["51"], indent: true },
    ]);
    const sumLiabilityRows = (rows: BilanRow[]) =>
      rows.reduce(
        (sum, row) => ({
          current: sum.current + (row.net ?? 0),
          previous: sum.previous + (row.previous ?? 0),
        }),
        { current: 0, previous: 0 }
      );
    const equityTotals = sumLiabilityRows(equityRows);
    const nonCurrentLiabilityTotals = sumLiabilityRows(nonCurrentLiabilityRows);
    const currentLiabilityTotals = sumLiabilityRows(currentLiabilityRows);
    const passif: PassifData = {
      rows: [
        sectionRow("CAPITAUX PROPRES"),
        ...equityRows,
        { label: "TOTAL I", kind: "total", net: equityTotals.current, previous: equityTotals.previous },
        sectionRow("PASSIFS NON COURANTS"),
        ...nonCurrentLiabilityRows,
        {
          label: "TOTAL PASSIFS NON COURANTS II",
          kind: "total",
          net: nonCurrentLiabilityTotals.current,
          previous: nonCurrentLiabilityTotals.previous,
        },
        sectionRow("PASSIFS COURANTS"),
        ...currentLiabilityRows,
        {
          label: "TOTAL PASSIFS COURANTS III",
          kind: "total",
          net: currentLiabilityTotals.current,
          previous: currentLiabilityTotals.previous,
        },
      ],
      current: equityTotals.current + nonCurrentLiabilityTotals.current + currentLiabilityTotals.current,
      previous: equityTotals.previous + nonCurrentLiabilityTotals.previous + currentLiabilityTotals.previous,
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
        <>
        <div className="mb-3 flex justify-end print:hidden">
          <ReportActions title={`Bilan ${currentYear}`} disabled={!bilan} />
        </div>
        <div className="print-report mx-auto max-w-5xl space-y-5 bg-white p-3 font-sans text-[13px] text-black sm:p-5">
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
        </>
      )}
    </AppShell>
  );
}
