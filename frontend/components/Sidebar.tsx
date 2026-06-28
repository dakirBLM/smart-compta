"use client";

import {
  BarChart3,
  Book,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Scale,
  Settings,
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

const MIN_WIDTH = 220;
const MAX_WIDTH = 460;
const DEFAULT_WIDTH = 256;
// Drag the edge left of this (px from screen left) and the nav collapses away.
const COLLAPSE_AT = 150;

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
  const [customJournaux, setCustomJournaux] = useState<Journal[]>([]);

  // Custom journals (type 'autre') shown in the Journaux list.
  useEffect(() => {
    if (!entrepriseId || !annee) return;
    api
      .get<Journal[]>(`/api/entreprises/${entrepriseId}/journaux/?annee=${annee}`)
      .then((js) => setCustomJournaux(js.filter((j) => j.type_journal === "autre")))
      .catch(() => setCustomJournaux([]));
  }, [entrepriseId, annee, pathname]);

  // Resizable + collapsible nav. Drag the right edge to resize; drag past the
  // left limit to collapse it away (a thin handle then lets you bring it back).
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
        // Dragged past the left limit → animate away.
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
      // A plain click on the collapsed handle re-opens to the default width.
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
  // On mobile, tapping a link should close the drawer.
  const nav = () => onClose?.();

  return (
    <>
      {/* Collapsed: a thin handle — drag right or click to bring the nav back */}
      {collapsed && (
        <div
          onMouseDown={startReopen}
          title="Ouvrir le menu"
          className="fixed inset-y-0 left-0 z-40 hidden w-2 cursor-col-resize bg-brand/40 hover:bg-brand lg:block"
        >
          <span className="absolute left-0 top-1/2 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-md bg-brand text-white shadow">
            <ChevronRight size={16} />
          </span>
        </div>
      )}

      <aside
        style={collapsed ? undefined : { width }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-64 max-w-[85vw] flex-col bg-brand p-4 text-white lg:static lg:max-w-none lg:translate-x-0",
          isDragging ? "" : "transition-[width,transform] duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:!w-0 lg:!min-w-0 lg:!border-0 lg:!p-0 lg:overflow-hidden"
        )}
      >
        {/* Resize handle (desktop only) — drag to stretch, or past the left to collapse */}
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
                {/* Custom journals */}
                {customJournaux.map((j) => (
                  <Link
                    key={j.id}
                    href={`${base}/journaux/${j.id}`}
                    onClick={nav}
                    className={cn(
                      "block truncate rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10",
                      pathname.endsWith(`/journaux/${j.id}`) &&
                        "bg-white/15 font-semibold text-white"
                    )}
                  >
                    {j.type_label}
                  </Link>
                ))}
                {/* Create a new journal (opens the modal on the journal page) */}
                <Link
                  href={`${base}/journaux/achat?newjournal=1`}
                  onClick={nav}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/60 hover:bg-white/10"
                >
                  <Plus size={14} /> Nouveau journal
                </Link>
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
              href={`${base}/fournisseurs`}
              icon={<Truck size={20} />}
              label={t("fournisseurs")}
              active={is(`${base}/fournisseurs`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/messages`}
              icon={<MessageSquare size={20} />}
              label={t("messages")}
              active={is(`${base}/messages`)}
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
    </>
  );
}
