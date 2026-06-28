"use client";

import { BookPlus, Plus, Search, Banknote, CreditCard, FileText, Info } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  od: "OD – Opérations Diverses",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  banque: <CreditCard size={18} />,
  caisse: <Banknote size={18} />,
  od: <FileText size={18} />,
};

const TYPE_COLORS: Record<string, string> = {
  banque: "from-blue-500 to-blue-600",
  caisse: "from-amber-500 to-orange-500",
  od: "from-purple-500 to-purple-600",
  achat: "from-red-500 to-rose-600",
  vente: "from-emerald-500 to-green-600",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  banque:
    "Mouvements bancaires : encaissements par chèque ou virement, paiements fournisseurs, remboursements d'emprunts, etc.",
  caisse:
    "Opérations en espèces : encaissements cash, paiements en liquide, dépenses de petite caisse, etc.",
  od: "Opérations diverses : factures d'électricité, téléphone, loyer, salaires, amortissements, etc.",
};

type Tab = "voir" | "rechercher" | "ajouter";

export default function JournalPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const type = String(params.journalId);
  const isNumeric = /^\d+$/.test(type);
  const { id, entreprise, annee } = useEntreprise();
  const base = `/accountant/entreprises/${id}`;
  const qsAnnee = annee ? `?annee=${annee}` : "";
  const [journal, setJournal] = useState<Journal | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [tab, setTab] = useState<Tab>("voir");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Ecriture | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchCompte, setSearchCompte] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [showNewJournal, setShowNewJournal] = useState(false);
  const searchParams = useSearchParams();
  const [newName, setNewName] = useState("");

  const loadEcritures = useCallback(
    async (j: Journal, qs = "") => {
      const data = await api.get<Ecriture[]>(
        `/api/entreprises/${id}/journaux/${j.id}/ecritures/${qs}`
      );
      setEcritures(data);
    },
    [id]
  );

  // Resolve the Journal: a standard type is get-or-created; a numeric id is a
  // custom journal looked up in the year's journal list.
  useEffect(() => {
    if (!entreprise || !annee) return;
    const exercice = entreprise.exercices.find((x) => x.annee === annee);
    if (!exercice) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const all = await api.get<Journal[]>(
        `/api/entreprises/${id}/journaux/?annee=${annee}`
      );
      setJournals(all);
      let j: Journal | undefined;
      if (isNumeric) {
        j = all.find((x) => x.id === Number(type));
      } else {
        j = await api.post<Journal>(`/api/entreprises/${id}/journaux/`, {
          type_journal: type,
          annee: exercice.id,
        });
      }
      if (j) {
        setJournal(j);
        await loadEcritures(j);
      }
    })().finally(() => setLoading(false));
  }, [entreprise, annee, id, type, isNumeric, loadEcritures]);

  // Open the "Nouveau journal" modal when arriving with ?newjournal=1 (from nav).
  useEffect(() => {
    if (searchParams.get("newjournal") === "1") setShowNewJournal(true);
  }, [searchParams]);

  async function createJournal() {
    const exercice = entreprise?.exercices.find((x) => x.annee === annee);
    if (!exercice || !newName.trim()) return;
    const j = await api.post<Journal>(`/api/entreprises/${id}/journaux/`, {
      nom: newName.trim(),
      annee: exercice.id,
    });
    setShowNewJournal(false);
    setNewName("");
    router.push(`${base}/journaux/${j.id}${qsAnnee}`);
  }

  const customJournals = journals.filter((j) => j.type_journal === "autre");

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
  ];

  const title = isNumeric
    ? journal?.type_label ?? "Journal"
    : TYPE_LABELS[type] ?? type;
  const gradient = TYPE_COLORS[type] || "from-brand to-brand/80";
  const description = TYPE_DESCRIPTIONS[type];
  const icon = TYPE_ICONS[type];

  return (
    <AppShell
      title={`${t("journaux")} · ${title}`}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {/* Custom journals + create new */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {customJournals.map((j) => (
          <button
            key={j.id}
            onClick={() => router.push(`${base}/journaux/${j.id}${qsAnnee}`)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              journal?.id === j.id ? "bg-brand text-white" : "text-brand"
            )}
          >
            {j.type_label}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={() => setShowNewJournal(true)}>
          <BookPlus size={15} /> Nouveau journal
        </Button>
      </div>

      {/* Journal header banner */}
      <div
        className={`mb-5 rounded-2xl bg-gradient-to-r ${gradient} p-4 text-white shadow-md`}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/20 p-2">{icon}</div>
          <div>
            <h2 className="text-lg font-bold">
              Journal {TYPE_LABELS[type] ?? type}
            </h2>
            {description && (
              <p className="text-sm text-white/80 mt-0.5">{description}</p>
            )}
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-bold">{ecritures.length}</div>
            <div className="text-xs text-white/70">écriture{ecritures.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === tb.key ? "bg-brand text-white shadow-sm" : "bg-white text-brand border hover:bg-brand/5"
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

          {/* OD info panel */}
          {type === "od" && ecritures.length === 0 && tab === "voir" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-800">
              <Info size={18} className="mt-0.5 shrink-0 text-purple-500" />
              <div>
                <p className="font-semibold">Opérations Diverses (OD)</p>
                <p className="mt-1 text-purple-700">
                  Ce journal enregistre toutes les opérations qui ne passent ni par la banque ni par la caisse :
                  factures d&apos;électricité, téléphone, loyers, salaires, amortissements, régularisations, etc.
                  Utilisez les <strong>modèles prédéfinis</strong> pour accélérer la saisie.
                </p>
              </div>
            </div>
          )}

          {type === "caisse" && ecritures.length === 0 && tab === "voir" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <Info size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold">Journal de Caisse</p>
                <p className="mt-1 text-amber-700">
                  Ce journal enregistre tous les mouvements en <strong>espèces</strong>.
                  Les factures payées en espèces sont automatiquement comptabilisées ici depuis la page Factures.
                </p>
              </div>
            </div>
          )}

          {type === "banque" && ecritures.length === 0 && tab === "voir" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
              <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold">Journal de Banque</p>
                <p className="mt-1 text-blue-700">
                  Ce journal enregistre tous les mouvements bancaires : encaissements par <strong>chèque</strong> ou{" "}
                  <strong>virement</strong>, paiements fournisseurs, remboursements d&apos;emprunts, etc.
                  Les factures réglées par chèque/virement sont automatiquement comptabilisées ici.
                </p>
              </div>
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
          journalType={type}
        />
      </Modal>

      <Modal
        open={showNewJournal}
        onClose={() => setShowNewJournal(false)}
        title="Nouveau journal"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">Nom du journal</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Journal des salaires"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewJournal(false)}>
              {t("annuler")}
            </Button>
            <Button variant="success" onClick={createJournal} disabled={!newName.trim()}>
              {t("creer")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
