"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { DashboardData } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

const COLORS = ["#111111", "#16A34A", "#D97706", "#9CA3AF"];

function KpiCard({ label, value, change }: { label: string; value: number; change?: number }) {
  const up = (change ?? 0) >= 0;
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="kpi-number mt-1 text-brand">{formatDZD(value)}</div>
      {change !== undefined && (
        <div className={`mt-1 flex items-center gap-1 text-sm ${up ? "text-success" : "text-danger"}`}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(change)}%
        </div>
      )}
    </Card>
  );
}

export default function EntrepriseDashboard() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const qs = annee ? `?annee=${annee}` : "";
    api
      .get<DashboardData>(`/api/entreprises/${id}/dashboard/${qs}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [id, annee]);

  return (
    <AppShell
      title={t("dashboard")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : error ? (
        <div className="flex justify-center py-12">
          <div className="rounded-lg border bg-red-50 px-6 py-4 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : !data ? (
        <div className="flex justify-center py-12">
          <div className="rounded-lg border bg-gray-50 px-6 py-6 text-sm text-gray-600">
            {t("aucuneDonnee")}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand">{t("vueGlobale")}</h2>
            <select className="rounded-lg border px-3 py-1.5 text-sm">
              <option>{t("ceMois")}</option>
              <option>Exercice {annee}</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label={t("chiffreAffaires")} value={data.kpis.chiffre_affaires} change={12} />
            <KpiCard label={t("totalAchats")} value={data.kpis.total_achats} change={-4} />
            <KpiCard label={t("charges")} value={data.kpis.charges} change={6} />
            <KpiCard label={t("resultat")} value={data.kpis.resultat} change={9} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 font-semibold text-brand">{t("evolutionResultats")}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.evolution}>
                  <XAxis dataKey="mois" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatDZD(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="produits" stroke="#16A34A" name={t("produits")} />
                  <Line type="monotone" dataKey="charges" stroke="#DC2626" name={t("charges")} />
                  <Line type="monotone" dataKey="resultat" stroke="#111111" name={t("resultat")} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="mb-3 font-semibold text-brand">{t("repartitionCharges")}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.repartition_charges.filter((r) => r.montant > 0)}
                    dataKey="montant"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    label={(e) => `${e.label} ${e.pourcentage}%`}
                  >
                    {data.repartition_charges.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatDZD(v)} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
