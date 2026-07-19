"use client";

import { KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ClientAccess, ClientComptable } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";

const emptyForm = { nom: "", email: "", telephone: "", adresse: "" };

/**
 * Clients de l'entreprise = clients COMPTABLES (comptes 411xxx), en miroir de
 * la page Fournisseurs (401xxx). L'accès portail (identifiant/mot de passe de
 * l'entreprise) est géré dans une section séparée en bas.
 */
export default function ClientsPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();

  // --- clients comptables (411) ---
  const [clients, setClients] = useState<ClientComptable[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientComptable | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  // --- accès portail (connexion) ---
  const [accesses, setAccesses] = useState<ClientAccess[]>([]);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessForm, setAccessForm] = useState({ nom_client: "", username: "", password: "", email: "" });
  const [accessError, setAccessError] = useState("");

  const load = () =>
    api.get<ClientComptable[]>(`/api/entreprises/${id}/clients-comptables/`).then(setClients);
  const loadAccesses = () =>
    api.get<ClientAccess[]>(`/api/entreprises/${id}/clients/`).then(setAccesses);

  useEffect(() => {
    if (!id) return;
    load();
    loadAccesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) ||
        c.numero_compte.includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(c: ClientComptable) {
    setEditing(c);
    setForm({ nom: c.nom, email: c.email, telephone: c.telephone, adresse: c.adresse });
    setError("");
    setOpen(true);
  }

  async function save() {
    setError("");
    try {
      if (editing) {
        await api.put(`/api/entreprises/${id}/clients-comptables/${editing.id}/`, form);
      } else {
        await api.post(`/api/entreprises/${id}/clients-comptables/`, form);
      }
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(c: ClientComptable) {
    await api.del(`/api/entreprises/${id}/clients-comptables/${c.id}/`);
    load();
  }

  async function createAccess() {
    setAccessError("");
    try {
      await api.post(`/api/entreprises/${id}/clients/`, accessForm);
      setAccessOpen(false);
      setAccessForm({ nom_client: "", username: "", password: "", email: "" });
      loadAccesses();
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function removeAccess(clientId: number) {
    await api.del(`/api/entreprises/${id}/clients/${clientId}/`);
    loadAccesses();
  }

  return (
    <AppShell
      title={t("clients")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {/* ------------------- Clients comptables (411) ------------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("rechercher")}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> {t("ajouter")}
        </Button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-3">N° compte</th>
              <th className="p-3">{t("nom")}</th>
              <th className="p-3">Email</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="p-3">
                  <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-700">
                    {c.numero_compte}
                  </span>
                </td>
                <td className="p-3 font-medium">{c.nom}</td>
                <td className="p-3 text-gray-500">{c.email || "—"}</td>
                <td className="p-3 text-gray-500">{c.telephone || "—"}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(c)} className="text-brand hover:opacity-70">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => remove(c)} className="text-danger hover:opacity-70">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  Aucun client comptable (compte 411). Ils sont créés automatiquement
                  lors de la comptabilisation des ventes, ou manuellement ici.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* ------------------- Accès portail (connexion) ------------------- */}
      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500">
          <KeyRound size={16} /> Accès portail de l&apos;entreprise (connexion client)
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAccessOpen(true)}>
          <Plus size={14} /> {t("ajouter")}
        </Button>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="p-3">{t("nom")}</th>
              <th className="p-3">Identifiant</th>
              <th className="p-3">Email</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {accesses.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">{a.nom_client}</td>
                <td className="p-3 font-mono text-xs">{a.username}</td>
                <td className="p-3 text-gray-500">{a.email || "—"}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="danger" onClick={() => removeAccess(a.client)}>
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
            {accesses.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">
                  {t("aucuneDonnee")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal client comptable */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t("modifier")} — ${editing.numero_compte}` : "Nouveau client (411)"}
      >
        <div className="space-y-3">
          <div>
            <Label>{t("nom")} *</Label>
            <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
          </div>
          <div>
            <Label>Adresse</Label>
            <Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
          </div>
          {!editing && (
            <p className="text-xs text-gray-400">
              Le numéro de compte (411xxx) est attribué automatiquement.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("annuler")}
            </Button>
            <Button variant="success" onClick={save} disabled={!form.nom.trim()}>
              {editing ? t("enregistrer") : t("creer")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal accès portail */}
      <Modal open={accessOpen} onClose={() => setAccessOpen(false)} title="Nouvel accès portail">
        <div className="space-y-3">
          <div>
            <Label>{t("nom")}</Label>
            <Input value={accessForm.nom_client} onChange={(e) => setAccessForm({ ...accessForm, nom_client: e.target.value })} />
          </div>
          <div>
            <Label>Identifiant</Label>
            <Input value={accessForm.username} onChange={(e) => setAccessForm({ ...accessForm, username: e.target.value })} />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input type="password" value={accessForm.password} onChange={(e) => setAccessForm({ ...accessForm, password: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={accessForm.email} onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })} />
          </div>
          {accessError && <p className="text-sm text-danger">{accessError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAccessOpen(false)}>
              {t("annuler")}
            </Button>
            <Button variant="success" onClick={createAccess}>
              {t("creer")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
