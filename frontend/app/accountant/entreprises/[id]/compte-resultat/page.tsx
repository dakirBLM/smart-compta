"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReportActions } from "@/components/ReportActions";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

interface CRData {
  charges: { exploitation: number; financieres: number; exceptionnelles: number; impots: number };
  produits: { exploitation: number; financiers: number; exceptionnels: number };
  detail_charges: Record<string, number>;
  detail_produits: Record<string, number>;
  total_charges: number;
  total_produits: number;
  resultat: number;
  is_benefice: boolean;
}

interface StatementRow {
  label: string;
  current: number;
  previous: number;
  strong?: boolean;
}

type Presentation = "fonction" | "nature";

const emptyReport: CRData = {
  charges: { exploitation: 0, financieres: 0, exceptionnelles: 0, impots: 0 },
  produits: { exploitation: 0, financiers: 0, exceptionnels: 0 },
  detail_charges: {},
  detail_produits: {},
  total_charges: 0,
  total_produits: 0,
  resultat: 0,
  is_benefice: true,
};

function totalByPrefix(accounts: Record<string, number>, prefixes: string[]) {
  return Object.entries(accounts).reduce(
    (total, [account, amount]) =>
      prefixes.some((prefix) => account.startsWith(prefix)) ? total + amount : total,
    0
  );
}

function getRows(data: CRData, previous: CRData, presentation: Presentation): StatementRow[] {
  const amount = (
    report: CRData,
    type: "charges" | "produits",
    prefixes: string[]
  ) => totalByPrefix(type === "charges" ? report.detail_charges : report.detail_produits, prefixes);
  const row = (
    label: string,
    current: number,
    prior: number,
    strong = false
  ): StatementRow => ({ label, current, previous: prior, strong });

  if (presentation === "fonction") {
    const chiffreAffaires = amount(data, "produits", ["70"]);
    const chiffreAffairesPrevious = amount(previous, "produits", ["70"]);
    const coutVentes = amount(data, "charges", ["60"]);
    const coutVentesPrevious = amount(previous, "charges", ["60"]);
    const marge = chiffreAffaires - coutVentes;
    const margePrevious = chiffreAffairesPrevious - coutVentesPrevious;
    const resultatOperationnel = data.produits.exploitation - data.charges.exploitation;
    const resultatOperationnelPrevious = previous.produits.exploitation - previous.charges.exploitation;
    const resultatAvantImpots = resultatOperationnel + data.produits.financiers - data.charges.financieres;
    const resultatAvantImpotsPrevious =
      resultatOperationnelPrevious + previous.produits.financiers - previous.charges.financieres;
    const resultatAvantExceptionnel = resultatAvantImpots - data.charges.impots;
    const resultatAvantExceptionnelPrevious = resultatAvantImpotsPrevious - previous.charges.impots;

    return [
      row("Chiffre d'affaires", chiffreAffaires, chiffreAffairesPrevious),
      row("Coût des ventes", coutVentes, coutVentesPrevious),
      row("MARGE BRUTE", marge, margePrevious, true),
      row(
        "Autres produits opérationnels",
        data.produits.exploitation - chiffreAffaires,
        previous.produits.exploitation - chiffreAffairesPrevious
      ),
      row("Coûts commerciaux", amount(data, "charges", ["62"]), amount(previous, "charges", ["62"])),
      row("Charges administratives", amount(data, "charges", ["63", "64"]), amount(previous, "charges", ["63", "64"])),
      row(
        "Autres charges opérationnelles",
        data.charges.exploitation - coutVentes -
          amount(data, "charges", ["62", "63", "64"]),
        previous.charges.exploitation - coutVentesPrevious -
          amount(previous, "charges", ["62", "63", "64"])
      ),
      row("RÉSULTAT OPÉRATIONNEL", resultatOperationnel, resultatOperationnelPrevious, true),
      row("Produits financiers", data.produits.financiers, previous.produits.financiers),
      row("Charges financières", data.charges.financieres, previous.charges.financieres),
      row("RÉSULTAT ORDINAIRE AVANT IMPÔT", resultatAvantImpots, resultatAvantImpotsPrevious, true),
      row("Impôts exigibles sur les résultats ordinaires", data.charges.impots, previous.charges.impots),
      row("Impôts différés sur résultats ordinaires", 0, 0),
      row("RÉSULTAT NET DES ACTIVITÉS ORDINAIRES", resultatAvantExceptionnel, resultatAvantExceptionnelPrevious, true),
      row("Charges extraordinaires", data.charges.exceptionnelles, previous.charges.exceptionnelles),
      row("Produits extraordinaires", data.produits.exceptionnels, previous.produits.exceptionnels),
      row("RÉSULTAT NET DE L'EXERCICE", data.resultat, previous.resultat, true),
      row("Part dans les résultats nets des sociétés mises en équivalence", 0, 0),
      row("RÉSULTAT NET DE L'ENSEMBLE CONSOLIDÉ", data.resultat, previous.resultat, true),
      row("Dont part des minoritaires", 0, 0),
      row("Part du groupe", data.resultat, previous.resultat),
    ];
  }

  const productionPrefixes = ["70", "71", "72", "74"];
  const achatsPrefixes = ["60"];
  const servicesPrefixes = ["61", "62"];
  const personnelPrefixes = ["63"];
  const taxesPrefixes = ["64"];
  const production = amount(data, "produits", productionPrefixes);
  const productionPrevious = amount(previous, "produits", productionPrefixes);
  const achats = amount(data, "charges", achatsPrefixes);
  const achatsPrevious = amount(previous, "charges", achatsPrefixes);
  const services = amount(data, "charges", servicesPrefixes);
  const servicesPrevious = amount(previous, "charges", servicesPrefixes);
  const personnel = amount(data, "charges", personnelPrefixes);
  const personnelPrevious = amount(previous, "charges", personnelPrefixes);
  const taxes = amount(data, "charges", taxesPrefixes);
  const taxesPrevious = amount(previous, "charges", taxesPrefixes);
  const consommation = achats + services;
  const consommationPrevious = achatsPrevious + servicesPrevious;
  const valeurAjoutee = production - consommation;
  const valeurAjouteePrevious = productionPrevious - consommationPrevious;
  const excedent = valeurAjoutee - personnel - taxes;
  const excedentPrevious = valeurAjouteePrevious - personnelPrevious - taxesPrevious;
  const resultatOperationnel = data.produits.exploitation - data.charges.exploitation;
  const resultatOperationnelPrevious = previous.produits.exploitation - previous.charges.exploitation;
  const resultatFinancier = data.produits.financiers - data.charges.financieres;
  const resultatFinancierPrevious = previous.produits.financiers - previous.charges.financieres;
  const resultatAvantImpots = resultatOperationnel + resultatFinancier;
  const resultatAvantImpotsPrevious = resultatOperationnelPrevious + resultatFinancierPrevious;
  const resultatOrdinaire = resultatAvantImpots - data.charges.impots;
  const resultatOrdinairePrevious = resultatAvantImpotsPrevious - previous.charges.impots;

  return [
    row("Chiffre d'affaires", amount(data, "produits", ["70"]), amount(previous, "produits", ["70"])),
    row(
      "Variation stocks produits finis et en cours",
      amount(data, "produits", ["71"]),
      amount(previous, "produits", ["71"])
    ),
    row("Production immobilisée", amount(data, "produits", ["72"]), amount(previous, "produits", ["72"])),
    row("Subventions d'exploitation", amount(data, "produits", ["74"]), amount(previous, "produits", ["74"])),
    row("I - PRODUCTION DE L'EXERCICE", production, productionPrevious, true),
    row("Achats consommés", achats, achatsPrevious),
    row("Services extérieurs et autres services", services, servicesPrevious),
    row("II - CONSOMMATION DE L'EXERCICE", consommation, consommationPrevious, true),
    row("III - VALEUR AJOUTÉE D'EXPLOITATION (I - II)", valeurAjoutee, valeurAjouteePrevious, true),
    row("Charges de personnel", personnel, personnelPrevious),
    row("Impôts, taxes et versements assimilés", taxes, taxesPrevious),
    row("IV - EXCÉDENT BRUT D'EXPLOITATION", excedent, excedentPrevious, true),
    row("Autres produits opérationnels", amount(data, "produits", ["75"]), amount(previous, "produits", ["75"])),
    row("Autres charges opérationnelles", amount(data, "charges", ["65"]), amount(previous, "charges", ["65"])),
    row("Dotations aux amortissements et aux provisions", amount(data, "charges", ["68"]), amount(previous, "charges", ["68"])),
    row("Reprise sur pertes de valeur et provisions", amount(data, "produits", ["78"]), amount(previous, "produits", ["78"])),
    row("V - RÉSULTAT OPÉRATIONNEL", resultatOperationnel, resultatOperationnelPrevious, true),
    row("Produits financiers", data.produits.financiers, previous.produits.financiers),
    row("Charges financières", data.charges.financieres, previous.charges.financieres),
    row("VI - RÉSULTAT FINANCIER", resultatFinancier, resultatFinancierPrevious, true),
    row("VII - RÉSULTAT ORDINAIRE AVANT IMPÔTS (V + VI)", resultatAvantImpots, resultatAvantImpotsPrevious, true),
    row("Impôts exigibles sur les résultats ordinaires", data.charges.impots, previous.charges.impots),
    row("Impôts différés", 0, 0),
    row("TOTAL DES PRODUITS DES ACTIVITÉS ORDINAIRES", data.produits.exploitation + data.produits.financiers, previous.produits.exploitation + previous.produits.financiers, true),
    row("TOTAL DES CHARGES DES ACTIVITÉS ORDINAIRES", data.charges.exploitation + data.charges.financieres + data.charges.impots, previous.charges.exploitation + previous.charges.financieres + previous.charges.impots, true),
    row("VIII - RÉSULTAT NET DES ACTIVITÉS ORDINAIRES", resultatOrdinaire, resultatOrdinairePrevious, true),
    row("Éléments extraordinaires (produits)", data.produits.exceptionnels, previous.produits.exceptionnels),
    row("Éléments extraordinaires (charges)", data.charges.exceptionnelles, previous.charges.exceptionnelles),
    row("IX - RÉSULTAT EXTRAORDINAIRE", data.produits.exceptionnels - data.charges.exceptionnelles, previous.produits.exceptionnels - previous.charges.exceptionnelles, true),
    row("X - RÉSULTAT NET DE L'EXERCICE", data.resultat, previous.resultat, true),
    row("Part dans les résultats nets des sociétés mises en équivalence", 0, 0),
    row("XI - RÉSULTAT NET DE L'ENSEMBLE CONSOLIDÉ", data.resultat, previous.resultat, true),
    row("Dont part des minoritaires", 0, 0),
    row("Part du groupe", data.resultat, previous.resultat),
  ];
}

export default function CompteResultatPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<CRData | null>(null);
  const [previousData, setPreviousData] = useState<CRData | null>(null);
  const [presentation, setPresentation] = useState<Presentation>("fonction");
  const [loading, setLoading] = useState(true);

  const currentYear = annee ?? new Date().getFullYear();
  const previousYear = currentYear - 1;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<CRData>(`/api/entreprises/${id}/compte-resultat/?annee=${currentYear}`),
      api.get<CRData>(`/api/entreprises/${id}/compte-resultat/?annee=${previousYear}`).catch(() => null),
    ])
      .then(([current, previous]) => {
        setData(current);
        setPreviousData(previous);
      })
      .finally(() => setLoading(false));
  }, [id, currentYear, previousYear]);

  const rows = useMemo(
    () => (data ? getRows(data, previousData ?? emptyReport, presentation) : []),
    [data, previousData, presentation]
  );

  return (
    <AppShell
      title={t("compteResultat")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Présentation du compte de résultat">
          {(["fonction", "nature"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={presentation === mode}
              onClick={() => setPresentation(mode)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                presentation === mode
                  ? "border-brand bg-brand text-white"
                  : "border-gray-300 bg-white text-brand hover:bg-brand/5"
              }`}
            >
              Par {mode}
            </button>
          ))}
        </div>
        <ReportActions
          title={`Compte de résultat ${currentYear} - ${presentation}`}
          disabled={!data}
        />
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <div className="print-report mx-auto max-w-6xl border border-black bg-[#efefef] text-[13px] text-black shadow-sm">
          <header className="grid gap-4 border-b-2 border-black p-3 md:grid-cols-[1fr_auto] md:items-start">
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

          <h2 className="py-3 text-center text-lg font-bold uppercase">
            COMPTE DE RÉSULTAT (Par {presentation})
          </h2>

          <div className="overflow-x-auto border-y-2 border-black bg-white">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead className="bg-[#f7f7f5]">
                <tr className="border-b-2 border-black">
                  <th className="border-r border-black px-3 py-3 text-left text-sm font-bold uppercase tracking-[0.2em]">
                    Rubriques
                  </th>
                  <th className="w-16 border-r border-black px-2 py-3 text-center">Note</th>
                  <th className="w-40 border-r border-black px-2 py-2 text-center">
                    Exercice<br />{currentYear}
                  </th>
                  <th className="w-40 px-2 py-2 text-center">
                    Exercice<br />{previousYear}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) => (
                  <tr
                    key={`${item.label}-${index}`}
                    className={`border-b border-gray-300 ${item.strong ? "border-y border-black bg-[#f5f5f2] font-bold" : ""}`}
                  >
                    <td className={`border-r border-black px-3 py-1.5 ${item.strong ? "uppercase" : "pl-7"}`}>
                      {item.label}
                    </td>
                    <td className="border-r border-black px-2 py-1.5 text-center" />
                    <td className="border-r border-black px-3 py-1.5 text-right">
                      {item.current !== 0 ? formatDZD(item.current) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {item.previous !== 0 ? formatDZD(item.previous) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex justify-end px-4 py-3 text-sm font-bold italic">
            Édition du : {new Date().toLocaleDateString("fr-DZ")}
          </footer>
        </div>
      )}
    </AppShell>
  );
}
