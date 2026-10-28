"use client";

import {
  BarChart3,
  Book,
  ChevronDown,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Scale,
  Table2,
  Truck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Journal } from "@/lib/types";
import { cn } from "@/lib/utils";

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
      title={label}
      className={cn(
        "relative flex min-h-[49px] flex-col items-center justify-center gap-1 rounded-[11px] px-1 py-1 text-center text-[#74807b] transition-colors hover:bg-[#f2f5f3] hover:text-[#35433e] lg:min-h-0 lg:max-h-[66px] lg:flex-1",
        "max-lg:min-h-12 max-lg:flex-none max-lg:flex-row max-lg:justify-start max-lg:gap-3 max-lg:px-3 max-lg:text-left",
        active && "bg-[#eaf2ee] text-[#214f40]"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span
        className={cn(
          "text-[9px] font-medium leading-tight tracking-tight max-lg:text-[11px]",
          active && "font-semibold"
        )}
      >
        {label}
      </span>
      {badge && (
        <span className="absolute right-1.5 top-1 rounded px-1 py-0.5 text-[6px] font-extrabold leading-none tracking-wider text-[#2d6653] bg-[#dcece5] max-lg:right-2.5 max-lg:text-[7px]">
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
  const pathname = usePathname();
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalPos, setJournalPos] = useState<{ top: number; left: number } | null>(null);
  const [customJournaux, setCustomJournaux] = useState<Journal[]>([]);
  const journalBtn = useRef<HTMLButtonElement>(null);
  const journalPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entrepriseId || !annee) return;
    api
      .get<Journal[]>(`/api/entreprises/${entrepriseId}/journaux/?annee=${annee}`)
      .then((js) => setCustomJournaux(js.filter((j) => j.type_journal === "autre")))
      .catch(() => setCustomJournaux([]));
  }, [entrepriseId, annee, pathname]);

  useEffect(() => {
    setJournalOpen(false);
    setJournalPos(null);
  }, [pathname]);

  useEffect(() => {
    if (!journalOpen) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (journalBtn.current?.contains(target) || journalPanel.current?.contains(target)) return;
      setJournalOpen(false);
      setJournalPos(null);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [journalOpen]);

  const base = `/accountant/entreprises/${entrepriseId}`;
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const nav = () => onClose?.();

  function toggleJournals() {
    setJournalOpen((openNow) => {
      const next = !openNow;
      if (next && journalBtn.current && window.matchMedia("(min-width: 1024px)").matches) {
        const rect = journalBtn.current.getBoundingClientRect();
        setJournalPos({ top: rect.top, left: rect.right + 8 });
      } else {
        setJournalPos(null);
      }
      return next;
    });
  }

  const journalActive = pathname.includes("/journaux");

  return (
    <aside
      className={cn(
        "studio-ui fixed inset-y-0 left-0 z-40 flex h-screen w-[244px] max-w-[85vw] -translate-x-full flex-col border-r border-[#e5e9e6] bg-[#fbfcfb] px-[18px] py-[18px] shadow-[20px_0_50px_rgba(20,42,35,0.13)] transition-transform duration-300 lg:sticky lg:top-0 lg:z-30 lg:w-[152px] lg:translate-x-0 lg:px-3 lg:pb-2.5 lg:pt-5 lg:shadow-none",
        open && "translate-x-0"
      )}
    >
      <div className="mb-6 flex items-center justify-between px-1 lg:justify-center lg:px-0">
        <Link
          href="/accountant/entreprises"
          title={entrepriseName || "Comptia"}
          className="flex min-w-0 flex-1 items-center lg:justify-center"
          onClick={nav}
        >
          <BrandLogo />
        </Link>
        <button
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#74807b] hover:bg-[#f2f5f3] lg:hidden"
          aria-label="Fermer le menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entrepriseId && (
          <>
            <Item
              href={`${base}/dashboard`}
              icon={<LayoutDashboard size={18} />}
              label={t("dashboard")}
              active={pathname === `${base}/dashboard` || pathname === base}
              onNavigate={nav}
            />

            <div className="relative">
              <button
                ref={journalBtn}
                type="button"
                onClick={toggleJournals}
                title={t("journaux")}
                className={cn(
                  "flex min-h-[49px] w-full flex-col items-center justify-center gap-1 rounded-[11px] px-1 py-1 text-center text-[#74807b] transition-colors hover:bg-[#f2f5f3] hover:text-[#35433e] lg:min-h-0 lg:max-h-[66px] lg:flex-1",
                  "max-lg:min-h-12 max-lg:flex-none max-lg:flex-row max-lg:justify-start max-lg:gap-3 max-lg:px-3 max-lg:text-left",
                  journalActive && "bg-[#eaf2ee] text-[#214f40]"
                )}
              >
                <Book size={18} />
                <span
                  className={cn(
                    "text-[9px] font-medium leading-tight max-lg:text-[11px]",
                    journalActive && "font-semibold"
                  )}
                >
                  {t("journaux")}
                </span>
                <ChevronDown
                  size={12}
                  className={cn(
                    "absolute right-1 top-1 hidden transition-transform max-lg:static max-lg:block",
                    journalOpen && "rotate-180"
                  )}
                />
              </button>

              {journalOpen && (
                <div
                  ref={journalPanel}
                  className={cn(
                    "z-50 space-y-0.5 rounded-xl border border-[#e5e9e6] bg-white p-1.5 shadow-[0_12px_32px_rgba(28,55,47,0.12)]",
                    journalPos ? "fixed w-56" : "relative mt-1"
                  )}
                  style={journalPos ? { top: journalPos.top, left: journalPos.left } : undefined}
                >
                  {JOURNAL_TYPES.map((j) => (
                    <Link
                      key={j.key}
                      href={`${base}/journaux/${j.key}`}
                      onClick={nav}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-xs font-medium text-[#52605b] hover:bg-[#f2f5f3]",
                        pathname.endsWith(`/journaux/${j.key}`) && "bg-[#eaf2ee] font-semibold text-[#214f40]"
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
                        "block truncate rounded-lg px-3 py-2 text-xs font-medium text-[#52605b] hover:bg-[#f2f5f3]",
                        pathname.endsWith(`/journaux/${j.id}`) && "bg-[#eaf2ee] font-semibold text-[#214f40]"
                      )}
                    >
                      {j.type_label}
                    </Link>
                  ))}
                  <Link
                    href={`${base}/journaux/achat?newjournal=1`}
                    onClick={nav}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#285d4d] hover:bg-[#f2f5f3]"
                  >
                    <Plus size={13} /> Nouveau journal
                  </Link>
                </div>
              )}
            </div>

            <Item
              href={`${base}/factures`}
              icon={<FolderOpen size={18} />}
              label={t("mesFactures")}
              badge="IA"
              active={is(`${base}/factures`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/releves-bancaires`}
              icon={<Landmark size={18} />}
              label={t("releveBancaire")}
              badge="IA"
              active={is(`${base}/releves-bancaires`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/compte-resultat`}
              icon={<FileText size={18} />}
              label={t("compteResultat")}
              active={is(`${base}/compte-resultat`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/balance`}
              icon={<Scale size={18} />}
              label={t("balance")}
              active={is(`${base}/balance`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/bilan`}
              icon={<Table2 size={18} />}
              label="Bilan"
              active={is(`${base}/bilan`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/grand-livre`}
              icon={<BarChart3 size={18} />}
              label={t("grandLivre")}
              active={is(`${base}/grand-livre`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/clients`}
              icon={<Users size={18} />}
              label={t("clients")}
              active={is(`${base}/clients`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/fournisseurs`}
              icon={<Truck size={18} />}
              label={t("fournisseurs")}
              active={is(`${base}/fournisseurs`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/scf`}
              icon={<Table2 size={18} />}
              label="Tableau SCF"
              active={is(`${base}/scf`)}
              onNavigate={nav}
            />
            <Item
              href={`${base}/messages`}
              icon={<MessageSquare size={18} />}
              label={t("messages")}
              active={is(`${base}/messages`)}
              onNavigate={nav}
            />
          </>
        )}
      </nav>

      <div className="mt-3 flex justify-center border-t border-[#e5e9e6] pt-3 max-lg:justify-start max-lg:px-1">
        <LanguageToggle compact className="text-[#214f40]" />
      </div>
    </aside>
  );
}
