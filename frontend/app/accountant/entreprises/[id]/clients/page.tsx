"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ClientAccess } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";

export default function ClientsPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [clients, setClients] = useState<ClientAccess[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nom_client: "", username: "", password: "", email: "" });
  const [error, setError] = useState("");

  const load = () =>
    api.get<ClientAccess[]>(`/api/entreprises/${id}/clients/`).then(setClients);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function create() {
    setError("");
    try {
      await api.post(`/api/entreprises/${id}/clients/`, form);
      setOpen(false);
      setForm({ nom_client: "", username: "", password: "", email: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function remove(clientId: number) {
    await api.del(`/api/entreprises/${id}/clients/${clientId}/`);
    load();
  }

  return (
    <AppShell
      title={t("clients")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> {t("ajouter")}
        </Button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-white">
            <tr>
              <th className="p-3">{t("nom")}</th>
              <th className="p-3">Identifiant</th>
              <th className="p-3">Email</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.nom_client}</td>
                <td className="p-3">{c.username}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="danger" onClick={() => remove(c.client)}>
                    <Trash2 size={14} /> {t("supprimer")}
                  </Button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-400">
                  {t("aucuneDonnee")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("ajouter")}>
        <div className="space-y-3">
          <div>
            <Label>{t("nom")}</Label>
            <Input value={form.nom_client} onChange={(e) => setForm({ ...form, nom_client: e.target.value })} />
          </div>
          <div>
            <Label>Identifiant</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("annuler")}
            </Button>
            <Button variant="success" onClick={create}>
              {t("creer")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
