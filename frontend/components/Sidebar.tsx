"use client";

import {
  BarChart3,
  Book,
  Building2,
  ChevronDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Scale,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const JOURNAL_TYPES: { key: string; label: string }[] = [
  { key: "achat", label: "Achat" },
  { key: "vente", label: "Vente" },
  { key: "banque", label: "Banque" },
  { key: "caisse", label: "Caisse" },
  { key: "od", label: "OD" },
];

function Item({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[16px] transition-colors",
        active ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({
  entrepriseId,
  entrepriseName,
  annee,
}: {
  entrepriseId?: number;
  entrepriseName?: string;
  annee?: number;
}) {
  const { t } = useI18n();
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const [journalOpen, setJournalOpen] = useState(pathname.includes("/journaux"));

  const base = entrepriseId
    ? `/accountant/entreprises/${entrepriseId}`
    : "/accountant";
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <aside className="flex h-screen w-64 flex-col bg-brand p-4 text-white">
      <div className="mb-6 px-2">
        <div className="text-lg font-bold">{t("appName")}</div>
        {entrepriseName && (
          <div className="mt-1 rounded-lg bg-white/10 px-3 py-2 text-sm">
            <div className="font-semibold">{entrepriseName}</div>
            {annee && <div className="text-white/70">Exercice {annee}</div>}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {!entrepriseId ? (
          <>
            <Item
              href="/accountant/dashboard"
              icon={<LayoutDashboard size={20} />}
              label={t("dashboard")}
              active={is("/accountant/dashboard")}
            />
            <Item
              href="/accountant/entreprises"
              icon={<Building2 size={20} />}
              label={t("entreprises")}
              active={is("/accountant/entreprises")}
            />
          </>
        ) : (
          <>
            {/* Journaux dropdown */}
            <button
              onClick={() => setJournalOpen((o) => !o)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[16px] text-white/80 hover:bg-white/10",
                pathname.includes("/journaux") && "bg-white/15 font-semibold text-white"
              )}
            >
              <span className="flex items-center gap-3">
                <Book size={20} />
                {t("journaux")}
              </span>
              <ChevronDown
                size={16}
                className={cn("transition-transform", journalOpen && "rotate-180")}
              />
            </button>
            {journalOpen && (
              <div className="ml-4 space-y-1 border-l border-white/20 pl-2">
                {JOURNAL_TYPES.map((j) => (
                  <Link
                    key={j.key}
                    href={`${base}/journaux/${j.key}`}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10",
                      pathname.endsWith(`/journaux/${j.key}`) &&
                        "bg-white/15 font-semibold text-white"
                    )}
                  >
                    {j.label}
                  </Link>
                ))}
              </div>
            )}

            <Item
              href={`${base}/compte-resultat`}
              icon={<FileText size={20} />}
              label={t("compteResultat")}
              active={is(`${base}/compte-resultat`)}
            />
            <Item
              href={`${base}/balance`}
              icon={<Scale size={20} />}
              label={t("balance")}
              active={is(`${base}/balance`)}
            />
            <Item
              href={`${base}/grand-livre`}
              icon={<Book size={20} />}
              label={t("grandLivre")}
              active={is(`${base}/grand-livre`)}
            />
            <Item
              href={`${base}/dashboard`}
              icon={<BarChart3 size={20} />}
              label={t("dashboard")}
              active={is(`${base}/dashboard`)}
            />
            <div className="my-2 border-t border-white/10" />
            <Item
              href={`${base}/clients`}
              icon={<Users size={20} />}
              label={t("clients")}
              active={is(`${base}/clients`)}
            />
            <Item
              href={`${base}`}
              icon={<MessageSquare size={20} />}
              label={t("messages")}
              active={pathname === base}
            />
            <Item
              href={`${base}/factures`}
              icon={<FolderOpen size={20} />}
              label={t("mesFactures")}
              active={is(`${base}/factures`)}
            />
          </>
        )}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="px-3 pb-2 text-sm text-white/70">{user?.username}</div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[16px] text-white/80 hover:bg-white/10"
        >
          <LogOut size={20} />
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
