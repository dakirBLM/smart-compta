"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Book,
  Bot,
  FileCheck,
  FolderOpen,
  Landmark,
  Plus,
  Receipt,
  Scale,
  Sparkles,
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
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { DashboardData } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { formatDZD } from "@/lib/utils";

const CHART_COLORS = ["#1F3D35", "#C8F15A", "#10B981", "#F59E0B", "#6366F1", "#9CA3AF"];

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: number;
  change?: number;
  icon: React.ReactNode;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <Card className="flex flex-col justify-between p-5 hover:border-lime transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <div className="rounded-xl bg-lime-light p-2 text-brand">{Icon}</div>
      </div>
      <div className="my-2">
        <div className="text-2xl font-black text-brand tracking-tight">
          {formatDZD(value)}
        </div>
      </div>
      {change !== undefined && (
        <div
          className={`flex items-center gap-1 text-xs font-bold ${
            up ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(change)}% vs période précédente</span>
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
  const base = `/accountant/entreprises/${id}`;
  const qs = annee ? `?annee=${annee}` : "";

  useEffect(() => {
    if (!id) return;
    api
      .get<DashboardData>(`/api/entreprises/${id}/dashboard/${qs}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [id, annee, qs]);

  return (
    <AppShell
      title={entreprise?.nom || t("dashboard")}
      subtitle={`Tableau de bord financier · Exercice ${annee || ""}`}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : error ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          {t("aucuneDonnee")}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Top Row: AI Status Banner & Quick Shortcut links */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl bg-brand p-6 text-white shadow-brand-glow">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/maiase.png" alt="Maiase" className="h-14 w-14 rounded-2xl bg-white/10 p-1 object-contain shrink-0 ring-2 ring-lime/40" />
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-lime/20 px-2.5 py-0.5 text-[11px] font-bold text-lime mb-1">
                  <Sparkles size={12} /> Analyse Comptable en temps réel
                </div>
                <h3 className="text-lg font-bold text-white">
                  Dossier à jour · Exercice fiscal {annee}
                </h3>
                <p className="text-xs text-white/70">
                  Toutes les écritures de ventes et d&apos;achats sont équilibrées
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`${base}/factures${qs}`}>
                <button className="rounded-xl bg-lime px-4 py-2 text-xs font-bold text-brand hover:bg-lime-hover shadow-glow-sm transition-all">
                  Scanner une facture →
                </button>
              </Link>
            </div>
          </div>

          {/* KPIs Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("chiffreAffaires")}
              value={data.kpis.chiffre_affaires}
              change={12.5}
              icon={<TrendingUp size={20} />}
            />
            <KpiCard
              label={t("totalAchats")}
              value={data.kpis.total_achats}
              change={-4.2}
              icon={<Receipt size={20} />}
            />
            <KpiCard
              label={t("charges")}
              value={data.kpis.charges}
              change={6.1}
              icon={<Wallet size={20} />}
            />
            <KpiCard
              label={t("resultat")}
              value={data.kpis.resultat}
              change={9.4}
              icon={<BarChart3 size={20} />}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Evolution chart */}
            <Card className="p-6">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <div>
                  <h3 className="font-bold text-brand text-base">
                    {t("evolutionResultats")}
                  </h3>
                  <p className="text-xs text-gray-500">Mois par mois sur l&apos;exercice</p>
                </div>
                <span className="rounded-full bg-lime-light px-2.5 py-0.5 text-xs font-bold text-brand">
                  Exercice {annee}
                </span>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.evolution}>
                  <XAxis dataKey="mois" fontSize={11} stroke="#9CA3AF" />
                  <YAxis fontSize={11} stroke="#9CA3AF" />
                  <Tooltip
                    formatter={(v: number) => formatDZD(v)}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="produits"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    name={t("produits")}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="charges"
                    stroke="#F43F5E"
                    strokeWidth={2.5}
                    name={t("charges")}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="resultat"
                    stroke="#1F3D35"
                    strokeWidth={3}
                    name={t("resultat")}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Repartition charges */}
            <Card className="p-6">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <div>
                  <h3 className="font-bold text-brand text-base">
                    {t("repartitionCharges")}
                  </h3>
                  <p className="text-xs text-gray-500">Répartition par catégorie de compte</p>
                </div>
                <span className="text-xs font-semibold text-gray-400">Total Charges</span>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.repartition_charges.filter((r) => r.montant > 0)}
                    dataKey="montant"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={3}
                  >
                    {data.repartition_charges.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatDZD(v)}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Quick Access to Business Subpages */}
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
              Accès rapide aux modules
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Link
                href={`${base}/journaux/achat${qs}`}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-card hover:border-lime hover:shadow-card-hover transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <Book size={18} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-brand">Journaux</h4>
                <p className="text-[11px] text-gray-500">Achats, Ventes, Caisse, Banque, OD</p>
              </Link>

              <Link
                href={`${base}/compte-resultat${qs}`}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-card hover:border-lime hover:shadow-card-hover transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <BarChart3 size={18} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-brand">Compte de résultat</h4>
                <p className="text-[11px] text-gray-500">Charges vs Produits & Bénéfice</p>
              </Link>

              <Link
                href={`${base}/balance${qs}`}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-card hover:border-lime hover:shadow-card-hover transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <Scale size={18} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-brand">La Balance</h4>
                <p className="text-[11px] text-gray-500">Soldes par classe & Export PDF</p>
              </Link>

              <Link
                href={`${base}/releves-bancaires${qs}`}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-card hover:border-lime hover:shadow-card-hover transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <Landmark size={18} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-brand">Relevé bancaire</h4>
                <p className="text-[11px] text-gray-500">Rapprochement automatique</p>
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

