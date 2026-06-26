"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Fournisseur } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";

const emptyForm = { nom: "", email: "", telephone: "", adresse: "" };

export default function FournisseursPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const load = () =>
    api.get<Fournisseur[]>(`/api/entreprises/${id}/fournisseurs/`).then(setFournisseurs);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fournisseurs;
    return fournisseurs.filter(
      (f) =>
        f.nom.toLowerCase().includes(q) ||
        f.numero_compte.includes(q) ||
        f.email.toLowerCase().includes(q)
    );
  }, [fournisseurs, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(f: Fournisseur) {
    setEditing(f);
    setForm({
      nom: f.nom,
      email: f.email,
      telephone: f.telephone,
      adresse: f.adresse,
    });
    setError("");
    setOpen(true);
  }

  async function save() {
    setError("");
    try {
      if (editing) {
        await api.put(`/api/entreprises/${id}/fournisseurs/${editing.id}/`, form);
      } else {
        await api.post(`/api/entreprises/${id}/fournisseurs/`, form);
      }
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(fournisseurId: number) {
    await api.del(`/api/entreprises/${id}/fournisseurs/${fournisseurId}/`);
    load();
  }

  return (
    <AppShell
      title={t("fournisseurs")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
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
              <th className="p-3">{t("nom")}</th>
              <th className="p-3">{t("compte")}</th>
              <th className="p-3">Email</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-3">{f.nom}</td>
                <td className="p-3 font-mono text-brand">{f.numero_compte}</td>
                <td className="p-3">{f.email}</td>
                <td className="p-3">{f.telephone}</td>
                <td className="p-3 text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                    <Pencil size={14} /> {t("modifier")}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(f.id)}>
                    <Trash2 size={14} /> {t("supprimer")}
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  {t("aucuneDonnee")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("modifier") : t("ajouter")}
      >
        <div className="space-y-3">
          <div>
            <Label>{t("nom")}</Label>
            <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </div>
          <div>
            <Label>Adresse</Label>
            <Input
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </div>
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
    </AppShell>
  );
}
