"use client";

import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { InvoiceCard } from "@/components/InvoiceCard";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";

export default function ClientDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [factures, setFactures] = useState<Facture[]>([]);

  useEffect(() => {
    api.get<Facture[]>("/api/factures/").then(setFactures).catch(() => {});
  }, []);

  const total = factures.length;
  const validated = factures.filter((f) => f.statut === "valide").length;
  const pending = factures.filter((f) => f.statut === "en_cours").length;

  return (
    <ClientShell>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Welcome Hero Banner with Maiase */}
        <div className="relative overflow-hidden rounded-3xl bg-brand p-6 sm:p-8 text-white shadow-brand-glow">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-lg">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-lime/20 border border-lime/30 px-3 py-0.5 text-xs font-bold text-lime">
                <Sparkles size={13} /> Espace Entreprise Connectée
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Bonjour, {user?.username} ! 👋
              </h2>
              <p className="text-xs text-white/70 leading-relaxed">
                Transmettez vos factures en un éclair. Maiase et votre expert-comptable s&apos;occupent du reste.
              </p>
            </div>

            {/* Maiase Avatar */}
            <div className="flex items-center gap-3 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/maiase.png"
                alt="Maiase AI Assistant"
                className="h-20 w-20 rounded-2xl bg-white/10 p-1 object-contain ring-2 ring-lime/40 animate-float"
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-white/60">Total envoyées : </span>
                <strong className="text-lime text-sm">{total}</strong>
              </div>
              <div>
                <span className="text-white/60">Validées : </span>
                <strong className="text-emerald-400 text-sm">{validated}</strong>
              </div>
              <div>
                <span className="text-white/60">En cours : </span>
                <strong className="text-amber-300 text-sm">{pending}</strong>
              </div>
            </div>

            <Link href="/client/scanner">
              <Button variant="primary" size="lg" className="font-bold text-sm shadow-glow gap-2 py-3 px-6 rounded-2xl">
                <Camera size={18} /> {t("prendrePhoto")} →
              </Button>
            </Link>
          </div>
        </div>

        {/* Photography guidelines reminder */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="rounded-xl bg-lime-light p-2.5 text-brand shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-brand">Photo bien éclairée</div>
              <div className="text-[11px] text-gray-500">{t("reglePhotoClaire")}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="rounded-xl bg-lime-light p-2.5 text-brand shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-brand">Cachet & Signature</div>
              <div className="text-[11px] text-gray-500">{t("reglePhotoSignee")}</div>
            </div>
          </div>
        </div>

        {/* Factures Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
              Dernières factures transmises
            </h3>
            <Link
              href="/client/factures"
              className="text-xs font-semibold text-brand hover:text-emerald-800 underline"
            >
              Voir l&apos;historique complet →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {factures.slice(0, 6).map((f) => (
              <InvoiceCard key={f.id} facture={f} />
            ))}
            {factures.length === 0 && (
              <div className="col-span-2 rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-xs text-gray-400">
                {t("aucuneDonnee")}. Cliquez sur &quot;Prendre une photo&quot; pour envoyer votre première facture !
              </div>
            )}
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

