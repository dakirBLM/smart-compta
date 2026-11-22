"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Landmark,
  LayoutDashboard,
  LineChart,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: TranslationKey }[] = [
  { href: "#accueil", label: "navHome" },
  { href: "#fonctionnalites", label: "navProduct" },
  { href: "#avantages", label: "navAdvantages" },
  { href: "#tarifs", label: "navPricing" },
  { href: "#apropos", label: "navAbout" },
  { href: "#faq", label: "navFaq" },
];

const RAIL: { icon: LucideIcon; label: TranslationKey }[] = [
  { icon: LayoutDashboard, label: "railDashboard" },
  { icon: FileText, label: "railInvoices" },
  { icon: Landmark, label: "railBank" },
  { icon: Wallet, label: "railCash" },
  { icon: LineChart, label: "railReports" },
  { icon: Settings, label: "railSettings" },
  { icon: Search, label: "railSearch" },
  { icon: ScanLine, label: "featOcr" },
  { icon: Sparkles, label: "railAi" },
  { icon: ShieldCheck, label: "featCompliance" },
];

const FEATURES: { title: TranslationKey; text: TranslationKey; tone: "lime" | "dark" | "paper" }[] = [
  { title: "featOcr", text: "featOcrText", tone: "lime" },
  { title: "featAuto", text: "featAutoText", tone: "dark" },
  { title: "featBank", text: "featBankText", tone: "paper" },
  { title: "featStatements", text: "featStatementsText", tone: "dark" },
  { title: "featCompliance", text: "featComplianceText", tone: "lime" },
];

const DASH_ROWS: { item: TranslationKey; data: TranslationKey }[] = [
  { item: "dashRevenue", data: "dashReal" },
  { item: "dashCash", data: "dashReal" },
  { item: "dashNet", data: "dashNetData" },
];

const FAQ: { q: TranslationKey; a: TranslationKey }[] = [
  { q: "faq1q", a: "faq1a" },
  { q: "faq2q", a: "faq2a" },
  { q: "faq3q", a: "faq3a" },
  { q: "faq4q", a: "faq4a" },
];

// The product demos are small self-contained HTML animations (public/landing),
// designed on a fixed 1440x900 stage and scaled down to the card's width.
const DEMO_WIDTH = 1440;
const DEMO_HEIGHT = 900;

function ProductDemo({
  src,
  still,
  label,
  reduce,
}: {
  src: string;
  /** Second of the animation shown as a still frame when motion is reduced. */
  still: number;
  label: string;
  reduce: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / DEMO_WIDTH)
    );
    resizeObserver.observe(el);

    // The animation only runs (and restarts from the beginning) while it is on
    // screen; off screen the iframe is removed so it costs nothing.
    const intersectionObserver = reduce
      ? null
      : new IntersectionObserver(
          ([entry]) => setPlaying(entry.isIntersecting && entry.intersectionRatio >= 0.4),
          { threshold: 0.4 }
        );
    intersectionObserver?.observe(el);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
    };
  }, [reduce]);

  const separator = src.includes("?") ? "&" : "?";
  const frameSrc = reduce ? `${src}${separator}seek=${still}` : src;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-[28px] border border-[#e7e2d8] bg-white shadow-[0_30px_80px_-28px_rgba(23,28,26,0.35)] [mask-image:linear-gradient(to_bottom,black_86%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_86%,transparent)]">
      <div
        ref={box}
        role="img"
        aria-label={label}
        className="relative w-full overflow-hidden bg-[#f5f7f5]"
        style={{ aspectRatio: `${DEMO_WIDTH} / ${DEMO_HEIGHT}` }}
      >
        {scale > 0 && (reduce || playing) && (
          <iframe
            src={frameSrc}
            title={label}
            tabIndex={-1}
            aria-hidden="true"
            sandbox="allow-scripts"
            className="pointer-events-none absolute left-0 top-0 border-0"
            style={{
              width: DEMO_WIDTH,
              height: DEMO_HEIGHT,
              transformOrigin: "0 0",
              transform: `scale(${scale})`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function enter() {
    if (user) {
      router.push(user.role === "accountant" ? "/accountant/entreprises" : "/client/dashboard");
      return;
    }
    router.push("/login");
  }

  function start() {
    if (user) {
      enter();
      return;
    }
    router.push("/register");
  }

  const rail = prefersReducedMotion ? RAIL : [...RAIL, ...RAIL];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f1ea] text-[#171c1a] selection:bg-[#d7ef6a] selection:text-[#173c32]">
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50",
          prefersReducedMotion ? "" : "transition-colors duration-300",
          scrolled ? "border-b border-[#e4dfd4] bg-[#f4f1ea]" : "bg-[#f4f1ea]/90 backdrop-blur-sm"
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="#accueil" className="flex shrink-0 items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tracking-tight">Comptia</span>
            <span className="rounded-md bg-[#d7ef6a] px-1.5 py-0.5 text-[10px] font-bold text-[#173c32]">DZ</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="whitespace-nowrap opacity-80 hover:opacity-100">
                {t(item.label)}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3 text-sm sm:gap-4">
            <LanguageToggle plain compact className="text-current sm:hidden" />
            <LanguageToggle plain className="hidden text-current sm:inline-flex" />
            {user ? (
              <button type="button" onClick={enter} className="font-medium opacity-90 hover:opacity-100">
                {t("navSpace")}
              </button>
            ) : (
              <>
                <Link href="/login" className="font-medium opacity-90 hover:opacity-100">
                  {t("signIn")}
                </Link>
                <button
                  type="button"
                  onClick={start}
                  className="hidden h-9 items-center rounded-full bg-[#1f3d35] px-3.5 text-sm font-semibold text-white hover:bg-[#173c32] sm:inline-flex"
                >
                  {t("navCreateAccount")}
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="flex w-full max-w-full gap-5 overflow-x-auto px-5 pb-3 text-sm lg:hidden">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="shrink-0 whitespace-nowrap opacity-80">
              {t(item.label)}
            </a>
          ))}
        </nav>
      </header>

      <section id="accueil" className="mx-auto max-w-[1100px] scroll-mt-28 px-5 pb-6 pt-36 text-center sm:px-8 sm:pt-40">
        <p className="text-sm font-medium text-[#1f3d35]">Comptia DZ</p>
        <h1 className="mx-auto mt-3 max-w-4xl text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl sm:leading-[0.98] lg:text-[4.25rem]">
          {t("heroTitle")}.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#5e6a65] sm:text-lg">{t("heroLead")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={start}
            className="inline-flex h-11 items-center rounded-full bg-[#1f3d35] px-5 text-sm font-semibold text-white hover:bg-[#173c32]"
          >
            {t("heroStart")}
          </button>
          <a
            href="#demo"
            className="inline-flex h-11 items-center rounded-full border border-[#d9d3c6] bg-white px-5 text-sm font-semibold text-[#1f3d35] hover:bg-[#f7f4ee]"
          >
            {t("heroDemo")}
          </a>
        </div>
        <p className="mt-6 text-sm text-[#5e6a65]">{t("heroMadeIn")}</p>
      </section>

      <div
        dir="ltr"
        className={cn(
          "border-y border-[#e4dfd4] py-4",
          prefersReducedMotion ? "overflow-x-auto" : "overflow-hidden"
        )}
      >
        <div className={cn("flex w-max", prefersReducedMotion ? "" : "landing-marquee-track")}>
          {rail.map((item, index) => {
            const Icon = item.icon;
            return (
              <span
                key={`${item.label}-${index}`}
                className="mx-2 inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e4dfd4] bg-white px-4 py-2 text-sm font-medium text-[#1f3d35]"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t(item.label)}
              </span>
            );
          })}
        </div>
      </div>

      <section id="demo" className="scroll-mt-28">
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("dashTitle")}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#5e6a65] sm:text-base">{t("dashNote")}</p>
          <div className="mt-6 overflow-hidden rounded-[24px] border border-[#e4dfd4] bg-white">
            <div className="grid grid-cols-2 bg-[#1f3d35] px-4 py-3 text-xs font-semibold text-white sm:text-sm">
              <span className="min-w-0">{t("dashColItem")}</span>
              <span className="min-w-0">{t("dashColData")}</span>
            </div>
            {DASH_ROWS.map((row) => (
              <div key={row.item} className="grid grid-cols-2 border-t border-[#efeae0] px-4 py-3 text-sm">
                <span className="min-w-0 font-medium">{t(row.item)}</span>
                <span className="min-w-0 text-[#5e6a65]">{t(row.data)}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[#5e6a65]">
            <span className="font-medium text-[#171c1a]">{t("dashVisible")}. </span>
            {t("dashVisibleItems")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#5e6a65]">{t("dashSplit")}</p>
          <div className="mt-10">
            <ProductDemo
              src="/landing/demo-dashboard.html?loop"
              still={5.8}
              label={t("dashTitle")}
              reduce={prefersReducedMotion}
            />
          </div>
        </div>
      </section>

      <section id="fonctionnalites" className="scroll-mt-28 border-t border-[#e4dfd4]">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("featTitle")}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className={cn(
                  "rounded-[28px] p-6",
                  index < 3 ? "md:col-span-2" : "md:col-span-3",
                  feature.tone === "lime" && "bg-[#d7ef6a] text-[#173c32]",
                  feature.tone === "dark" && "bg-[#1f3d35] text-white",
                  feature.tone === "paper" && "bg-white text-[#171c1a]"
                )}
              >
                <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(feature.title)}</h3>
                <p
                  className={cn(
                    "mt-3 max-w-sm text-sm leading-relaxed",
                    feature.tone === "dark" ? "text-white/75" : "text-[#31584c]"
                  )}
                >
                  {t(feature.text)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e4dfd4]">
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("aiTitle")}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#5e6a65] sm:text-base">{t("aiText")}</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {(["aiTime", "aiErrors", "aiDecision"] as const).map((key) => (
              <li key={key} className="rounded-full bg-[#1f3d35] px-4 py-2 text-sm font-medium text-[#d7ef6a]">
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <ProductDemo
              src="/landing/demo-bank.html"
              still={15}
              label={t("aiTitle")}
              reduce={prefersReducedMotion}
            />
          </div>
        </div>
      </section>

      <section id="avantages" className="scroll-mt-28 border-t border-[#e4dfd4]">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("whyTitle")}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {(
              [
                ["whySupport", "whySupportText"],
                ["whySecure", "whySecureText"],
                ["whyScale", "whyScaleText"],
              ] as const
            ).map(([title, text]) => (
              <article key={title} className="rounded-[28px] bg-white p-6">
                <h3 className="text-2xl font-semibold tracking-tight">{t(title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#5e6a65]">{t(text)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e4dfd4]">
        <div className="mx-auto grid max-w-[1180px] gap-4 px-5 py-20 sm:px-8 md:grid-cols-2 lg:py-28">
          <article id="tarifs" className="scroll-mt-28 rounded-[28px] bg-[#d7ef6a] p-7 text-[#173c32]">
            <h2 className="text-3xl font-semibold tracking-tight">{t("pricingTitle")}</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed">{t("pricingText")}</p>
            <button
              type="button"
              onClick={start}
              className="mt-6 inline-flex h-11 items-center rounded-full bg-[#1f3d35] px-5 text-sm font-semibold text-white hover:bg-[#173c32]"
            >
              {t("heroStart")}
            </button>
          </article>
          <article id="apropos" className="scroll-mt-28 rounded-[28px] bg-[#1f3d35] p-7 text-white">
            <h2 className="text-3xl font-semibold tracking-tight">{t("aboutTitle")}</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">{t("aboutText")}</p>
          </article>
        </div>
      </section>

      <section id="faq" className="scroll-mt-28 border-t border-[#e4dfd4]">
        <div className="mx-auto max-w-[800px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("faqTitle")}</h2>
          <div className="mt-8 divide-y divide-[#e4dfd4] overflow-hidden rounded-[28px] border border-[#e4dfd4] bg-white">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-4">
                <summary className="cursor-pointer list-none text-base font-semibold tracking-tight marker:content-none">
                  {t(item.q)}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-[#5e6a65]">{t(item.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e4dfd4] bg-[#f4f1ea]">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t("ctaTitle")}</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#5e6a65]">{t("ctaText")}</p>
          <button
            type="button"
            onClick={start}
            className="mt-8 inline-flex h-12 items-center rounded-2xl bg-[#1f3d35] px-6 text-sm font-semibold text-white hover:bg-[#173c32]"
          >
            {t("ctaButton")} →
          </button>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <h3 className="text-3xl font-semibold tracking-[-0.04em]">{t("landingSpacesTitle")}</h3>
            </div>
            <article className="flex min-h-[280px] flex-col justify-between rounded-[28px] bg-[#1f3d35] p-7 text-white">
              <div>
                <h3 className="text-3xl font-semibold tracking-tight">{t("landingAccountant")}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">{t("landingSpaceAccountant")}</p>
              </div>
              <button
                type="button"
                onClick={enter}
                className="mt-8 h-12 w-fit rounded-2xl bg-white px-6 text-sm font-semibold text-[#17221f] hover:bg-[#f4f1ea]"
              >
                {t("landingOpen")}
              </button>
            </article>
            <article className="flex min-h-[280px] flex-col justify-between rounded-[28px] bg-white p-7">
              <div>
                <h3 className="text-3xl font-semibold tracking-tight">{t("landingClient")}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#5e6a65]">{t("landingSpaceClient")}</p>
              </div>
              <button
                type="button"
                onClick={enter}
                className="mt-8 h-12 w-fit rounded-2xl bg-[#1f3d35] px-6 text-sm font-semibold text-white hover:bg-[#173c32]"
              >
                {t("landingOpen")}
              </button>
            </article>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e4dfd4]">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-4 px-5 py-8 text-sm text-[#5e6a65] sm:flex-row sm:items-center sm:px-8">
          <p>Comptia DZ · {new Date().getFullYear()}</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-[#171c1a]">
              {t("signIn")}
            </Link>
            <Link href="/register" className="hover:text-[#171c1a]">
              {t("navCreateAccount")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
