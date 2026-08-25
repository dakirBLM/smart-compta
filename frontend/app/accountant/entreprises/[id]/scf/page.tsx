"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function SCFPage() {
  const params = useParams();
  const entrepriseId = params?.id;
  const [data, setData] = useState<Record<string, { numero_compte: string; libelle: string; parent?: string | null }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entrepriseId) return;
    setLoading(true);
    api
      .get<Record<string, { numero_compte: string; libelle: string; parent?: string | null }[]>>(
        `/api/entreprises/${entrepriseId}/scf/`
      )
      .then((d) => setData(d))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [entrepriseId]);

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tableau SCF</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 7 }, (_, i) => (i + 1).toString()).map((cls) => (
          <div key={cls} className="rounded-lg border bg-white p-4">
            <div className="mb-2 font-semibold">Classe {cls}</div>
            <div className="text-sm text-gray-600">
              {(data[cls] || []).length} comptes
            </div>
            <div className="mt-3 space-y-3 max-h-64 overflow-y-auto">
              {Array.from(
                new Set((data[cls] || []).map((a) => a.parent || a.numero_compte))
              ).map((parent) => {
                const parentAccount = (data[cls] || []).find((a) => a.numero_compte === parent);
                const children = (data[cls] || []).filter((a) => a.parent === parent);
                return (
                  <div key={parent}>
                    <div className="flex items-start gap-3 font-semibold">
                      <div className="font-mono text-sm text-brand">{parent}</div>
                      <div className="text-sm">{parentAccount?.libelle || "Compte SCF"}</div>
                    </div>
                    {children.map((a) => (
                      <div key={a.numero_compte} className="ml-5 flex items-start gap-3 border-l pl-3">
                        <div className="font-mono text-sm text-brand">{a.numero_compte}</div>
                        <div className="text-sm">{a.libelle}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {(data[cls] || []).length === 0 && (
                <div className="text-sm text-gray-400">Aucun compte.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
