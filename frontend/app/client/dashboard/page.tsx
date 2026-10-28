"use client";

import { CheckCircle2, Clock, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { api } from "@/lib/api";
import { Facture } from "@/lib/types";

export default function ClientDashboard() {
  const [factures, setFactures] = useState<Facture[]>([]);

  useEffect(() => {
    api.get<Facture[]>("/api/factures/").then(setFactures).catch(() => {});
  }, []);

  const total = factures.length;
  const validated = factures.filter((f) => f.statut === "valide").length;
  const pending = factures.filter((f) => f.statut === "en_cours").length;

  return (
    <ClientShell>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Envoyées" value={total} icon={<FileText size={16} />} />
        <Metric label="Validées" value={validated} icon={<CheckCircle2 size={16} />} />
        <Metric label="En cours" value={pending} icon={<Clock size={16} />} />
      </div>
    </ClientShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-[#e5e9e6] bg-white p-5 shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.07em] text-[#727c78]">
        <span>{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#eff5f2] text-[#376e5c]">{icon}</span>
      </div>
      <strong className="mt-4 block text-[22px] font-semibold leading-none tracking-tight text-[#17221f]">
        {value}
      </strong>
    </article>
  );
}
