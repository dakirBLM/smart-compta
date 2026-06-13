"use client";

import { Home, FileText, Settings, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageToggle } from "./LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/client/dashboard", icon: Home },
  { href: "/client/factures", icon: FileText },
  { href: "/client/settings", icon: Settings },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-clientbg">
      <aside className="flex w-16 flex-col items-center gap-4 bg-white py-6 shadow-sm">
        {NAV.map(({ href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
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
        <button
          onClick={logout}
          className="mt-auto rounded-xl p-3 text-danger hover:bg-red-50"
        >
          <LogOut size={22} />
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between bg-clientbg px-6 py-4">
          <LanguageToggle className="text-brand" />
          <div className="flex items-center gap-2 font-semibold text-brand">
            {user?.username?.toUpperCase()}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
              <User size={18} />
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 pb-8">{children}</main>
      </div>
    </div>
  );
}
