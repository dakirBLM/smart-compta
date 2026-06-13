"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";
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

  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex justify-between border-b py-2 text-sm">
      <span>{label}</span>
      <span className="font-medium">{formatDZD(value)}</span>
    </div>
  );

  return (
    <AppShell
      title={t("compteResultat")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-lg font-bold text-danger">{t("charges")}</h3>
              <Row label={t("exploitation")} value={data.charges.exploitation} />
              <Row label={t("financieres")} value={data.charges.financieres} />
              <Row label={t("exceptionnelles")} value={data.charges.exceptionnelles} />
              <Row label={t("impotsBenefices")} value={data.charges.impots} />
              <div className="mt-3 flex justify-between rounded-lg bg-red-50 p-2 font-bold text-danger">
                <span>{t("totalDesCharges")}</span>
                <span>{formatDZD(data.total_charges)}</span>
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-lg font-bold text-success">{t("produits")}</h3>
              <Row label={t("exploitation")} value={data.produits.exploitation} />
              <Row label={t("financieres")} value={data.produits.financiers} />
              <Row label={t("exceptionnelles")} value={data.produits.exceptionnels} />
              <div className="py-2 text-sm">&nbsp;</div>
              <div className="mt-3 flex justify-between rounded-lg bg-green-50 p-2 font-bold text-success">
                <span>{t("totalDesProduits")}</span>
                <span>{formatDZD(data.total_produits)}</span>
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <div
              className={`flex items-center justify-between text-lg font-bold ${
                data.is_benefice ? "text-success" : "text-danger"
              }`}
            >
              <span>{data.is_benefice ? t("benefice") : t("perte")}</span>
              <span>{formatDZD(Math.abs(data.resultat))}</span>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
