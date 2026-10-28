"use client";

import { ArrowUpRight, LogOut, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EntrepriseForm } from "@/components/EntrepriseForm";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { ClientAccess, Entreprise } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONES = [
  "bg-[#deebe5] text-[#235947]",
  "bg-[#e8e8ed] text-[#50515a]",
  "bg-[#e5ece4] text-[#3f6049]",
  "bg-[#ece9e3] text-[#625747]",
];

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "EN"
  );
}

function yearOf(e: Entreprise, yearFilter: number | null) {
  if (yearFilter && e.exercices.some((x) => x.annee === yearFilter)) return yearFilter;
  return e.exercices.find((x) => x.is_active)?.annee ?? e.exercices[0]?.annee ?? null;
}

export default function EntreprisesPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [selected, setSelected] = useState<Entreprise | null>(null);
  const [clientsById, setClientsById] = useState<Record<number, ClientAccess[] | undefined>>({});
  const [companySearch, setCompanySearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | "delete" | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    entreprises.forEach((e) => e.exercices.forEach((x) => years.add(x.annee)));
    return Array.from(years).sort((a, b) => b - a);
  }, [entreprises]);

  const visibleEntreprises = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    return entreprises.filter((e) => {
      const matchesYear = yearFilter
        ? e.exercices.some((x) => x.annee === yearFilter)
        : true;
      const matchesName = query ? e.nom.toLowerCase().includes(query) : true;
      return matchesYear && matchesName;
    });
  }, [entreprises, yearFilter, companySearch]);

  const load = () => api.get<Entreprise[]>("/api/entreprises/").then(setEntreprises);

  useEffect(() => {
    load().catch(() => setEntreprises([]));
  }, []);

  useEffect(() => {
    if (yearFilter === null && allYears.length) setYearFilter(allYears[0]);
  }, [allYears, yearFilter]);

  function loadClients(id: number) {
    api
      .get<ClientAccess[]>(`/api/entreprises/${id}/clients/`)
      .then((rows) => setClientsById((prev) => ({ ...prev, [id]: rows })))
      .catch(() => setClientsById((prev) => ({ ...prev, [id]: prev[id] ?? [] })));
  }

  function revealClients(id: number) {
    setOpenId((current) => {
      if (current !== id) setClientSearch("");
      return id;
    });
    if (!clientsById[id]) loadClients(id);
  }

  async function deleteClient(entrepriseId: number, clientId: number) {
    await api.del(`/api/entreprises/${entrepriseId}/clients/${clientId}/`);
    loadClients(entrepriseId);
    load();
  }

  async function deleteEntreprise() {
    if (!selected) return;
    await api.del(`/api/entreprises/${selected.id}/`);
    setModal(null);
    setSelected(null);
    setOpenId(null);
    setPinnedId(null);
    load();
  }

  function enter(e: Entreprise) {
    const year = yearOf(e, yearFilter);
    router.push(
      year
        ? `/accountant/entreprises/${e.id}?annee=${year}`
        : `/accountant/entreprises/${e.id}`
    );
  }

  return (
    <div className="studio-ui flex min-h-screen flex-col bg-[radial-gradient(circle_at_85%_12%,rgba(104,151,136,0.08),transparent_27%),#f8faf8] px-5 sm:px-[5vw]">
      <header className="flex h-[78px] items-center justify-between lg:h-24">
        <Link href="/accountant/entreprises" className="flex items-center gap-2.5">
          <span className="relative grid h-[31px] w-[31px] place-items-center rounded-[9px] bg-[#173c32]">
            <span className="absolute left-2 top-[11px] h-3 w-1 rotate-[35deg] rounded-full bg-white/65" />
            <span className="absolute left-3.5 top-[7px] h-[18px] w-1 rotate-[35deg] rounded-full bg-white" />
            <span className="absolute right-[7px] top-2 h-[9px] w-1 rotate-[35deg] rounded-full bg-white/80" />
          </span>
          <span className="text-[21px] font-bold tracking-tight text-[#17221f]">Comptia</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle compact className="text-[#214f40]" />
          <Link
            href="/accountant/profile?plain=1"
            className="grid h-[42px] w-[42px] place-items-center overflow-hidden rounded-full bg-[#254b40] text-[12px] font-bold text-[#f7faf8]"
          >
            {user?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              user?.username?.slice(0, 2).toUpperCase()
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[960px] flex-1 py-8 lg:py-16">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 sm:mb-12 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#285d4d]">
              {t("espaceComptable")}
            </p>
            <h1 className="mt-2 text-[37px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#14201d] sm:text-5xl lg:text-[58px]">
              {t("pickerTitle")}
            </h1>
            <p className="mt-3 max-w-xl text-base text-[#69736f]">{t("choisirEntrepriseHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => setModal("create")}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#285d4d] px-4 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-3px_8px_rgba(12,32,26,0.45)] transition hover:bg-[#1e4f40]"
          >
            <Plus size={15} />
            {t("ajouterEntreprise")}
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a928f]" />
            <input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder={t("rechercher")}
              className="h-11 w-full rounded-xl border border-[#e5e9e6] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#7c9f92]"
            />
          </label>
          <select
            className="h-11 rounded-xl border border-[#e5e9e6] bg-white px-3 text-sm text-[#52605b]"
            value={yearFilter ?? ""}
            onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("annees")}
          >
            <option value="">{t("annees")}</option>
            {allYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {visibleEntreprises.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-[#d5ded9] bg-white/70 px-6 py-16 text-center text-sm text-[#69736f]">
            {t("aucuneDonnee")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {visibleEntreprises.map((e, index) => {
              const year = yearOf(e, yearFilter);
              const companyClients = clientsById[e.id];
              const revealed = openId === e.id;
              const shownClients = (companyClients ?? []).filter((c) =>
                c.nom_client.toLowerCase().includes(clientSearch.trim().toLowerCase())
              );
              return (
                <div
                  key={e.id}
                  style={{ animationDelay: `${index * 40}ms` }}
                  className={cn(
                    "relative rounded-[18px] border border-[#e5e9e6] bg-white/90 text-left shadow-[0_3px_12px_rgba(21,41,35,0.025)] transition hover:border-[#c9d5d0] [animation:studio-card-in_0.5s_cubic-bezier(0.2,0.8,0.2,1)_both]",
                    revealed && "z-20 border-[#c9d5d0]"
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => enter(e)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        enter(e);
                      }
                    }}
                    className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 p-4 sm:p-[22px]"
                  >
                    <span
                      className={`grid h-[54px] w-[54px] place-items-center rounded-[15px] text-sm font-bold ${TONES[index % TONES.length]}`}
                    >
                      {initials(e.nom)}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-base font-semibold text-[#17221f]">
                        {e.nom}
                      </strong>
                      <small className="mt-1 block truncate text-xs text-[#69736f]">
                        {e.activite || e.ville || "—"}
                        {year ? ` · ${year}` : ""}
                      </small>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div
                        className="relative"
                        onMouseEnter={() => revealClients(e.id)}
                        onMouseLeave={() =>
                          setOpenId((current) =>
                            current === e.id && pinnedId !== e.id ? null : current
                          )
                        }
                        onFocus={() => revealClients(e.id)}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setOpenId((current) => (current === e.id ? null : current));
                            setPinnedId((current) => (current === e.id ? null : current));
                          }
                        }}
                      >
                        <button
                          type="button"
                          title={t("clients")}
                          aria-label={t("clients")}
                          aria-expanded={revealed}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (pinnedId === e.id) {
                              setPinnedId(null);
                              setOpenId(null);
                              return;
                            }
                            setPinnedId(e.id);
                            revealClients(e.id);
                          }}
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-full text-[#69736f] hover:bg-[#f1f5f3]",
                            revealed && "bg-[#eaf2ee] text-[#214f40]"
                          )}
                        >
                          <Users size={15} />
                        </button>
                        {revealed && (
                          <div
                            className="absolute right-0 top-full z-30 w-[min(280px,70vw)] pt-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="absolute right-2.5 top-2 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-[#e5e9e6] bg-white" />
                            <div className="rounded-2xl border border-[#e5e9e6] bg-white p-3 shadow-[0_16px_40px_rgba(28,55,47,0.12)]">
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6d8f82]">
                                {t("clients")}
                              </p>
                              <label className="mb-2 flex items-center gap-2 rounded-xl border border-[#e5e9e6] bg-[#f7faf8] px-2.5">
                                <Search size={14} className="shrink-0 text-[#8a928f]" />
                                <input
                                  value={clientSearch}
                                  onChange={(event) => setClientSearch(event.target.value)}
                                  placeholder={t("rechercher")}
                                  className="h-8 w-full bg-transparent text-sm outline-none"
                                />
                              </label>
                              {companyClients === undefined ? (
                                <p className="px-1 py-2 text-xs text-[#8a928f]">…</p>
                              ) : shownClients.length === 0 ? (
                                <p className="px-1 py-2 text-xs text-[#8a928f]">{t("aucuneDonnee")}</p>
                              ) : (
                                <ul className="max-h-40 space-y-0.5 overflow-auto">
                                  {shownClients.map((c) => (
                                    <li
                                      key={c.id}
                                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
                                    >
                                      <span className="min-w-0 truncate text-sm text-[#24312c]">
                                        {c.nom_client}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => deleteClient(e.id, c.client)}
                                        className="shrink-0 text-[11px] font-semibold text-[#9a6a6a] hover:text-[#7a4545]"
                                      >
                                        {t("supprimer")}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        title={t("modifier")}
                        aria-label={t("modifier")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(e);
                          setModal("edit");
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#69736f] hover:bg-[#f1f5f3]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title={t("supprimer")}
                        aria-label={t("supprimer")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(e);
                          setModal("delete");
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#69736f] hover:bg-[#f8ecec]"
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#f1f5f3] text-[#285d4d]">
                        <ArrowUpRight size={16} />
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>

      <footer className="flex min-h-[74px] items-center justify-between border-t border-[#e5e9e6] text-xs text-[#8a928f]">
        <span>Comptia DZ</span>
        <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 hover:text-[#214f40]">
          <LogOut size={14} />
          {t("logout")}
        </button>
      </footer>

      <Modal open={modal === "create"} onClose={() => setModal(null)} title={t("ajouter")} wide>
        <EntrepriseForm
          mode="create"
          onCancel={() => setModal(null)}
          onDone={() => {
            setModal(null);
            load();
          }}
        />
      </Modal>

      <Modal open={modal === "edit"} onClose={() => setModal(null)} title={t("modifier")} wide>
        {selected && (
          <EntrepriseForm
            mode="edit"
            initial={selected}
            onCancel={() => setModal(null)}
            onDone={() => {
              setModal(null);
              load();
            }}
          />
        )}
      </Modal>

      <Modal open={modal === "delete"} onClose={() => setModal(null)} title="Supprimer l'entreprise">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Voulez-vous vraiment supprimer <strong>{selected.nom}</strong> ? Cette action
              supprimera aussi ses données associées.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModal(null)}>
                Annuler
              </Button>
              <Button variant="danger" onClick={deleteEntreprise}>
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
