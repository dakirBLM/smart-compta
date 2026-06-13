"use client";

import { Bell, Settings } from "lucide-react";
import { LanguageToggle } from "./LanguageToggle";
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
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        entrepriseId={entrepriseId}
        entrepriseName={entrepriseName}
        annee={annee}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <h1 className="text-xl font-bold text-brand">{title}</h1>
          <div className="flex items-center gap-3">
            <LanguageToggle className="text-brand" />
            <button className="rounded-full p-2 text-brand hover:bg-brand/10">
              <Bell size={20} />
            </button>
            <button className="rounded-full p-2 text-brand hover:bg-brand/10">
              <Settings size={20} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
