"use client";

import { Bell, Menu } from "lucide-react";
import { useState } from "react";
import { Sidebar } from "./Sidebar";

export function AppShell({
  children,
  title,
  entrepriseId,
  entrepriseName,
  annee,
}: {
  children: React.ReactNode;
  title?: string;
  entrepriseId?: number;
  entrepriseName?: string;
  annee?: number;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <Sidebar
        entrepriseId={entrepriseId}
        entrepriseName={entrepriseName}
        annee={annee}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Hamburger — opens the nav on mobile */}
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-lg p-2 text-brand hover:bg-gray-100 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-lg font-bold text-brand sm:text-xl">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-full p-2 text-brand hover:bg-gray-100">
              <Bell size={20} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
