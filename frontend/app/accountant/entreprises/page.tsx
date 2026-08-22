"use client";

import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EntrepriseForm } from "@/components/EntrepriseForm";
import { Modal } from "@/components/Modal";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ClientAccess, Entreprise } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function EntreprisesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [selected, setSelected] = useState<Entreprise | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [clients, setClients] = useState<ClientAccess[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | "delete" | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  // All fiscal years across the accountant's companies (most recent first).
  const allYears = useMemo(() => {
    const s = new Set<number>();
    entreprises.forEach((e) => e.exercices.forEach((x) => s.add(x.annee)));
    return Array.from(s).sort((a, b) => b - a);
  }, [entreprises]);

  // Per the workflow: pick the YEAR first, then the entreprise.
  const visibleEntreprises = useMemo(
    () =>
      yearFilter
        ? entreprises.filter((e) => e.exercices.some((x) => x.annee === yearFilter))
        : entreprises,
    [entreprises, yearFilter]
  );

  const load = () =>
    api.get<Entreprise[]>("/api/entreprises/").then((data) => {
      setEntreprises(data);
      if (!selected && data.length) selectEntreprise(data[0]);
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default the year filter to the most recent once data loads.
  useEffect(() => {
    if (yearFilter === null && allYears.length) setYearFilter(allYears[0]);
  }, [allYears, yearFilter]);

  function selectEntreprise(e: Entreprise) {
    setSelected(e);
    const year =
      yearFilter ??
      e.exercices.find((x) => x.is_active)?.annee ??
      e.exercices[0]?.annee ??
      null;
    setSelectedYear(year);
    api
      .get<ClientAccess[]>(`/api/entreprises/${e.id}/clients/`)
      .then(setClients)
      .catch(() => setClients([]));
  }

  const filteredClients = useMemo(
    () =>
      clients.filter((c) =>
        c.nom_client.toLowerCase().includes(search.toLowerCase())
      ),
    [clients, search]
  );

  async function deleteClient(clientId: number) {
    if (!selected) return;
    await api.del(`/api/entreprises/${selected.id}/clients/${clientId}/`);
    selectEntreprise(selected);
  }

  async function deleteEntreprise() {
    if (!selected) return;
    await api.del(`/api/entreprises/${selected.id}/`);
    setModal(null);
    setSelected(null);
    setSelectedYear(null);
    setClients([]);
    load();
  }

  return (
    <AppShell title={t("entreprises")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* Left action panel */}
        <div className="space-y-3">
          <Button variant="primary" className="w-full font-bold shadow-glow-sm" onClick={() => setModal("create")}>
            <Plus size={16} /> {t("ajouter")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="w-full text-xs font-semibold"
              onClick={() => setModal("edit")}
              disabled={!selected}
            >
              <Pencil size={14} /> {t("modifier")}
            </Button>
            <Button
              variant="danger"
              className="w-full text-xs font-semibold"
              onClick={() => setModal("delete")}
              disabled={!selected}
            >
              <Trash2 size={14} /> {t("supprimer")}
            </Button>
          </div>

          <div className="pt-3 border-t border-gray-200">
            {/* Step 1: choose the year */}
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
              1. {t("annees")}
            </div>
            <select
              className="mb-4 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-brand outline-none focus:border-brand focus:ring-2 focus:ring-lime/40"
              value={yearFilter ?? ""}
              onChange={(e) => {
                setYearFilter(e.target.value ? Number(e.target.value) : null);
                setSelected(null);
              }}
            >
              <option value="">Toutes les années</option>
              {allYears.map((y) => (
                <option key={y} value={y}>
                  Exercice {y}
                </option>
              ))}
            </select>

            {/* Step 2: choose the entreprise */}
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              2. {t("entreprises")}
            </div>
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {visibleEntreprises.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEntreprise(e)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all",
                    selected?.id === e.id
                      ? "bg-brand font-bold text-lime shadow-brand-glow"
                      : "bg-white text-gray-700 hover:bg-gray-100 hover:text-brand border border-gray-100"
                  )}
                >
                  <span className="truncate">{e.nom}</span>
                  {selected?.id === e.id && (
                    <span className="h-2 w-2 rounded-full bg-lime" />
                  )}
                </button>
              ))}
              {visibleEntreprises.length === 0 && (
                <p className="text-xs text-gray-400 py-3 text-center">{t("aucuneDonnee")}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center: Années | Clients */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/80 px-3.5">
            <Search size={16} className="text-gray-400" />
            <input
              className="h-10 flex-1 bg-transparent text-xs font-medium outline-none text-brand"
              placeholder={t("rechercher")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {selected ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="mb-3 flex items-center justify-between border-b pb-2 font-bold text-brand text-sm">
                  <span>{t("annees")} fiscales</span>
                  <span className="text-[11px] text-gray-400 font-normal">Sélectionner pour entrer</span>
                </h3>
                <div className="space-y-2">
                  {selected.exercices.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedYear(ex.annee)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-xs font-bold transition-all",
                        selectedYear === ex.annee
                          ? "bg-lime text-brand shadow-glow-sm shadow-lime/25 ring-2 ring-lime"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      <span>Exercice {ex.annee}</span>
                      {ex.is_active && (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold">
                          Actif
                        </span>
                      )}
                    </button>
                  ))}
                  {selected.exercices.length === 0 && (
                    <p className="text-xs text-gray-400 py-4 text-center">{t("aucuneDonnee")}</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 flex items-center justify-between border-b pb-2 font-bold text-brand text-sm">
                  <span>{t("clients")} associés</span>
                  <span className="text-[11px] text-gray-400 font-normal">{filteredClients.length} au total</span>
                </h3>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {filteredClients.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-3.5 py-2.5 hover:bg-white transition-all text-xs"
                    >
                      <span className="font-semibold text-brand">{c.nom_client}</span>
                      {modal === "delete" && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => deleteClient(c.client)}
                        >
                          {t("supprimer")}
                        </Button>
                      )}
                    </div>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="text-xs text-gray-400 py-4 text-center">{t("aucuneDonnee")}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-gray-400">
              Sélectionnez une entreprise dans le panneau de gauche
            </div>
          )}

          {selected && selectedYear && (
            <div className="mt-8 flex justify-end border-t pt-4">
              <Button
                variant="primary"
                size="lg"
                className="font-bold gap-2 text-sm shadow-glow"
                onClick={() =>
                  router.push(
                    `/accountant/entreprises/${selected.id}?annee=${selectedYear}`
                  )
                }
              >
                <span>Accéder au dossier ({selected.nom} · {selectedYear})</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title={t("ajouter")}
        wide
      >
        <EntrepriseForm
          mode="create"
          onCancel={() => setModal(null)}
          onDone={() => {
            setModal(null);
            load();
          }}
        />
      </Modal>

      <Modal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        title={t("modifier")}
        wide
      >
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

      <Modal
        open={modal === "delete"}
        onClose={() => setModal(null)}
        title="Supprimer l'entreprise"
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Voulez-vous vraiment supprimer <strong>{selected.nom}</strong> ?
              Cette action supprimera aussi ses données associées.
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
    </AppShell>
  );
}
