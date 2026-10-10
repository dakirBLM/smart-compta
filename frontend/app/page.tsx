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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const sentinel = document.getElementById("top-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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
      <header
        className={`sticky top-0 z-50 px-4 py-3.5 sm:px-8 ${
          prefersReducedMotion ? "" : "transition-all duration-300"
        } ${
          scrolled
            ? "border-b border-white/10 shadow-sm bg-brand/95 backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
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
              {t("navFeatures")}
            </a>
            <a href="#maiase" className="hover:text-lime transition-colors flex items-center gap-1.5">
              <Sparkles size={15} className="text-lime" />
              {t("navMaiase")}
            </a>
            <a href="#demo" className="hover:text-lime transition-colors">
              {t("navDemo")}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle className="text-white" />
            {user ? (
              <Link
                href={user.role === "accountant" ? "/accountant/dashboard" : "/client/dashboard"}
              >
                <Button size="sm" variant="primary">
                  {t("navSpace")} →
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/10">
                    {t("login")}
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" variant="primary" className="hidden sm:inline-flex">
                    {t("navSignup")}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      {/* Keep -mt-16 and pt-16 paired with the header height; update both if header sizing changes. */}
      <section className="relative -mt-16 overflow-hidden bg-brand pt-16 pb-16 text-white">
        <div
          id="top-sentinel"
          className="absolute top-0 h-px w-full pointer-events-none"
          aria-hidden="true"
        />
        {/* Glowing background circles */}
        <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="flex items-center px-4 py-12 sm:px-8 lg:py-0 lg:pl-16 lg:pr-12">
            <div className="mx-auto w-full max-w-xl text-center lg:text-left">
              <h1 className="text-center text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-left lg:text-6xl">
                {t("heroTitle")}
              </h1>

              <p className="mt-6 text-base leading-relaxed text-white/80 sm:text-lg">
                {t("heroSubtitle")}
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                <Link href="/login">
                  <Button size="lg" variant="primary" className="gap-2 text-brand font-bold text-base px-8 py-6 rounded-2xl shadow-glow">
                    {t("heroCta")} <ArrowRight size={18} />
                  </Button>
                </Link>
              </div>
            </div>

          </div>

          <div className="h-[320px] lg:h-[640px]">
            {prefersReducedMotion ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/maiase.png" alt="" className="h-full w-full object-cover" />
            ) : (
              <video autoPlay loop muted playsInline poster="/maiase.png" className="h-full w-full object-cover">
                <source src="/maiase-loop.mp4" type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      </section>

      <section className="bg-brand pt-6 pb-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          {/* Interactive Laptop & UI Preview Mockup */}
          <div className="mx-auto max-w-5xl">
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
                      🟢 {t("landingMockStatus")}
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
                            <Sparkles size={13} /> {t("landingMockOverview")}
                          </div>
                          <h3 className="text-xl font-extrabold">{t("landingMockHealth")}</h3>
                          <p className="text-xs text-white/70 mt-1">{t("landingMockUpdated")}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-dark ring-2 ring-lime animate-pulse-slow">
                            <Bot size={26} className="text-lime" />
                          </div>
                          <button className="rounded-xl bg-lime px-3.5 py-2 text-xs font-bold text-brand hover:bg-lime-hover transition-colors">
                            {t("landingMockInsights")}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* KPI mini row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500">{t("landingMockRevenue")}</div>
                        <div className="text-xl font-extrabold text-brand mt-1">125 500 €</div>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <TrendingUp size={14} /> +12.5% {t("landingMockVsLastMonth")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="text-xs font-medium text-gray-500">{t("landingMockNetIncome")}</div>
                        <div className="text-xl font-extrabold text-brand mt-1">28 420 €</div>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <TrendingUp size={14} /> +8.3% {t("landingMockVsLastMonth")}
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
                          <div className="text-xs font-bold text-brand uppercase tracking-wider">{t("landingMockInsightTitle")}</div>
                          <p className="text-xs text-brand/80 mt-1 leading-snug">
                            {t("landingMockInsightQuote")}
                          </p>
                        </div>
                      </div>
                      <button className="mt-3 w-full rounded-xl bg-brand py-2 text-center text-xs font-semibold text-white hover:bg-brand-dark">
                        {t("landingMockFullAnalysis")}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-2">
                        <span>{t("landingMockTodo")}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">{t("landingMockUrgencies")}</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-1 border-b">
                          <span>{t("landingMockInvoices")}</span>
                          <span className="font-bold text-brand">12</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span>{t("landingMockLatePayments")}</span>
                          <span className="font-bold text-rose-600">5</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>{t("landingMockBankReconciliation")}</span>
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
              {t("landingPillarsTitle")}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t("landingPillarsSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <Zap size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">{t("landingPillarAutomation")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("landingPillarAutomationDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">{t("landingPillarPrecision")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("landingPillarPrecisionDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <TrendingUp size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">{t("landingPillarPredictions")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("landingPillarPredictionsDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F7FAF7] p-5 shadow-sm hover:border-lime transition-all">
              <div className="rounded-xl bg-lime p-2.5 text-brand shadow-glow-sm">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="font-bold text-brand">{t("landingPillarTime")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("landingPillarTimeDesc")}
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
                <Bot size={16} /> {t("landingMaiaseEyebrow")}
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-brand tracking-tight">
                {t("landingMaiaseTitle")}
              </h2>
              <p className="mt-4 text-base text-gray-600 leading-relaxed">
                {t("landingMaiaseDescription")}
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">{t("landingMaiaseOcrTitle")}</strong>
                    <p className="text-xs text-gray-500">{t("landingMaiaseOcrDesc")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">{t("landingMaiaseClassificationTitle")}</strong>
                    <p className="text-xs text-gray-500">{t("landingMaiaseClassificationDesc")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-brand">{t("landingMaiaseAnomalyTitle")}</strong>
                    <p className="text-xs text-gray-500">{t("landingMaiaseAnomalyDesc")}</p>
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
                    <h3 className="text-xl font-extrabold text-brand">{t("landingMaiaseName")}</h3>
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      {t("landingMaiaseOnline")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-xl bg-lime-light/60 p-3.5 text-xs text-brand">
                    <span className="font-bold">{t("landingMaiaseChatLabel")}</span> {t("landingMaiaseChatSample")}
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600 flex items-center justify-between">
                    <span>{t("landingMaiaseAvgAnalysis")}</span>
                    <strong className="text-brand font-bold">{t("landingMaiaseAvgAnalysisValue")}</strong>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3.5 text-xs text-gray-600 flex items-center justify-between">
                    <span>{t("landingMaiaseCurrencies")}</span>
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
              {t("landingDemoEyebrow")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold mt-3">
              {t("landingDemoTitle")}
            </h2>
            <p className="text-sm text-white/70 mt-2">
              {t("landingDemoDescription")}
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
                  <h3 className="text-lg font-bold text-white">{t("landingDemoAccountantTitle")}</h3>
                  <p className="text-xs text-lime">{t("landingDemoAccountantTagline")}</p>
                </div>
              </div>
              <p className="text-xs text-white/70 mb-6">
                {t("landingDemoAccountantDesc")}
              </p>
              <Button
                variant="primary"
                className="w-full font-bold"
                disabled={loggingIn !== null}
                onClick={() => quickLogin("accountant")}
              >
                {loggingIn === "accountant" ? `${t("login")}...` : t("landingDemoAccountantCta")}
              </Button>
            </div>

            {/* Demo Client */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 hover:border-lime transition-all backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-2xl bg-white/10 p-3 text-lime border border-white/10">
                  <ScanLine size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{t("landingDemoClientTitle")}</h3>
                  <p className="text-xs text-lime">{t("landingDemoClientTagline")}</p>
                </div>
              </div>
              <p className="text-xs text-white/70 mb-6">
                {t("landingDemoClientDesc")}
              </p>
              <Button
                variant="outline"
                className="w-full text-white border-white/20 bg-white/10 hover:bg-white/20 font-bold"
                disabled={loggingIn !== null}
                onClick={() => quickLogin("client")}
              >
                {loggingIn === "client" ? `${t("login")}...` : t("landingDemoClientCta")}
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
              {t("landingFeaturesTitle")}
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              {t("landingFeaturesSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <ScanLine size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureScannerTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureScannerDesc")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <FileSpreadsheet size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureJournalsTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureJournalsDesc")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureReportsTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureReportsDesc")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <Globe size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureBilingualTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureBilingualDesc")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <MessageSquare size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureMessagesTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureMessagesDesc")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-[#F7FAF7] p-6 hover:shadow-card transition-all">
              <div className="h-12 w-12 rounded-xl bg-lime p-3 text-brand shadow-glow-sm mb-4">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand">{t("landingFeatureSecurityTitle")}</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {t("landingFeatureSecurityDesc")}
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
              <Link href="/login" className="hover:text-lime">{t("login")}</Link>
              <Link href="/register" className="hover:text-lime">{t("footerSignup")}</Link>
              <a href="#features" className="hover:text-lime">{t("navFeatures")}</a>
            </div>

            <div className="text-xs text-white/50">
              © {new Date().getFullYear()} Comptia DZ. {t("footerRights")}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

