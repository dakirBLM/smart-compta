"use client";

import { Bell, Menu, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
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

  return (
    <div className="flex min-h-screen bg-[#F7FAF7] font-sans antialiased text-brand selection:bg-lime selection:text-brand">
      {/* Mobile backdrop */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-brand/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      <Sidebar
        entrepriseId={entrepriseId}
        entrepriseName={entrepriseName}
        annee={annee}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-gray-200/70 bg-white/90 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            {/* Hamburger — opens the nav on mobile */}
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-xl p-2 text-brand hover:bg-gray-100 lg:hidden transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu size={22} />
            </button>
            <BackButton />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-brand sm:text-2xl flex items-center gap-2">
                {title || (user?.username ? `Bonjour, ${user.username} ! 👋` : "Tableau de bord")}
              </h1>
              {subtitle ? (
                <p className="text-xs text-gray-500 hidden sm:block">{subtitle}</p>
              ) : (
                <p className="text-xs text-gray-500 hidden sm:block">
                  Voici un aperçu intelligent de votre activité.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Search bar matching future_look.png */}
            <div className="relative hidden md:block w-72 lg:w-80">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Rechercher (factures, clients...)"
                className="h-10 w-full rounded-full border border-gray-200/90 bg-gray-50/80 pl-9 pr-4 text-xs font-medium text-brand outline-none transition-all focus:border-brand focus:bg-white focus:ring-2 focus:ring-lime/40"
              />
            </div>

            {/* Notification Bell */}
            <button
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200/80 bg-white text-brand hover:bg-gray-50 transition-all hover:border-gray-300"
              title="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime ring-2 ring-white" />
            </button>

            {/* User Avatar */}
            <Link
              href="/accountant/profile"
              className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-lime/60 transition-all"
            >
              {user?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo}
                  alt={user.username}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-lime/40"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-bold text-lime ring-2 ring-lime/40">
                  {user?.username?.slice(0, 2).toUpperCase() || "HD"}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

