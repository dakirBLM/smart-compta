"use client";

import {
  BarChart3,
  Book,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Scale,
  Settings,
  Sparkles,
  Table2,
  Truck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Journal } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 230;
const MAX_WIDTH = 460;
const DEFAULT_WIDTH = 260;
// Drag the edge left of this (px from screen left) and the nav collapses away.
const COLLAPSE_AT = 150;

const JOURNAL_TYPES: { key: string; label: string }[] = [
  { key: "achat", label: "Achats" },
  { key: "vente", label: "Ventes" },
  { key: "banque", label: "Banque" },
  { key: "caisse", label: "Caisse" },
  { key: "od", label: "Opérations diverses" },
];

function Item({
  href,
  icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-lime font-bold text-brand shadow-glow-sm shadow-lime/20"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn(active ? "text-brand" : "text-white/80 group-hover:text-white")}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {badge && (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            active
              ? "bg-brand text-lime"
              : "bg-lime text-brand"
          )}
        >
          {badge}
        </span>
      )}
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
  const [customJournaux, setCustomJournaux] = useState<Journal[]>([]);

  // Custom journals (type 'autre') shown in the Journaux list.
  useEffect(() => {
    if (!entrepriseId || !annee) return;
    api
      .get<Journal[]>(`/api/entreprises/${entrepriseId}/journaux/?annee=${annee}`)
      .then((js) => setCustomJournaux(js.filter((j) => j.type_journal === "autre")))
      .catch(() => setCustomJournaux([]));
  }, [entrepriseId, annee, pathname]);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sidebarWidth"));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
    setCollapsed(window.localStorage.getItem("sidebarCollapsed") === "1");
  }, []);

  const beginDrag = useCallback((fromCollapsed: boolean) => {
    setIsDragging(true);
    let expanded = !fromCollapsed;
    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX;
      if (x < COLLAPSE_AT) {
        setCollapsed(true);
        window.localStorage.setItem("sidebarCollapsed", "1");
        finish();
        return;
      }
      expanded = true;
      setCollapsed(false);
      window.localStorage.setItem("sidebarCollapsed", "0");
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, x));
      setWidth(w);
      window.localStorage.setItem("sidebarWidth", String(w));
    };
    const finish = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setIsDragging(false);
    };
    const onUp = () => {
      if (fromCollapsed && !expanded) {
        setCollapsed(false);
        window.localStorage.setItem("sidebarCollapsed", "0");
        setWidth(DEFAULT_WIDTH);
        window.localStorage.setItem("sidebarWidth", String(DEFAULT_WIDTH));
      }
      finish();
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      beginDrag(false);
    },
    [beginDrag]
  );
  const startReopen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      beginDrag(true);
    },
    [beginDrag]
  );

  const base = entrepriseId
    ? `/accountant/entreprises/${entrepriseId}`
    : "/accountant";
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const nav = () => onClose?.();

  return (
    <>
      {/* Collapsed handle */}
      {collapsed && (
        <div
          onMouseDown={startReopen}
          title="Ouvrir le menu"
          className="fixed inset-y-0 left-0 z-40 hidden w-2.5 cursor-col-resize bg-brand hover:bg-lime lg:block"
        >
          <span className="absolute left-0 top-1/2 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg bg-brand text-lime shadow-lg">
            <ChevronRight size={16} />
          </span>
        </div>
      )}

      <aside
        style={collapsed ? undefined : { width }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-64 max-w-[85vw] flex-col bg-brand p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:self-start lg:max-w-none lg:translate-x-0 border-r border-white/5",
          isDragging ? "" : "transition-[width,transform] duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:!w-0 lg:!min-w-0 lg:!border-0 lg:!p-0 lg:overflow-hidden"
        )}
      >
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize hover:bg-lime/50 lg:block"
          aria-label="Redimensionner le menu"
        />

        {/* Brand Logo Header */}
        <div className="mb-6 flex items-center justify-between px-2 pt-2">
          <Link href="/accountant/dashboard" className="flex items-center gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tracking-tight text-white">
                Comptia
              </span>
              <span className="rounded-md bg-lime px-1.5 py-0.5 text-xs font-black text-brand">
                DZ
              </span>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Enterprise Switcher / Context info */}
        {entrepriseName ? (
          <div className="mb-5 rounded-2xl bg-white/10 p-3 backdrop-blur-sm border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-lime">
                Entreprise active
              </span>
              {annee && (
                <span className="rounded-full bg-lime/20 px-2 py-0.5 text-[11px] font-bold text-lime">
                  {annee}
                </span>
              )}
            </div>
            <div className="mt-1 font-semibold text-white truncate text-base">
              {entrepriseName}
            </div>
            <Link
              href="/accountant/entreprises"
              className="mt-2 block text-xs text-white/70 hover:text-lime underline transition-colors"
            >
              Changer d&apos;entreprise
            </Link>
          </div>
        ) : (
          <div className="mb-4 px-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 border border-white/10">
              <Sparkles size={16} className="text-lime" />
              <span className="text-xs text-white/80 font-medium">
                Votre comptabilité devient intelligente
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {!entrepriseId ? (
            <>
              <Item
                href="/accountant/dashboard"
                icon={<LayoutDashboard size={19} />}
                label={t("dashboard")}
                active={is("/accountant/dashboard")}
                onNavigate={nav}
              />
              <Item
                href="/accountant/entreprises"
                icon={<Building2 size={19} />}
                label={t("entreprises")}
                active={is("/accountant/entreprises")}
                onNavigate={nav}
              />
            </>
          ) : (
            <>
              <Item
                href={`${base}/dashboard`}
                icon={<LayoutDashboard size={19} />}
                label={t("dashboard")}
                active={pathname === `${base}/dashboard` || pathname === base}
                onNavigate={nav}
              />

              {/* Journaux dropdown */}
              <button
                onClick={() => setJournalOpen((o) => !o)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                  pathname.includes("/journaux")
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                <span className="flex items-center gap-3">
                  <Book size={19} />
                  {t("journaux")}
                </span>
                <ChevronDown
                  size={16}
                  className={cn("transition-transform duration-200", journalOpen && "rotate-180")}
                />
              </button>

              {journalOpen && (
                <div className="ml-4 space-y-1 border-l-2 border-lime/30 pl-2.5 py-1">
                  {JOURNAL_TYPES.map((j) => (
                    <Link
                      key={j.key}
                      href={`${base}/journaux/${j.key}`}
                      onClick={nav}
                      className={cn(
                        "block rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                        pathname.endsWith(`/journaux/${j.key}`)
                          ? "bg-lime font-bold text-brand"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {j.label}
                    </Link>
                  ))}
                  {customJournaux.map((j) => (
                    <Link
                      key={j.id}
                      href={`${base}/journaux/${j.id}`}
                      onClick={nav}
                      className={cn(
                        "block truncate rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                        pathname.endsWith(`/journaux/${j.id}`)
                          ? "bg-lime font-bold text-brand"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {j.type_label}
                    </Link>
                  ))}
                  <Link
                    href={`${base}/journaux/achat?newjournal=1`}
                    onClick={nav}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-lime hover:bg-white/10 font-medium"
                  >
                    <Plus size={13} /> Nouveau journal
                  </Link>
                </div>
              )}

              <Item
                href={`${base}/factures`}
                icon={<FolderOpen size={19} />}
                label={t("mesFactures")}
                active={is(`${base}/factures`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/releves-bancaires`}
                icon={<Landmark size={19} />}
                label={t("releveBancaire")}
                active={is(`${base}/releves-bancaires`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/compte-resultat`}
                icon={<FileText size={19} />}
                label={t("compteResultat")}
                active={is(`${base}/compte-resultat`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/balance`}
                icon={<Scale size={19} />}
                label={t("balance")}
                active={is(`${base}/balance`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/grand-livre`}
                icon={<BarChart3 size={19} />}
                label={t("grandLivre")}
                active={is(`${base}/grand-livre`)}
                onNavigate={nav}
              />

              <div className="my-2 border-t border-white/10" />

              <Item
                href={`${base}/clients`}
                icon={<Users size={19} />}
                label={t("clients")}
                active={is(`${base}/clients`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/fournisseurs`}
                icon={<Truck size={19} />}
                label={t("fournisseurs")}
                active={is(`${base}/fournisseurs`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/scf`}
                icon={<Table2 size={19} />}
                label="Tableau SCF"
                active={is(`${base}/scf`)}
                onNavigate={nav}
              />
              <Item
                href={`${base}/messages`}
                icon={<MessageSquare size={19} />}
                label={t("messages")}
                active={is(`${base}/messages`)}
                onNavigate={nav}
              />
            </>
          )}
        </nav>

        {/* User Profile & Bottom Bar */}
        <div className="mt-auto border-t border-white/10 pt-3 space-y-2">
          <Link
            href="/accountant/profile"
            onClick={nav}
            className="flex items-center justify-between gap-2 rounded-xl p-2 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo}
                  alt={user.username}
                  className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-lime/50"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime font-bold text-brand text-xs">
                  {user?.username?.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white">
                  {user?.username}
                </div>
                <div className="text-[10px] text-lime">Comptable</div>
              </div>
            </div>
            <Settings size={16} className="text-white/60 hover:text-white" />
          </Link>
        </div>

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
    </>
  );
}