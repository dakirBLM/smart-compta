"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

interface CRData {
  charges: { exploitation: number; financieres: number; exceptionnelles: number; impots: number };
  produits: { exploitation: number; financiers: number; exceptionnels: number };
  total_charges: number;
  total_produits: number;
  resultat: number;
  is_benefice: boolean;
}

const currency = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return currency.format(value).replace(/\s/g, " ");
}

export default function CompteResultatPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<CRData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const qs = annee ? `?annee=${annee}` : "";
    api
      .get<CRData>(`/api/entreprises/${id}/compte-resultat/${qs}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id, annee]);

  const currentYear = annee ?? new Date().getFullYear();
  const previousYear = currentYear - 1;

  const rows = data
    ? [
        { label: "Charges d'exploitation", current: data.charges.exploitation, previous: 0 },
        { label: "Charges financières", current: data.charges.financieres, previous: 0 },
        { label: "Charges exceptionnelles", current: data.charges.exceptionnelles, previous: 0 },
        { label: "Impôts sur les bénéfices", current: data.charges.impots, previous: 0 },
        { label: "TOTAL DES CHARGES", current: data.total_charges, previous: 0, strong: true },
        { label: "Produits d'exploitation", current: data.produits.exploitation, previous: 0 },
        { label: "Produits financiers", current: data.produits.financiers, previous: 0 },
        { label: "Produits exceptionnels", current: data.produits.exceptionnels, previous: 0 },
        { label: "TOTAL DES PRODUITS", current: data.total_produits, previous: 0, strong: true },
        { label: "RÉSULTAT NET", current: data.resultat, previous: 0, strong: true },
      ]
    : [];

  return (
    <AppShell
      title={t("compteResultat")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl rounded-[4px] border border-black bg-[#efefef] text-[13px] text-black shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black p-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2 md:w-[58%]">
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Désignation de l'entreprise :</span>
                <span className="font-semibold">{entreprise?.nom || "SARL OUSSAMA ET ABDERRAHIM"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Activité :</span>
                <span>{entreprise?.activite || "STATION DE SERVICE"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Adresse :</span>
                <span>{entreprise?.adresse || "ROUTE DE CONSTANCE AIN MLILA OUM EL BOUAGHI"}</span>
              </div>
            </div>

            <div className="md:w-[42%]">
              <div className="flex items-start justify-end gap-3">
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left">
                  <div className="font-bold">N° Article</div>
                  <div className="mt-1">{entreprise?.numero_compte || ""}</div>
                </div>
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left">
                  <div className="font-bold">N° NIF</div>
                  <div className="mt-1">{entreprise?.nif || "099704309104133"}</div>
                </div>
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left">
                  <div className="font-bold">N° RC</div>
                  <div className="mt-1">{entreprise?.nis || ""}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-black px-3 py-2">
            <div className="w-[55%] text-center text-lg font-bold uppercase tracking-tight">
              COMPTE DE RÉSULTAT
              <span className="ml-2 text-sm font-medium normal-case">(Par fonction)</span>
            </div>
            <div className="w-[45%] text-right">
              <div className="inline-block rounded-[2px] border border-black bg-white px-3 py-2 text-left leading-5">
                <div className="flex items-center justify-between gap-12">
                  <span className="font-bold">Du:</span>
                  <span>01/01/{currentYear}</span>
                </div>
                <div className="flex items-center justify-between gap-12">
                  <span className="font-bold">au:</span>
                  <span>31/12/{currentYear}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden border-b border-black">
            <div className="grid grid-cols-[minmax(0,1.8fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black bg-[#f7f7f5]">
              <div className="border-r border-black px-2 py-3 text-center text-lg font-bold uppercase">Rubriques</div>
              <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Note</div>
              <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Exercice {currentYear}</div>
              <div className="px-2 py-3 text-center text-sm font-bold">Exercice {previousYear}</div>
            </div>

            {rows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                className={`grid grid-cols-[minmax(0,1.8fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black ${
                  row.strong ? "bg-[#f7f7f5]" : "bg-transparent"
                }`}
              >
                <div className={`border-r border-black px-2 py-[4px] ${row.strong ? "font-bold uppercase" : ""}`}>
                  {row.label}
                </div>
                <div className="border-r border-black px-2 py-[4px] text-center text-[11px]">{row.strong ? "" : ""}</div>
                <div className="border-r border-black px-2 py-[4px] text-right">
                  {row.current !== 0 ? formatMoney(row.current) : ""}
                </div>
                <div className="px-2 py-[4px] text-right">
                  {row.previous !== 0 ? formatMoney(row.previous) : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t border-black bg-[#f4f4f2] px-4 py-2 text-sm font-bold italic">
            Edition du : {new Date().toLocaleDateString("fr-DZ")}
          </div>
        </div>
      )}
    </AppShell>
  );
}
