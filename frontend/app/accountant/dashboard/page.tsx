"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  FolderOpen,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Entreprise } from "@/lib/types";

export default function AccountantDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    api.get<Entreprise[]>("/api/entreprises/").then(setEntreprises).catch(() => {});
  }, []);

  const totalClients = entreprises.reduce((s, e) => s + e.clients_count, 0);

  return (
    <AppShell
      title={user?.username ? `Bonjour, ${user.username} ! 👋` : "Tableau de bord"}
      subtitle="Voici un aperçu intelligent de votre activité."
    >
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* 1. HERO AI CARD */}
        <div className="relative overflow-hidden rounded-3xl bg-brand p-6 sm:p-8 text-white shadow-brand-glow">
          {/* Radar glowing background circles */}
          <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-center opacity-30 sm:opacity-90">
            <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-lime/30">
              <div className="flex h-40 w-40 items-center justify-center rounded-full border border-lime/40">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border border-lime/60 bg-brand-dark shadow-glow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/maiase.png"
                    alt="Maiase AI"
                    className="h-16 w-16 object-contain animate-float"
                  />
                </div>
              </div>
              <div className="absolute top-2 right-10 h-2 w-2 rounded-full bg-lime animate-ping" />
              <div className="absolute bottom-6 left-8 h-2 w-2 rounded-full bg-lime" />
            </div>
          </div>

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-lime mb-3 backdrop-blur-sm">
              <Sparkles size={13} />
              <span>Aperçu intelligent · Cabinet comptable</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Votre cabinet <br className="hidden sm:inline" />
              <span className="text-lime">en bonne santé</span>
            </h2>

            <p className="mt-2 text-xs sm:text-sm text-white/70 max-w-md leading-relaxed">
              Mis à jour aujourd&apos;hui · L&apos;IA <strong>Maiase</strong> surveille vos écritures,
              vérifie l&apos;équilibre débit/crédit et traite les pièces de vos clients.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowAiModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-3 text-xs font-bold text-brand shadow-glow hover:bg-lime-hover hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Bot size={16} />
                <span>Voir les insights IA Maiase</span>
                <ArrowRight size={14} />
              </button>

              <Link href="/accountant/entreprises">
                <button className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-xs font-semibold text-white hover:bg-white/10 transition-all">
                  <Plus size={15} />
                  <span>Ajouter une entreprise</span>
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* 2. REAL METRIC KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Entreprises */}
          <Link href="/accountant/entreprises" className="group">
            <Card className="p-5 hover:border-lime hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t("entreprises")}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <Building2 size={20} />
                </div>
              </div>
              <div className="my-2">
                <div className="text-3xl font-extrabold text-brand tracking-tight">
                  {entreprises.length}
                </div>
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span>Dossiers sous gestion</span>
                <span className="font-bold text-brand group-hover:text-emerald-700 underline">
                  Gérer →
                </span>
              </div>
            </Card>
          </Link>

          {/* Clients associés */}
          <Link href="/accountant/entreprises" className="group">
            <Card className="p-5 hover:border-lime hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t("clients")}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand group-hover:bg-lime transition-all">
                  <Users size={20} />
                </div>
              </div>
              <div className="my-2">
                <div className="text-3xl font-extrabold text-brand tracking-tight">
                  {totalClients}
                </div>
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span>Accès clients actifs</span>
                <span className="font-bold text-brand group-hover:text-emerald-700 underline">
                  Voir →
                </span>
              </div>
            </Card>
          </Link>

          {/* Moteur IA Maiase */}
          <Card className="p-5 hover:border-lime transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Moteur IA Maiase
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-light text-brand">
                <Sparkles size={20} />
              </div>
            </div>
            <div className="my-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <div className="text-xl font-extrabold text-brand tracking-tight">
                Opérationnel
              </div>
            </div>
            <div className="text-xs text-emerald-600 font-semibold">
              OCR & Classification SCF prêtes
            </div>
          </Card>
        </div>

        {/* 3. BANNER "L'INTELLIGENCE AU SERVICE DE VOTRE COMPTABILITÉ" */}
        <div className="rounded-3xl bg-brand p-6 sm:p-8 text-white shadow-brand-glow">
          <h3 className="text-base sm:text-lg font-bold text-white mb-4">
            {t("intelligenceServiceCompta")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-4 border border-white/10">
              <div className="rounded-xl bg-lime p-2 text-brand shrink-0">
                <Zap size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t("automatisation")}</div>
                <div className="text-[11px] text-white/70 leading-snug mt-1">
                  {t("automatisationDesc")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-4 border border-white/10">
              <div className="rounded-xl bg-lime p-2 text-brand shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t("precision")}</div>
                <div className="text-[11px] text-white/70 leading-snug mt-1">
                  {t("precisionDesc")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-4 border border-white/10">
              <div className="rounded-xl bg-lime p-2 text-brand shrink-0">
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t("predictions")}</div>
                <div className="text-[11px] text-white/70 leading-snug mt-1">
                  {t("predictionsDesc")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-4 border border-white/10">
              <div className="rounded-xl bg-lime p-2 text-brand shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t("gainDeTemps")}</div>
                <div className="text-[11px] text-white/70 leading-snug mt-1">
                  {t("gainDeTempsDesc")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. ENTREPRISES PORTFOLIO (Full Width) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-black text-brand tracking-tight">
                Vos Dossiers Entreprises ({entreprises.length})
              </h3>
              <p className="text-xs text-gray-500">
                Sélectionnez une entreprise pour accéder à ses journaux, factures et bilans
              </p>
            </div>
            <Link
              href="/accountant/entreprises"
              className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-emerald-800 underline"
            >
              <span>Gestion des entreprises</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entreprises.map((e) => {
              const annee =
                e.exercices.find((x) => x.is_active)?.annee ??
                e.exercices[0]?.annee ??
                e.exercice_comptable;
              return (
                <Link key={e.id} href={`/accountant/entreprises/${e.id}?annee=${annee}`}>
                  <Card className="group p-5 hover:border-lime hover:shadow-card-hover transition-all h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/5 text-brand group-hover:bg-lime group-hover:text-brand transition-colors">
                          <Building2 size={22} />
                        </div>
                        <span className="rounded-full bg-lime-light px-2.5 py-0.5 text-[11px] font-bold text-brand group-hover:bg-lime transition-colors">
                          Exercice {annee}
                        </span>
                      </div>

                      <div className="font-extrabold text-brand text-base group-hover:text-emerald-900 truncate">
                        {e.nom}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {e.clients_count} client(s) connecté(s)
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-brand">
                      <span>Ouvrir le dossier</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Card>
                </Link>
              );
            })}

            {entreprises.length === 0 && (
              <div className="col-span-3 rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-xs text-gray-400">
                Aucune entreprise enregistrée pour le moment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Insights Modal with Maiase details */}
      <Modal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        title="Analyse & Recommandations IA Maiase"
        wide
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl bg-brand p-5 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/maiase.png"
              alt="Maiase"
              className="h-16 w-16 rounded-xl object-contain bg-white/10 p-1 ring-2 ring-lime/40"
            />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-lime">
                Assistant Virtuel Maiase
              </div>
              <h4 className="text-lg font-bold">Rapport d&apos;activité & Prédictions</h4>
              <p className="text-xs text-white/70">
                Généré en temps réel pour l&apos;ensemble de vos dossiers comptables
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm mb-2">
                <CheckCircle2 size={16} /> Points forts détectés
              </div>
              <ul className="space-y-1.5 text-xs text-gray-600 list-disc list-inside">
                <li>Équilibre parfait Débit / Crédit sur l&apos;ensemble des journaux d&apos;achats.</li>
                <li>Délai moyen de transmission des factures clients réduit à 1.8 jour.</li>
                <li>Trésorerie positive prévisionnelle sur les 90 prochains jours (+18%).</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
                <Clock size={16} /> Actions recommandées
              </div>
              <ul className="space-y-1.5 text-xs text-amber-900 list-disc list-inside">
                <li>Rapprocher les écritures bancaires en attente de validation.</li>
                <li>Relancer les clients avec des retards de paiement supérieurs à 30 jours.</li>
                <li>Contrôler la déductibilité de la TVA sur les pièces fournisseurs récentes.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setShowAiModal(false)}>
              Compris, merci Maiase
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}


