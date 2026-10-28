"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      const reduce = mediaQuery.matches;
      setPrefersReducedMotion(reduce);
      const video = heroRef.current;
      if (!video) return;
      if (reduce) video.pause();
      else void video.play();
    };
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

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#171c1a] selection:bg-[#d7ef6a] selection:text-[#173c32]">
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50",
          prefersReducedMotion ? "" : "transition-colors duration-300",
          scrolled ? "border-b border-[#e4dfd4] bg-[#f4f1ea]" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tracking-tight">Comptia</span>
            <span className="rounded-md bg-[#d7ef6a] px-1.5 py-0.5 text-[10px] font-bold text-[#173c32]">DZ</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a href="#produit" className="opacity-80 hover:opacity-100">
              {t("navFeatures")}
            </a>
            <a href="#espaces" className="opacity-80 hover:opacity-100">
              {t("navDemo")}
            </a>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <LanguageToggle plain className="text-current" />
            {user ? (
              <button
                type="button"
                onClick={() =>
                  router.push(user.role === "accountant" ? "/accountant/entreprises" : "/client/dashboard")
                }
                className="font-medium opacity-90 hover:opacity-100"
              >
                {t("navSpace")}
              </button>
            ) : (
              <Link href="/login" className="font-medium opacity-90 hover:opacity-100">
                {t("login")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1100px] px-5 pb-8 pt-28 text-center sm:px-8 sm:pt-32">
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.25rem]">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-5 max-w-sm text-base leading-relaxed text-[#5e6a65] sm:text-lg">{t("heroSubtitle")}</p>
        <a
          href="#produit"
          className="mt-8 inline-flex h-11 items-center rounded-full bg-[#1f3d35] px-5 text-sm font-semibold text-white hover:bg-[#173c32]"
        >
          {t("heroCta")}
        </a>
        <div className="mt-14 overflow-hidden rounded-[28px] border border-[#e7e2d8] bg-white shadow-[0_30px_80px_-28px_rgba(23,28,26,0.35)] [mask-image:linear-gradient(to_bottom,black_68%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_68%,transparent)]">
          <video
            ref={heroRef}
            autoPlay={!prefersReducedMotion}
            loop
            muted
            playsInline
            src="/maiase-hero.mov"
            className="block h-auto w-full"
          />
        </div>
      </section>

      <section id="produit" className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 sm:py-32">
        <p className="text-sm text-[#5e6a65]">{t("landingWhatKicker")}</p>
        <div className="mt-3 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <h2 className="text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">{t("landingWhatTitle")}</h2>
          <p className="max-w-xs text-sm leading-relaxed text-[#5e6a65]">{t("landingAlso")}</p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <article className="relative min-h-[460px] overflow-hidden rounded-[28px] bg-[#d7ef6a] p-6 text-[#173c32]">
            <div className="relative z-10">
              <h3 className="text-3xl font-semibold tracking-tight">{t("landingInvoices")}</h3>
              <p className="mt-2 max-w-[16rem] text-sm leading-relaxed">{t("landingInvoicesText")}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/maiase.png"
              alt=""
              className="pointer-events-none absolute left-1/2 top-[-14%] h-[168%] w-auto max-w-none -translate-x-1/2"
            />
          </article>

          <article className="flex min-h-[460px] flex-col justify-between rounded-[28px] bg-[#1f3d35] p-6 text-white">
            <div>
              <h3 className="text-3xl font-semibold tracking-tight">{t("landingStatements")}</h3>
              <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-white/75">{t("landingStatementsText")}</p>
            </div>
            <p className="text-5xl font-semibold leading-none tracking-[-0.04em] text-[#d7ef6a]">
              PDF
              <br />
              JPG
              <br />
              PNG
            </p>
          </article>

          <article className="flex min-h-[460px] flex-col justify-between rounded-[28px] bg-white p-6">
            <div>
              <h3 className="text-3xl font-semibold tracking-tight">{t("landingReports")}</h3>
              <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-[#5e6a65]">{t("landingReportsText")}</p>
            </div>
            <ul className="space-y-2 text-lg font-medium tracking-tight text-[#1f3d35]">
              <li>{t("balance")}</li>
              <li>{t("bilan")}</li>
              <li>{t("compteResultat")}</li>
              <li>{t("grandLivre")}</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="espaces" className="border-t border-[#e4dfd4] bg-[#f4f1ea]">
        <div className="mx-auto grid max-w-[1180px] gap-4 px-5 py-24 sm:px-8 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">{t("landingSpacesTitle")}</h2>
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
      </section>

      <footer className="border-t border-[#e4dfd4]">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-4 px-5 py-8 text-sm text-[#5e6a65] sm:flex-row sm:items-center sm:px-8">
          <p>Comptia DZ · {new Date().getFullYear()}</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-[#171c1a]">
              {t("login")}
            </Link>
            <Link href="/register" className="hover:text-[#171c1a]">
              {t("footerSignup")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
