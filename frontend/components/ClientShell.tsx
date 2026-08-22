"use client";

import { Camera, FileText, Home, LogOut, Menu, MessageSquare, Settings, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BackButton } from "./BackButton";
import { LanguageToggle } from "./LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/client/dashboard", icon: Home, label: "Accueil" },
  { href: "/client/scanner", icon: Camera, label: "Scanner" },
  { href: "/client/factures", icon: FileText, label: "Factures" },
  { href: "/client/messages", icon: MessageSquare, label: "Messages" },
  { href: "/client/settings", icon: Settings, label: "Profil" },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#F4F7F4] font-sans antialiased text-brand selection:bg-lime selection:text-brand">
      {/* Mobile backdrop */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-brand/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Desktop & Tablet Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-20 flex-col items-center gap-3 bg-brand py-6 shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:translate-x-0 border-r border-white/5",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Logo Mini */}
        <Link href="/client/dashboard" className="mb-4 flex flex-col items-center">
          <span className="text-lg font-black text-white">C<span className="text-lime">.</span></span>
          <span className="rounded bg-lime px-1 py-0.2 text-[9px] font-black text-brand">DZ</span>
        </Link>

        {/* Close button (mobile only) */}
        <button
          onClick={() => setNavOpen(false)}
          className="rounded-xl p-2 text-white hover:bg-white/10 lg:hidden mb-2"
          aria-label="Fermer le menu"
        >
          <X size={20} />
        </button>

        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/client/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setNavOpen(false)}
              title={label}
              className={cn(
                "group relative flex flex-col items-center justify-center rounded-2xl p-3 transition-all duration-200",
                active
                  ? "bg-lime text-brand font-bold shadow-glow-sm shadow-lime/25"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={22} />
              <span className="text-[10px] font-semibold mt-1">{label}</span>
            </Link>
          );
        })}

        {/* Language switcher */}
        <LanguageToggle className="mt-auto text-white" compact />

        {/* Logout */}
        <button
          onClick={logout}
          title="Déconnexion"
          className="rounded-2xl p-3 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition-colors"
        >
          <LogOut size={22} />
        </button>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between bg-white/90 px-4 py-3 sm:px-8 border-b border-gray-200/70 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-xl p-2 text-brand hover:bg-gray-100 lg:hidden transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu size={22} />
            </button>
            <BackButton />
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-brand sm:text-xl">
                Comptia <span className="rounded bg-lime px-1.5 py-0.5 text-xs text-brand">DZ</span>
              </span>
              <span className="text-xs text-gray-400 hidden sm:inline">· Espace Client</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Maiase Assistant chip */}
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-lime-light/60 border border-lime/30 px-3 py-1 text-xs font-semibold text-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/maiase.png" alt="Maiase" className="h-6 w-6 rounded-full object-contain" />
              <span>Maiase IA active</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand hidden sm:inline">
                {user?.username}
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-lime ring-2 ring-lime/40">
                {user?.username?.slice(0, 2).toUpperCase() || <User size={16} />}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

