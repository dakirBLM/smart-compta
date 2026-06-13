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
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 220;
const MAX_WIDTH = 460;
const DEFAULT_WIDTH = 256;

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
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
  open = false,
  onClose,
}: {
  entrepriseId?: number;
  entrepriseName?: string;
  annee?: number;
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const [journalOpen, setJournalOpen] = useState(pathname.includes("/journaux"));

  // Resizable width (drag the right edge). Persisted in localStorage.
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sidebarWidth"));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setWidth(w);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setWidth((w) => {
        window.localStorage.setItem("sidebarWidth", String(w));
        return w;
      });
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const base = entrepriseId
    ? `/accountant/entreprises/${entrepriseId}`
    : "/accountant";
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  // On mobile, tapping a link should close the drawer.
  const nav = () => onClose?.();

  return (
    <aside
      style={{ width }}
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-screen max-w-[85vw] flex-col bg-brand p-4 text-white transition-transform duration-200 lg:static lg:max-w-none lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Resize handle (desktop only) — drag to stretch the nav */}
      <div
        onMouseDown={startResize}
        className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize hover:bg-white/20 lg:block"
        aria-label="Redimensionner le menu"
      />

      {/* Top bar: profile photo + settings (-> profile page), mobile close */}
      <div className="mb-4 flex items-center justify-between px-1">
        <Link
          href="/accountant/profile"
          onClick={nav}
          className="flex min-w-0 items-center gap-2 rounded-lg p-1 hover:bg-white/10"
          title="Mon profil"
        >
          {user?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo}
              alt={user.username}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
              {user?.username?.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-medium">{user?.username}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/accountant/profile"
            onClick={nav}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            aria-label={t("settings")}
          >
            <Settings size={18} />
          </Link>
          {/* Close button (mobile only) */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="mb-6 px-1">
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
              onNavigate={nav}
            />
            <Item
              href="/accountant/entreprises"
              icon={<Building2 size={20} />}
              label={t("entreprises")}
              active={is("/accountant/entreprises")}
              onNavigate={nav}
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
                    onClick={nav}
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
              onNavigate={nav}
            />
            <Item
              href={`${base}/balance`}
              icon={<Scale size={20} />}
              label={t("balance")}
              active={is(`${base}/balance`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/grand-livre`}
              icon={<Book size={20} />}
              label={t("grandLivre")}
              active={is(`${base}/grand-livre`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/dashboard`}
              icon={<BarChart3 size={20} />}
              label={t("dashboard")}
              active={is(`${base}/dashboard`)}
              onNavigate={nav}
            />
            <div className="my-2 border-t border-white/10" />
            <Item
              href={`${base}/clients`}
              icon={<Users size={20} />}
              label={t("clients")}
              active={is(`${base}/clients`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}`}
              icon={<MessageSquare size={20} />}
              label={t("messages")}
              active={pathname === base}
              onNavigate={nav}
            />
            <Item
              href={`${base}/factures`}
              icon={<FolderOpen size={20} />}
              label={t("mesFactures")}
              active={is(`${base}/factures`)}
              onNavigate={nav}
            />
          </>
        )}
      </nav>

      <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
        {/* Language switcher — lives only in the left navigation */}
        <LanguageToggle className="text-white" />
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
