"use client";

import {
  ArrowRight,
  BarChart3,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
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
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { DashboardData } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

const CHART_COLORS = ["#356f5d", "#85a99b", "#dce8e3", "#173c32", "#4e8d75", "#c9d5d0"];

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[#e5e9e6] bg-white p-5 shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.07em] text-[#727c78]">
        <span>{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#eff5f2] text-[#376e5c]">
          {icon}
        </span>
      </div>
      <strong className="mt-4 block text-[22px] font-semibold leading-none tracking-tight text-[#17221f]">
        {formatDZD(value)}
      </strong>
    </article>
  );
}

export default function EntrepriseDashboard() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const qs = annee ? `?annee=${annee}` : "";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<DashboardData>(`/api/entreprises/${id}/dashboard/${qs}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [id, annee, qs]);

  const charges = data?.repartition_charges.filter((row) => row.montant > 0) ?? [];

  return (
    <AppShell title="" entrepriseId={id} entrepriseName={entreprise?.nom} annee={annee}>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8 text-[#285d4d]" />
        </div>
      ) : error ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-[#e5e9e6] bg-white p-8 text-center text-sm text-[#69736f]">
          {t("aucuneDonnee")}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-[11px] text-[#69736f]">{t("dashboard")}</p>
              <h1 className="text-[23px] font-semibold leading-none tracking-tight text-[#17221f]">
                {entreprise?.nom || t("dashboard")}
              </h1>
            </div>
            <Link
              href="/accountant/entreprises"
              className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-[#d9e2de] bg-white px-3 text-[10px] font-bold text-[#285d4d] hover:border-[#9db4aa]"
            >
              {t("changerEntreprise")}
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={t("chiffreAffaires")} value={data.kpis.chiffre_affaires} icon={<TrendingUp size={16} />} />
            <MetricCard label={t("totalAchats")} value={data.kpis.total_achats} icon={<Receipt size={16} />} />
            <MetricCard label={t("charges")} value={data.kpis.charges} icon={<Wallet size={16} />} />
            <MetricCard label={t("resultat")} value={data.kpis.resultat} icon={<BarChart3 size={16} />} />
          </div>

          <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.35fr_1fr]">
            <section className="min-w-0 rounded-[18px] border border-[#e5e9e6] bg-white p-6 shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">{t("evolutionResultats")}</h2>
                  <p className="mt-1 text-[11px] text-[#69736f]">Exercice {annee}</p>
                </div>
              </div>
              <div className="mt-6 h-[245px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.evolution}>
                    <XAxis dataKey="mois" fontSize={11} stroke="#9aa19e" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="#9aa19e" tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      formatter={(v: number) => formatDZD(v)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e5e9e6",
                        fontSize: 12,
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="produits" stroke="#8fbfae" strokeWidth={2} name={t("produits")} dot={false} />
                    <Line type="monotone" dataKey="charges" stroke="#c78455" strokeWidth={2} name={t("charges")} dot={false} />
                    <Line type="monotone" dataKey="resultat" stroke="#377a67" strokeWidth={3} name={t("resultat")} dot={{ r: 3, fill: "#fff", stroke: "#377a67" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="min-w-0 rounded-[18px] border border-[#e5e9e6] bg-white p-6 shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{t("repartitionCharges")}</h2>
                <p className="mt-1 text-[11px] text-[#69736f]">{formatDZD(data.kpis.charges)}</p>
              </div>
              <div className="mt-4 h-[245px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charges}
                      dataKey="montant"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      {charges.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatDZD(v)}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e9e6", fontSize: 12 }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
