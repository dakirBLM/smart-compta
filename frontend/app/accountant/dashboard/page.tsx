"use client";

import { Building2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Entreprise } from "@/lib/types";

export default function AccountantDashboard() {
  const { t } = useI18n();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);

  useEffect(() => {
    api.get<Entreprise[]>("/api/entreprises/").then(setEntreprises).catch(() => {});
  }, []);

  const totalClients = entreprises.reduce((s, e) => s + e.clients_count, 0);

  return (
    <AppShell title={t("dashboard")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3 text-brand">
            <Building2 />
            <span className="text-sm text-gray-500">{t("entreprises")}</span>
          </div>
          <div className="kpi-number mt-2 text-brand">{entreprises.length}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 text-brand">
            <Users />
            <span className="text-sm text-gray-500">{t("clients")}</span>
          </div>
          <div className="kpi-number mt-2 text-brand">{totalClients}</div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-brand">
        {t("entreprises")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entreprises.map((e) => {
          const annee =
            e.exercices.find((x) => x.is_active)?.annee ??
            e.exercices[0]?.annee ??
            e.exercice_comptable;
          return (
            <Link key={e.id} href={`/accountant/entreprises/${e.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="font-semibold text-brand">{e.nom}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {t("annees")}: {annee} · {e.clients_count} {t("clients")}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
