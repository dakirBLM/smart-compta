"use client";

import { FileText, Home, LogOut, Menu, MessageSquare, Settings, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BackButton } from "./BackButton";
import { LanguageToggle } from "./LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/client/dashboard", icon: Home },
  { href: "/client/factures", icon: FileText },
  { href: "/client/messages", icon: MessageSquare },
  { href: "/client/settings", icon: Settings },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-clientbg">
      {/* Mobile backdrop */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center gap-4 bg-white py-6 shadow-sm transition-transform duration-200 lg:static lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button (mobile only) */}
        <button
          onClick={() => setNavOpen(false)}
          className="rounded-xl p-2 text-brand hover:bg-brand/10 lg:hidden"
          aria-label="Fermer le menu"
        >
          <X size={20} />
        </button>

        {NAV.map(({ href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setNavOpen(false)}
            className={cn(
              "rounded-xl p-3 transition-colors",
              pathname.startsWith(href)
                ? "bg-brand text-white"
                : "text-brand hover:bg-brand/10"
            )}
          >
            <Icon size={22} />
          </Link>
        ))}
        {/* Language switcher — lives only in the left navigation */}
        <LanguageToggle className="mt-auto text-brand" compact />
        <button
          onClick={logout}
          className="rounded-xl p-3 text-danger hover:bg-red-50"
        >
          <LogOut size={22} />
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between bg-clientbg px-4 py-4 sm:px-6">
          {/* Hamburger — opens the nav on mobile */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-lg p-2 text-brand hover:bg-black/5 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={22} />
            </button>
            <BackButton />
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 font-semibold text-brand">
            {user?.username?.toUpperCase()}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
              <User size={18} />
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 pb-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
