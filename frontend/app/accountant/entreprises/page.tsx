"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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

  const load = () =>
    api.get<Entreprise[]>("/api/entreprises/").then((data) => {
      setEntreprises(data);
      if (!selected && data.length) selectEntreprise(data[0]);
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectEntreprise(e: Entreprise) {
    setSelected(e);
    const year =
      e.exercices.find((x) => x.is_active)?.annee ?? e.exercices[0]?.annee ?? null;
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

  return (
    <AppShell title={t("entreprises")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        {/* Left action panel */}
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setModal("create")}>
            <Plus size={16} /> {t("ajouter")}
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setModal("delete")}
            disabled={!selected}
          >
            <Trash2 size={16} /> {t("supprimer")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setModal("edit")}
            disabled={!selected}
          >
            <Pencil size={16} /> {t("modifier")}
          </Button>

          <div className="pt-4">
            <div className="mb-2 text-sm font-semibold text-gray-500">
              {t("entreprises")}
            </div>
            <div className="space-y-1">
              {entreprises.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEntreprise(e)}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left text-sm",
                    selected?.id === e.id
                      ? "bg-brand text-white"
                      : "hover:bg-gray-100"
                  )}
                >
                  {e.nom}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Années | Clients */}
        <Card>
          <div className="mb-4 flex items-center gap-2 rounded-lg border px-3">
            <Search size={16} className="text-gray-400" />
            <input
              className="h-10 flex-1 outline-none"
              placeholder={t("rechercher")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {selected ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="mb-2 border-b pb-2 font-semibold text-brand">
                  {t("annees")}
                </h3>
                <div className="space-y-1">
                  {selected.exercices.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedYear(ex.annee)}
                      className={cn(
                        "block w-full rounded-lg px-3 py-2 text-left",
                        selectedYear === ex.annee
                          ? "bg-green-100 font-semibold text-success"
                          : "hover:bg-gray-100"
                      )}
                    >
                      {ex.annee}
                    </button>
                  ))}
                  {selected.exercices.length === 0 && (
                    <p className="text-sm text-gray-400">{t("aucuneDonnee")}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 border-b pb-2 font-semibold text-brand">
                  {t("clients")}
                </h3>
                <div className="space-y-1">
                  {filteredClients.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-100"
                    >
                      <span>{c.nom_client}</span>
                      {modal === "delete" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteClient(c.client)}
                        >
                          {t("supprimer")}
                        </Button>
                      )}
                    </div>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="text-sm text-gray-400">{t("aucuneDonnee")}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">{t("aucuneDonnee")}</p>
          )}

          {selected && selectedYear && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="success"
                onClick={() =>
                  router.push(
                    `/accountant/entreprises/${selected.id}?annee=${selectedYear}`
                  )
                }
              >
                {t("entrer")} →
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
    </AppShell>
  );
}
