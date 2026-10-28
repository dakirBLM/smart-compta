"use client";

import { Bell, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { BackButton } from "./BackButton";
import { Sidebar } from "./Sidebar";

export function AppShell({
  children,
  title,
  subtitle,
  entrepriseId,
  entrepriseName,
  annee,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  entrepriseId?: number;
  entrepriseName?: string;
  annee?: number;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useI18n();
  const settingsHref = entrepriseId
    ? `/accountant/profile?entreprise=${entrepriseId}${annee ? `&annee=${annee}` : ""}`
    : "/accountant/profile";
  const heading =
    title === undefined
      ? user?.username
        ? `Bonjour, ${user.username}`
        : "Tableau de bord"
      : title;

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

      <Sidebar
        entrepriseId={entrepriseId}
        entrepriseName={entrepriseName}
        annee={annee}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between bg-[#f5f7f5]/90 px-5 backdrop-blur-md lg:h-[94px] lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e9e6] bg-white text-[#214f40] lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={18} />
            </button>
            <BackButton />
            {heading ? (
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-[#17221f]">
                  {heading}
                </h1>
                {subtitle ? (
                  <p className="hidden truncate text-[11px] text-[#69736f] sm:block">{subtitle}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e5e9e6] bg-white text-[#214f40]"
              title="Notifications"
            >
              <Bell size={16} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full border border-white bg-[#c78455]" />
            </button>
            <Link
              href={settingsHref}
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
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 pb-12 pt-2 lg:px-8 lg:pb-14">
          {children}
        </main>
      </div>
    </div>
  );
}
