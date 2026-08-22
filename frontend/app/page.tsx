"use client";

import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  FileSpreadsheet,
  Globe,
  Layers,
  Lock,
  MessageSquare,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

export default function LandingPage() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

  const quickLogin = async (role: "accountant" | "client") => {
    setLoggingIn(role);
    try {
      if (role === "accountant") {
        await login("comptable", "comptable");
        router.push("/accountant/dashboard");
      } else {
        await login("client", "client");
        router.push("/client/dashboard");
      }
    } catch {
      router.push("/login");
    } finally {
      setLoggingIn(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-brand selection:bg-lime selection:text-brand font-sans">
      {/* Top sticky navbar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/95 px-4 py-3.5 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tracking-tight text-white">
                Comptia
              </span>
              <span className="rounded-md bg-lime px-1.5 py-0.5 text-xs font-black text-brand">
                DZ
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/80">
            <a href="#features" className="hover:text-lime transition-colors">
              Fonctionnalités
            </a>
            <a href="#maiase" className="hover:text-lime transition-colors flex items-center gap-1.5">
              <Sparkles size={15} className="text-lime" />
              IA Maiase
            </a>
            <a href="#demo" className="hover:text-lime transition-colors">
              Accès Démo
            </a>
            <a href="#tarifs" className="hover:text-lime transition-colors">
              Tarifs
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle className="text-white hidden sm:flex" />
            {user ? (
              <Link
                href={user.role === "accountant" ? "/accountant/dashboard" : "/client/dashboard"}
              >
                <Button size="sm" variant="primary">
                  Mon Espace →
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/10">
                    Connexion
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" variant="primary" className="hidden sm:inline-flex">
                    Essayer gratuitement
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-brand pt-12 pb-24 text-white lg:pt-20 lg:pb-32">
        {/* Glowing background circles */}
        <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-4 py-1.5 text-xs font-semibold text-lime mb-6 backdrop-blur-sm animate-pulse-slow">
              <Sparkles size={14} />
              <span>Votre comptabilité devient intelligente</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white leading-tight">
              La comptabilité <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime via-[#E8FFC5] to-lime">
                réinventée par l&apos;IA
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-white/80 leading-relaxed max-w-2xl mx-auto">
              Automatisez, analysez et pilotez votre entreprise avec une plateforme
              intelligente et sécurisée. Scannez vos factures, générez vos écritures SCF et
              prenez les meilleures décisions grâce à notre IA <strong>Maiase</strong>.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login">
                <Button size="lg" variant="primary" className="gap-2 text-brand font-bold text-base px-8 py-6 rounded-2xl shadow-glow">
                  Découvrir la plateforme <ArrowRight size={18} />
                </Button>
              </Link>
              <a href="#demo">
                <Button size="lg" variant="outline" className="text-white border-white/20 bg-white/5 hover:bg-white/10 text-base px-6 py-6 rounded-2xl">
                  Tester la démo instantanée
                </Button>
              </a>
            </div>

            {/* Quick stats pills */}
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-white/10 pt-8 text-left">
              <div>
                <div className="text-2xl font-black text-lime">98.5%</div>
                <div className="text-xs text-white/70">Précision d&apos;extraction OCR</div>
              </div>
              <div>
                <div className="text-2xl font-black text-lime">80%</div>
                <div className="text-xs text-white/70">Temps de saisie économisé</div>
              </div>
              <div>
                <div className="text-2xl font-black text-lime">100%</div>
                <div className="text-xs text-white/70">Conforme SCF Algérie</div>
              </div>
              <div>
                <div className="text-2xl font-black text-lime">FR / AR</div>
                <div className="text-xs text-white/70">Bilingue avec support RTL</div>
              </div>
            </div>
          </div>

          {/* Interactive Laptop & UI Preview Mockup */}
          <div className="mt-16 mx-auto max-w-5xl">
            <div className="relative rounded-3xl border border-white/15 bg-gradient-to-b from-white/15 to-white/5 p-3 shadow-2xl backdrop-blur-xl">
              {/* Screen Frame */}
              <div className="overflow-hidden rounded-2xl bg-[#F7FAF7] shadow-inner text-brand">
                {/* Mockup Top Header */}
                <div className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500" />
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="ml-3 font-mono text-xs text-gray-400">
                      https://app.comptiadz.com/accountant/dashboard
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-lime-light px-2 py-0.5 text-[10px] font-bold text-brand">
                      🟢 Système opérationnel
                    </span>
                  </div>
                </div>

                {/* Mockup Dashboard Preview Body */}
                <div className="p-4 sm:p-6 grid gap-4 grid-cols-1 lg:grid-cols-3">
                  {/* Left 2 cols */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Hero AI Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-brand p-5 text-white shadow-brand-glow">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-lime mb-2">
                            <Sparkles size={13} /> Aperçu intelligent
                          </div>
                          <h3 className="text-xl font-extrabold">Votre entreprise en bonne santé</h3>
                          <p className="text-xs text-white/70 mt-1">Mis à jour aujourd&apos;hui avec l&apos;IA Maiase</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-dark ring-2 ring-lime animate-pulse-slow">
                            <Bot size={26} className="text-lime" />
                          </div>
                          <button className="rounded-xl bg-lime px-3.5 py-2 text-xs font-bold text-brand hover:bg-lime-hover transition-colors">
                            Voir les insights IA →
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* KPI mini row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500">Chiffre d&apos;affaires</div>
                        <div className="text-xl font-extrabold text-brand mt-1">125 500 €</div>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <TrendingUp size={14} /> +12.5% vs mois dernier
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500">Résultat net</div>
                        <div className="text-xl font-extrabold text-brand mt-1">28 420 €</div>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <TrendingUp size={14} /> +8.3% vs mois dernier
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right col: Maiase insight widget */}
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-lime/40 bg-lime-light/60 p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/maiase.png" alt="Maiase" className="h-12 w-12 rounded-full object-contain animate-float" />
                        <div>
                          <div className="text-xs font-bold text-brand uppercase tracking-wider">Insight IA · Maiase</div>
                          <p className="text-xs text-brand/80 mt-1 leading-snug">
                            « Vos charges ont augmenté de 15% ce mois-ci, principalement en Achats & Services. »
                          </p>
                        </div>
                      </div>
                      <button className="mt-3 w-full rounded-xl bg-brand py-2 text-center text-xs font-semibold text-white hover:bg-brand-dark">
                        Voir l&apos;analyse complète →
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-2">
                        <span>À FAIRE</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">4 urgences</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-1 border-b">
                          <span>Factures à valider</span>
                          <span className="font-bold text-brand">12</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span>Paiements en retard</span>
                          <span className="font-bold text-rose-600">5</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Rapprochement bancaire</span>
                          <span className="font-bold text-amber-600">18</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 PILLARS BANNER (matching future_look.png) */}
      <section className="border-y border-gray-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-brand tracking-tight">
              L&apos;intelligence au service de votre comptabilité
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Une technologie conçue pour les cabinets comptables et les entreprises modernes
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <Zap size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">Automatisation</h3>
                <p className="text-xs text-gray-600 mt-1">
                  L&apos;IA automatise la saisie, l&apos;OCR et la catégorisation des pièces.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">Précision</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Moins d&apos;erreurs humaines, équilibre strict débit/crédit et conformité SCF.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <TrendingUp size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">Prédictions</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Anticipez votre trésorerie, vos marges et votre compte de résultat.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">Gain de temps</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Gagnez jusqu&apos;à 15 heures par semaine et concentrez-vous sur la croissance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIASE AI SHOWCASE */}
      <section id="maiase" className="py-20 bg-[#F7FAF7]">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-lime-light px-3.5 py-1 text-xs font-bold text-brand mb-4">
                <Bot size={16} /> Rencontrez Maiase
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-brand tracking-tight">
                Votre assistant comptable IA qui ne dort jamais
              </h2>
              <p className="mt-4 text-base text-gray-600 leading-relaxed">
                <strong>Maiase</strong> est l&apos;intelligence artificielle au cœur de Comptia DZ.
                Elle comprend les spécificités fiscales et comptables locales, analyse
                les documents scannés par vos clients et pré-remplit les écritures comptables
                avec un taux de confiance instantané.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">Lecture OCR intelligente en Français et Arabe</strong>
                    <p className="text-xs text-gray-500">Extraction automatique des NIF, NIS, dates, montants HT, TVA et TTC.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">Classification automatique par Journal</strong>
                    <p className="text-xs text-gray-500">Affectation intelligente des comptes (6011, 44566, 4011...) sans saisie manuelle.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">Détection proactive des anomalies</strong>
                    <p className="text-xs text-gray-500">Alerte immédiate en cas de déséquilibre ou d&apos;émetteur non reconnu.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Maiase Card */}
            <div className="relative">
              <div className="rounded-3xl border border-lime/40 bg-white p-8 shadow-card relative overflow-hidden">
                <div className="flex items-center gap-4 border-b pb-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/maiase.png" alt="Maiase AI" className="h-20 w-20 rounded-2xl object-contain bg-brand/5 p-1 ring-2 ring-lime" />
                  <div>
                    <h3 className="text-xl font-extrabold text-brand">Maiase IA</h3>
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      En ligne · Prête à analyser vos pièces
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-xl bg-lime-light/60 p-3.5 text-xs text-brand">
                    <span className="font-bold">Message de Maiase :</span> « J&apos;ai scanné 28 nouvelles factures aujourd&apos;hui. 26 ont un score de confiance de 95%+ et sont prêtes à être validées en 1 clic ! »
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600 flex items-center justify-between">
                    <span>Temps moyen d&apos;analyse par document</span>
                    <strong className="text-brand font-bold">1.4 seconde</strong>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600 flex items-center justify-between">
                    <span>Reconnaissance multi-devises</span>
                    <strong className="text-brand font-bold">DZD, EUR, USD</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK 1-CLICK DEMO ACCESS */}
      <section id="demo" className="py-20 bg-brand text-white relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="rounded-full bg-lime/20 border border-lime/30 px-3.5 py-1 text-xs font-bold text-lime uppercase tracking-wider">
              Accès Instantané
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold mt-3">
              Testez la plateforme en 1 Clic
            </h2>
            <p className="text-sm text-white/70 mt-2">
              Choisissez un profil de démonstration pour explorer immédiatement toutes les fonctionnalités sans inscription.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-3xl mx-auto">
            {/* Demo Accountant */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 hover:border-lime transition-all backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-2xl bg-lime p-3 text-brand">
                  <UserCheck size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Espace Expert-Comptable</h3>
                  <p className="text-xs text-lime">Accès complet cabinet</p>
                </div>
              </div>
              <p className="text-xs text-white/70 mb-6">
                Accédez à la gestion multi-entreprises, journaux (Achats, Ventes, Banque, Caisse, OD),
                balance, compte de résultat, grand livre et validation de factures.
              </p>
              <Button
                variant="primary"
                className="w-full font-bold"
                disabled={loggingIn !== null}
                onClick={() => quickLogin("accountant")}
              >
                {loggingIn === "accountant" ? "Connexion..." : "Accéder comme Comptable →"}
              </Button>
            </div>

            {/* Demo Client */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 hover:border-lime transition-all backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-2xl bg-white/10 p-3 text-lime border border-white/10">
                  <ScanLine size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Espace Client Entreprise</h3>
                  <p className="text-xs text-lime">Interface mobile-first</p>
                </div>
              </div>
              <p className="text-xs text-white/70 mb-6">
                Prenez des photos de factures avec l&apos;appareil guidé, consultez le statut
                d&apos;avancement et échangez par messagerie directe avec votre comptable.
              </p>
              <Button
                variant="outline"
                className="w-full text-white border-white/20 bg-white/10 hover:bg-white/20 font-bold"
                disabled={loggingIn !== null}
                onClick={() => quickLogin("client")}
              >
                {loggingIn === "client" ? "Connexion..." : "Accéder comme Client →"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-brand tracking-tight">
              Tout ce dont vous avez besoin pour gérer votre comptabilité
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Des outils robustes pensés pour le plan comptable algérien
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <ScanLine size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">Scanner & OCR Intelligent</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Glissez-déposez des PDF ou prenez des photos depuis votre téléphone. L&apos;IA extrait automatiquement
                les lignes de factures avec calcul de TVA.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <FileSpreadsheet size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">Journaux & Grand Livre</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Gestion des journaux d&apos;Achats, Ventes, Caisse, Banque et OD. Création de journaux
                personnalisés et export instantané en PDF.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">Balance & Compte de Résultat</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Calcul automatique des soldes débiteurs/créditeurs, répartition des charges
                et détermination instantanée du bénéfice ou de la perte.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <Globe size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">100% Bilingue FR / AR</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Bascule instantanée entre le Français et l&apos;Arabe avec inversion automatique
                de la mise en page (RTL) pour une ergonomie parfaite.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <MessageSquare size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">Messagerie Client-Comptable</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Canal de discussion direct entre l&apos;entreprise et son expert-comptable pour clarifier
                les pièces justificatives en quelques secondes.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">Sécurité & Verrouillage NIF</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Verrouillage strict des données sensibles (NIF, NIS, exercices clôturés)
                et contrôle d&apos;accès basé sur les rôles JWT.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-brand py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">Comptia</span>
              <span className="rounded-md bg-lime px-1.5 py-0.5 text-xs font-black text-brand">DZ</span>
              <span className="text-xs text-white/60 ml-2">· Votre comptabilité devient intelligente</span>
            </div>

            <div className="flex items-center gap-6 text-xs text-white/70">
              <Link href="/login" className="hover:text-lime">Connexion</Link>
              <Link href="/register" className="hover:text-lime">Créer un compte</Link>
              <a href="#features" className="hover:text-lime">Fonctionnalités</a>
            </div>

            <div className="text-xs text-white/50">
              © {new Date().getFullYear()} Comptia DZ. Tous droits réservés.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

