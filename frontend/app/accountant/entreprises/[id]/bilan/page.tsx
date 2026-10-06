"use client";

import { useEffect, useMemo, useState } from "react";
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

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumAccountValues(accounts: BalanceCompte[], mode: "debit" | "credit") {
  return accounts.reduce((total, account) => {
    const value = mode === "debit"
      ? asNumber(account.solde_debiteur)
      : asNumber(account.solde_crediteur);
    return total + value;
  }, 0);
}

function sumClassValues(classe: BalanceClasse | undefined, mode: "debit" | "credit") {
  if (!classe) return 0;
  return mode === "debit"
    ? asNumber(classe.total_solde_debiteur)
    : asNumber(classe.total_solde_crediteur);
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

    const allAccounts = currentData.classes.flatMap((classe) => classe.comptes);

    const actifNonCourant = allAccounts.filter((account) => {
      const prefix = account.compte.slice(0, 1);
      return ["2", "3"].includes(prefix);
    });

    const actifCourant = allAccounts.filter((account) => {
      const prefix = account.compte.slice(0, 1);
      return ["4", "5"].includes(prefix);
    });

    const capitauxPropres = allAccounts.filter((account) => account.compte.slice(0, 1) === "1");
    const passifsNonCourants = allAccounts.filter((account) => {
      const prefix = account.compte.slice(0, 2);
      return ["16", "17", "18"].includes(prefix);
    });
    const passifsCourants = allAccounts.filter((account) => {
      const prefix = account.compte.slice(0, 1);
      return ["4", "5"].includes(prefix) && !["41", "42", "43", "44", "45"].includes(account.compte.slice(0, 2));
    });

    const buildGroup = (label: string, accounts: BalanceCompte[], strong = false) => ({
      label,
      current: accounts.reduce((s, account) => s + Math.max(asNumber(account.solde_debiteur), asNumber(account.solde_crediteur)), 0),
      previous: 0,
      strong,
    });

    const assetRows = [
      buildGroup("ACTIF NON COURANT", actifNonCourant),
      buildGroup("ACTIF COURANT", actifCourant),
      buildGroup("TOTAL GENERAL ACTIF", [...actifNonCourant, ...actifCourant], true),
    ];

    const passiveRows = [
      buildGroup("CAPITAUX PROPRES", capitauxPropres),
      buildGroup("PASSIFS NON COURANTS", passifsNonCourants),
      buildGroup("PASSIFS COURANTS", passifsCourants),
      buildGroup("TOTAL GENERAL PASSIF", [...capitauxPropres, ...passifsNonCourants, ...passifsCourants], true),
    ];

    return { assetRows, passiveRows };
  }, [currentData]);

  const previousYearLabel = previousData ? previousYear : currentYear - 1;

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
        <div className="mx-auto max-w-6xl rounded-[4px] border border-black bg-[#efefef] text-[13px] text-black shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black p-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2 md:w-[58%]">
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Désignation de l'entreprise :</span>
                <span className="font-semibold">{entreprise?.nom || "Entreprise"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Activité :</span>
                <span>{entreprise?.activite || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block min-w-[175px] font-bold">Adresse :</span>
                <span>{entreprise?.adresse || "N/A"}</span>
              </div>
            </div>

            <div className="md:w-[42%]">
              <div className="flex items-start justify-end gap-3">
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left text-[12px]">
                  <div className="font-bold">N° Article</div>
                  <div className="mt-1">{entreprise?.numero_compte || ""}</div>
                </div>
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left text-[12px]">
                  <div className="font-bold">N° NIF</div>
                  <div className="mt-1">{entreprise?.nif || ""}</div>
                </div>
                <div className="rounded-[2px] border border-black bg-white px-2 py-1 text-left text-[12px]">
                  <div className="font-bold">N° RC</div>
                  <div className="mt-1">{entreprise?.nis || ""}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-black px-3 py-2">
            <div className="w-[55%] text-center text-lg font-bold uppercase tracking-tight">BILAN</div>
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

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
            <div className="border-r border-black">
              <div className="grid grid-cols-[minmax(0,1.6fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black bg-[#f7f7f5]">
                <div className="border-r border-black px-2 py-3 text-center text-lg font-bold uppercase">ACTIF</div>
                <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Note</div>
                <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Exercice {currentYear}</div>
                <div className="px-2 py-3 text-center text-sm font-bold">Exercice {previousYearLabel}</div>
              </div>

              {bilan?.assetRows.map((row, index) => (
                <div
                  key={`asset-${index}`}
                  className={`grid grid-cols-[minmax(0,1.6fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black ${row.strong ? "bg-[#f7f7f5]" : ""}`}
                >
                  <div className={`border-r border-black px-2 py-[4px] ${row.strong ? "font-bold uppercase" : ""}`}>
                    {row.label}
                  </div>
                  <div className="border-r border-black px-2 py-[4px] text-center text-[11px]" />
                  <div className="border-r border-black px-2 py-[4px] text-right">{formatDZD(row.current)}</div>
                  <div className="px-2 py-[4px] text-right">{formatDZD(row.previous)}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="grid grid-cols-[minmax(0,1.6fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black bg-[#f7f7f5]">
                <div className="border-r border-black px-2 py-3 text-center text-lg font-bold uppercase">PASSIF</div>
                <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Note</div>
                <div className="border-r border-black px-2 py-3 text-center text-sm font-bold">Exercice {currentYear}</div>
                <div className="px-2 py-3 text-center text-sm font-bold">Exercice {previousYearLabel}</div>
              </div>

              {bilan?.passiveRows.map((row, index) => (
                <div
                  key={`passive-${index}`}
                  className={`grid grid-cols-[minmax(0,1.6fr)_80px_minmax(120px,0.8fr)_minmax(120px,0.8fr)] border-b border-black ${row.strong ? "bg-[#f7f7f5]" : ""}`}
                >
                  <div className={`border-r border-black px-2 py-[4px] ${row.strong ? "font-bold uppercase" : ""}`}>
                    {row.label}
                  </div>
                  <div className="border-r border-black px-2 py-[4px] text-center text-[11px]" />
                  <div className="border-r border-black px-2 py-[4px] text-right">{formatDZD(row.current)}</div>
                  <div className="px-2 py-[4px] text-right">{formatDZD(row.previous)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end border-t border-black bg-[#f4f4f2] px-4 py-2 text-sm font-bold italic">
            Edition du : {new Date().toLocaleDateString("fr-DZ")}
          </div>
        </div>
      )}
    </AppShell>
  );
}
