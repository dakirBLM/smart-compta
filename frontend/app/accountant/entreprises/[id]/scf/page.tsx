"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useEntreprise } from "@/lib/useEntreprise";

type ScfAccount = { numero_compte: string; libelle: string; parent?: string | null };

export default function SCFPage() {
  const { id, entreprise, annee } = useEntreprise();
  const [data, setData] = useState<Record<string, ScfAccount[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Record<string, ScfAccount[]>>(`/api/entreprises/${id}/scf/`)
      .then((d) => setData(d))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AppShell title="Tableau SCF" entrepriseId={id} entrepriseName={entreprise?.nom} annee={annee}>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8 text-[#285d4d]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }, (_, i) => (i + 1).toString()).map((cls) => {
            const accounts = data[cls] || [];
            return (
              <section
                key={cls}
                className="flex min-w-0 flex-col rounded-2xl border border-[#e5e9e6] bg-white p-5 shadow-[0_4px_18px_rgba(27,55,46,0.025)]"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight text-[#17221f]">Classe {cls}</h2>
                  <span className="rounded-full bg-[#eaf2ee] px-2.5 py-1 text-[11px] font-semibold text-[#214f40]">
                    {accounts.length}
                  </span>
                </div>
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {accounts.length === 0 ? (
                    <p className="text-sm text-[#69736f]">Aucun compte.</p>
                  ) : (
                    Array.from(new Set(accounts.map((a) => a.parent || a.numero_compte))).map((parent) => {
                      const parentAccount = accounts.find((a) => a.numero_compte === parent);
                      const children = accounts.filter((a) => a.parent === parent);
                      return (
                        <div key={parent}>
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 font-mono text-[13px] font-semibold text-[#214f40]">{parent}</span>
                            <span className="text-sm text-[#17221f]">{parentAccount?.libelle || "Compte SCF"}</span>
                          </div>
                          {children.map((a) => (
                            <div
                              key={a.numero_compte}
                              className="ml-3 mt-1.5 flex items-start gap-3 border-l border-[#e5e9e6] pl-3"
                            >
                              <span className="shrink-0 font-mono text-[13px] text-[#5e6a65]">{a.numero_compte}</span>
                              <span className="text-sm text-[#35433e]">{a.libelle}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
