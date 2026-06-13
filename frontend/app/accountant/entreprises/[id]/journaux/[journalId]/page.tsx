"use client";

import { Plus, Search, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EcritureForm } from "@/components/EcritureForm";
import { JournalTable } from "@/components/JournalTable";
import { Modal } from "@/components/Modal";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Ecriture, Journal } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  achat: "Achat",
  vente: "Vente",
  banque: "Banque",
  caisse: "Caisse",
  od: "OD",
};

type Tab = "voir" | "rechercher" | "ajouter" | "importer";

export default function JournalPage() {
  const { t } = useI18n();
  const params = useParams();
  const type = String(params.journalId);
  const { id, entreprise, annee } = useEntreprise();
  const [journal, setJournal] = useState<Journal | null>(null);
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [tab, setTab] = useState<Tab>("voir");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Ecriture | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchCompte, setSearchCompte] = useState("");
  const [searchDate, setSearchDate] = useState("");

  const loadEcritures = useCallback(
    async (j: Journal, qs = "") => {
      const data = await api.get<Ecriture[]>(
        `/api/entreprises/${id}/journaux/${j.id}/ecritures/${qs}`
      );
      setEcritures(data);
    },
    [id]
  );

  // Resolve (get-or-create) the Journal for this type + active year.
  useEffect(() => {
    if (!entreprise || !annee) return;
    const exercice = entreprise.exercices.find((x) => x.annee === annee);
    if (!exercice) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .post<Journal>(`/api/entreprises/${id}/journaux/`, {
        type_journal: type,
        annee: exercice.id,
      })
      .then(async (j) => {
        setJournal(j);
        await loadEcritures(j);
      })
      .finally(() => setLoading(false));
  }, [entreprise, annee, id, type, loadEcritures]);

  async function saveEcriture(payload: Parameters<typeof api.post>[1]) {
    if (!journal) return;
    if (editing) {
      await api.put(`/api/ecritures/${editing.id}/`, payload);
    } else {
      await api.post(
        `/api/entreprises/${id}/journaux/${journal.id}/ecritures/`,
        payload
      );
    }
    setShowForm(false);
    setEditing(null);
    setTab("voir");
    await loadEcritures(journal);
  }

  async function deleteEcriture(ec: Ecriture) {
    await api.del(`/api/ecritures/${ec.id}/`);
    if (journal) await loadEcritures(journal);
  }

  async function runSearch() {
    if (!journal) return;
    const qp = new URLSearchParams();
    if (searchCompte) qp.set("compte", searchCompte);
    if (searchDate) qp.set("date", searchDate);
    await loadEcritures(journal, `?${qp.toString()}`);
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "voir", label: t("voir"), icon: <Search size={15} /> },
    { key: "rechercher", label: t("rechercher"), icon: <Search size={15} /> },
    { key: "ajouter", label: t("ajouterEcriture"), icon: <Plus size={15} /> },
    { key: "importer", label: t("importer"), icon: <Upload size={15} /> },
  ];

  return (
    <AppShell
      title={`${t("journaux")} · ${TYPE_LABELS[type] ?? type}`}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => {
              setTab(tb.key);
              if (tb.key === "ajouter") {
                setEditing(null);
                setShowForm(true);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
              tab === tb.key ? "bg-brand text-white" : "bg-white text-brand border"
            )}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand" />
        </div>
      ) : (
        <Card>
          {tab === "rechercher" && (
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm">{t("compte")}</label>
                <Input
                  value={searchCompte}
                  onChange={(e) => setSearchCompte(e.target.value)}
                  placeholder="N° compte"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm">{t("date")}</label>
                <Input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                />
              </div>
              <Button onClick={runSearch} disabled={!searchCompte && !searchDate}>
                {t("rechercher")}
              </Button>
              <p className="text-xs text-gray-400">N° compte ou Date (au moins un)</p>
            </div>
          )}

          {tab === "importer" && (
            <div className="rounded-lg border-2 border-dashed p-8 text-center text-gray-500">
              <Upload className="mx-auto mb-2" />
              <p>Importer un fichier CSV / Excel</p>
              <input type="file" accept=".csv,.xlsx,.xls" className="mt-3" />
            </div>
          )}

          <JournalTable
            ecritures={ecritures}
            onEdit={(ec) => {
              setEditing(ec);
              setShowForm(true);
            }}
            onDelete={deleteEcriture}
          />
        </Card>
      )}

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? t("modifier") : t("ajouterEcriture")}
        wide
      >
        <EcritureForm
          initial={editing ?? undefined}
          onSubmit={saveEcriture}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      </Modal>
    </AppShell>
  );
}
