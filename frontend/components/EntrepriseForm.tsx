"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Entreprise } from "@/lib/types";

type Mode = "create" | "edit";

const STEP1: { key: keyof Entreprise; label: string; locked?: boolean }[] = [
  { key: "nom", label: "Nom" },
  { key: "nif", label: "NIF", locked: true },
  { key: "nis", label: "NIS", locked: true },
  { key: "date_creation", label: "Date de création" },
  { key: "adresse", label: "Adresse" },
  { key: "ville", label: "Ville" },
  { key: "code_postal", label: "Code postal" },
  { key: "exercice_comptable", label: "Exercice comptable", locked: true },
  { key: "banque", label: "Banque" },
  { key: "numero_compte", label: "N° de compte" },
  { key: "rib", label: "RIB" },
  { key: "regime_fiscale", label: "Régime fiscal" },
];

const STEP2: { key: keyof Entreprise; label: string }[] = [
  { key: "activite", label: "Activité" },
  { key: "matiere_premiere", label: "Matière première" },
  { key: "marchandise", label: "Marchandise" },
  { key: "matieres_consommables", label: "Matières consommables" },
  { key: "telephone", label: "Téléphone" },
  { key: "email", label: "Email" },
];

export function EntrepriseForm({
  mode,
  initial,
  onDone,
  onCancel,
}: {
  mode: Mode;
  initial?: Entreprise;
  onDone: (e: Entreprise) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    [...STEP1, ...STEP2].forEach(({ key }) => {
      base[key as string] = initial ? String(initial[key] ?? "") : "";
    });
    return base;
  });
  // Step 3 (create only): client account
  const [client, setClient] = useState({ nom_client: "", username: "", password: "", email: "" });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function saveEntreprise(): Promise<Entreprise | null> {
    setError("");
    setSaving(true);
    try {
      let ent: Entreprise;
      if (mode === "create") {
        ent = await api.post<Entreprise>("/api/entreprises/", form);
      } else {
        ent = await api.put<Entreprise>(`/api/entreprises/${initial!.id}/`, form);
      }
      return ent;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave() {
    const ent = await saveEntreprise();
    if (ent) onDone(ent);
  }

  async function handleCreate(sendEmail: boolean) {
    const ent = await saveEntreprise();
    if (!ent) return;
    if (client.username && client.password) {
      try {
        await api.post(`/api/entreprises/${ent.id}/clients/`, {
          nom_client: client.nom_client || client.username,
          username: client.username,
          password: client.password,
          email: sendEmail ? client.email : "",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur création client");
        return;
      }
    }
    onDone(ent);
  }

  const lastStep = mode === "edit" ? 2 : 3;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[1, 2, ...(mode === "create" ? [3] : [])].map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full ${
              s <= step ? "bg-success" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {STEP1.map(({ key, label, locked }) => {
            const isLocked = mode === "edit" && locked;
            return (
              <div key={key as string}>
                <Label className={isLocked ? "text-danger" : ""}>
                  {label} {isLocked && "🔒"}
                </Label>
                <Input
                  type={key === "date_creation" ? "date" : "text"}
                  value={form[key as string]}
                  locked={isLocked}
                  disabled={isLocked}
                  onChange={(e) => set(key as string, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          {STEP2.map(({ key, label }) => (
            <div key={key as string}>
              <Label>{label}</Label>
              <Input
                value={form[key as string]}
                onChange={(e) => set(key as string, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {step === 3 && mode === "create" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Nom du client</Label>
            <Input
              value={client.nom_client}
              onChange={(e) => setClient({ ...client, nom_client: e.target.value })}
            />
          </div>
          <div>
            <Label>Identifiant</Label>
            <Input
              value={client.username}
              onChange={(e) => setClient({ ...client, username: e.target.value })}
            />
          </div>
          <div>
            <Label>Mot de passe</Label>
            <Input
              type="password"
              value={client.password}
              onChange={(e) => setClient({ ...client, password: e.target.value })}
            />
          </div>
          <div>
            <Label>Email (optionnel)</Label>
            <Input
              type="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
          {step === 1 ? t("annuler") : t("precedent")}
        </Button>

        {step < lastStep ? (
          <Button onClick={() => setStep(step + 1)}>{t("suivant")}</Button>
        ) : mode === "edit" ? (
          <Button variant="success" onClick={handleEditSave} disabled={saving}>
            {t("enregistrer")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="success" onClick={() => handleCreate(false)} disabled={saving}>
              {t("creer")}
            </Button>
            {client.email && (
              <Button onClick={() => handleCreate(true)} disabled={saving}>
                {t("creerEtEnvoyer")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
