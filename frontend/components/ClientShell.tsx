"use client";

import { FileText, Home, Landmark, Menu, MessageSquare, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";
import { BackButton } from "./BackButton";
import { BrandLogo } from "./BrandLogo";
import { LanguageToggle } from "./LanguageToggle";

const NAV = [
  { href: "/client/dashboard", icon: Home, labelKey: "dashboard" as const },
  { href: "/client/releves-bancaires", icon: Landmark, labelKey: "releveBancaire" as const },
  { href: "/client/factures", icon: FileText, labelKey: "landingInvoices" as const },
  { href: "/client/messages", icon: MessageSquare, labelKey: "messages" as const },
  { href: "/client/settings", icon: Settings, labelKey: "settings" as const },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);
  const heading = user?.username ? `Bonjour, ${user.username}` : t("dashboard");

  return (
    <div className="studio-ui flex min-h-screen bg-[#f5f7f5] antialiased selection:bg-[#eaf2ee] selection:text-[#173c32]">
      {navOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-[rgba(20,31,27,0.35)] backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[244px] max-w-[85vw] -translate-x-full flex-col border-r border-[#e5e9e6] bg-[#fbfcfb] px-[18px] py-[18px] shadow-[20px_0_50px_rgba(20,42,35,0.13)] transition-transform duration-300 lg:sticky lg:top-0 lg:z-30 lg:w-[152px] lg:translate-x-0 lg:px-3 lg:pb-2.5 lg:pt-5 lg:shadow-none",
          navOpen && "translate-x-0"
        )}
      >
        <div className="mb-6 flex items-center justify-between px-1 lg:justify-center lg:px-0">
          <Link href="/client/dashboard" title="Comptia" className="flex min-w-0 flex-1 items-center lg:justify-center" onClick={() => setNavOpen(false)}>
            <BrandLogo />
          </Link>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#74807b] hover:bg-[#f2f5f3] lg:hidden"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ href, icon: Icon, labelKey }) => {
            const active = pathname === href || (href !== "/client/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                title={t(labelKey)}
                className={cn(
                  "relative flex min-h-[49px] flex-col items-center justify-center gap-1 rounded-[11px] px-1 py-1 text-center text-[#74807b] transition-colors hover:bg-[#f2f5f3] hover:text-[#35433e] lg:min-h-0 lg:max-h-[66px] lg:flex-1",
                  "max-lg:min-h-12 max-lg:flex-none max-lg:flex-row max-lg:justify-start max-lg:gap-3 max-lg:px-3 max-lg:text-left",
                  active && "bg-[#eaf2ee] text-[#214f40]"
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className={cn("text-[9px] font-medium leading-tight tracking-tight max-lg:text-[11px]", active && "font-semibold")}>
                  {t(labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 flex justify-center border-t border-[#e5e9e6] pt-3 max-lg:justify-start max-lg:px-1">
          <LanguageToggle compact className="text-[#214f40]" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between bg-[#f5f7f5]/90 px-5 backdrop-blur-md lg:h-[94px] lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e9e6] bg-white text-[#214f40] lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={18} />
            </button>
            <BackButton />
            <h1 className="truncate text-lg font-semibold tracking-tight text-[#17221f]">{heading}</h1>
          </div>
          <Link
            href="/client/settings"
            title={t("settings")}
            aria-label={t("settings")}
            className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[#254b40] text-[12px] font-bold text-[#f7faf8]"
          >
            {user?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photo} alt={user.username} className="h-full w-full object-cover" />
            ) : (
              user?.username?.slice(0, 2).toUpperCase()
            )}
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 pb-12 pt-2 lg:px-8 lg:pb-14">{children}</main>
      </div>
    </div>
  );
}
