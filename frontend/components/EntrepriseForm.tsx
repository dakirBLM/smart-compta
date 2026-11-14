"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { PasswordHints, passwordIsStrong } from "@/components/PasswordHints";
import { api } from "@/lib/api";
import {
  ACTIVITES,
  REGIMES_FISCAUX,
  WILAYAS,
  postalCodesFor,
} from "@/lib/algeria";
import { useI18n } from "@/lib/i18n-context";
import { BankAccount, Entreprise } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";
type Form = Record<string, string>;
type BankAccountPayload = {
  id?: number;
  bank_name?: string;
  account_number?: string;
  rib?: string;
};
type BankAccountFormRow = Omit<BankAccount, "id" | "scf_account"> & {
  id?: number;
  scf_account?: BankAccount["scf_account"];
  formKey: string;
};
type LongTextField = "marchandise" | "matiere_premiere" | "matieres_consommables";

const LONG_TEXT_LIMIT = 10000;

const SCALAR_FIELDS = [
  "nom", "nif", "nis", "nin", "date_creation", "adresse", "ville", "code_postal",
  "exercice_comptable", "banque", "numero_compte", "rib", "banque2",
  "numero_compte2", "rib2", "regime_fiscale", "matiere_premiere", "marchandise",
  "matieres_consommables", "telephone", "email",
];

function onlyDigits(v: string, max: number) {
  return v.replace(/\D/g, "").slice(0, max);
}

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
  const nextBankKey = useRef(0);
  const [textLimitErrors, setTextLimitErrors] = useState<Partial<Record<LongTextField, boolean>>>({});

  const [form, setForm] = useState<Form>(() => {
    const base: Form = {};
    SCALAR_FIELDS.forEach((k) => {
      base[k] = initial ? String((initial as any)[k] ?? "") : "";
    });
    return base;
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccountFormRow[]>(() => {
    if (initial?.bank_accounts !== undefined) {
      return initial.bank_accounts.map((bank, index) => ({
        ...bank,
        formKey: `bank-${bank.id}-${index}`,
      }));
    }

    if (!initial) return [];
    return [
      {
        bank_name: initial.banque ?? "",
        account_number: initial.numero_compte ?? "",
        rib: initial.rib ?? "",
        formKey: "legacy-bank-1",
      },
      {
        bank_name: initial.banque2 ?? "",
        account_number: initial.numero_compte2 ?? "",
        rib: initial.rib2 ?? "",
        formKey: "legacy-bank-2",
      },
    ].filter((bank) => bank.bank_name || bank.account_number || bank.rib);
  });
  const [activites, setActivites] = useState<string[]>(() =>
    [initial?.activite, initial?.activite2].filter(Boolean) as string[]
  );
  const [client, setClient] = useState({ nom_client: "", username: "", password: "", email: "" });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function setLongText(k: LongTextField, value: string) {
    const characters = Array.from(value);
    const exceeded = characters.length > LONG_TEXT_LIMIT;
    set(k, exceeded ? characters.slice(0, LONG_TEXT_LIMIT).join("") : value);
    setTextLimitErrors((errors) => ({ ...errors, [k]: exceeded }));
  }
  const codes = useMemo(() => postalCodesFor(form.ville), [form.ville]);
  const isCommerciale = activites.includes("Commerciale");
  const isIndustrielle = activites.includes("Industrielle");

  function toggleActivite(a: string) {
    setActivites((prev) => {
      if (prev.includes(a)) return prev.filter((x) => x !== a);
      if (prev.length >= 2) return prev; // max two
      return [...prev, a];
    });
  }

  function validateStep1(): string {
    if (!form.nom) return "Le nom est obligatoire.";
    if (!form.exercice_comptable.trim()) return "L'exercice comptable est obligatoire.";
    for (const [f, len, label] of [
      ["nif", 15, "NIF"], ["nis", 15, "NIS"], ["nin", 18, "NIN"],
      ["rib", 22, "RIB"], ["rib2", 22, "RIB 2"],
    ] as [string, number, string][]) {
      if (form[f] && form[f].length > len)
        return `${label} : ${len} chiffres maximum.`;
    }
    for (let index = 0; index < bankAccounts.length; index += 1) {
      const bank = bankAccounts[index];
      if (bank.rib && bank.rib.length > 22)
        return `RIB de la banque ${index + 1} : 22 chiffres maximum.`;
    }
    return "";
  }

  function validateStep2(): string {
    if (isCommerciale && !form.marchandise.trim())
      return "Le champ Marchandises est obligatoire pour une activité commerciale.";
    if (isIndustrielle && !form.matiere_premiere.trim())
      return "Les Matières premières sont obligatoires pour une activité industrielle.";
    if (isIndustrielle && !form.matieres_consommables.trim())
      return "Les Matières consommables sont obligatoires pour une activité industrielle.";
    return "";
  }

  function next() {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : "";
    if (err) return setError(err);
    setError("");
    setStep(step + 1);
  }

  async function saveEntreprise(): Promise<Entreprise | null> {
    setError("");
    const err = validateStep1() || validateStep2();
    if (err) {
      setError(err);
      return null;
    }
    setSaving(true);
    try {
      const bankPayload: BankAccountPayload[] = bankAccounts
        .filter((bank) =>
          bank.id !== undefined || bank.bank_name || bank.account_number || bank.rib
        )
        .map(({ id, bank_name, account_number, rib }) => ({
          ...(id !== undefined ? { id } : {}),
          bank_name,
          account_number,
          rib,
        }));

      const payload = {
        ...form,
        activite: activites[0] ?? "",
        activite2: activites[1] ?? "",
        bank_accounts: bankPayload,
      };
      const ent =
        mode === "create"
          ? await api.post<Entreprise>("/api/entreprises/", payload)
          : await api.put<Entreprise>(`/api/entreprises/${initial!.id}/`, payload);
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
  const portalPasswordOk = !client.password || passwordIsStrong(client.password);
  const lockedCls = "text-danger";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[1, 2, ...(mode === "create" ? [3] : [])].map((s) => (
          <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? "bg-success" : "bg-gray-200"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-brand">Informations générales</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nom</Label>
              <Input value={form.nom} onChange={(e) => set("nom", e.target.value)} />
            </div>
            <div>
              <Label className={mode === "edit" ? lockedCls : ""}>NIF {mode === "edit" && "🔒"}</Label>
              <Input inputMode="numeric" value={form.nif} locked={mode === "edit"} disabled={mode === "edit"}
                onChange={(e) => set("nif", onlyDigits(e.target.value, 15))} />
            </div>
            <div>
              <Label className={mode === "edit" ? lockedCls : ""}>NIS {mode === "edit" && "🔒"}</Label>
              <Input inputMode="numeric" value={form.nis} locked={mode === "edit"} disabled={mode === "edit"}
                onChange={(e) => set("nis", onlyDigits(e.target.value, 15))} />
            </div>
            <div>
              <Label>NIN (18 chiffres)</Label>
              <Input inputMode="numeric" value={form.nin}
                onChange={(e) => set("nin", onlyDigits(e.target.value, 18))} />
            </div>
            <div>
              <Label>Date de création</Label>
              <Input type="date" value={form.date_creation} onChange={(e) => set("date_creation", e.target.value)} />
            </div>
            <div>
              <Label className={mode === "edit" ? lockedCls : ""}>Exercice comptable * {mode === "edit" && "🔒"}</Label>
              <Input inputMode="numeric" placeholder="2025" value={form.exercice_comptable}
                locked={mode === "edit"} disabled={mode === "edit"}
                onChange={(e) => set("exercice_comptable", onlyDigits(e.target.value, 4))} />
            </div>
            <div>
              <Label>Régime fiscal</Label>
              <select className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                value={form.regime_fiscale} onChange={(e) => set("regime_fiscale", e.target.value)}>
                <option value="">—</option>
                {REGIMES_FISCAUX.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label>Adresse</Label>
              <Input value={form.adresse} onChange={(e) => set("adresse", e.target.value)} />
            </div>
            <div>
              <Label>Ville (Wilaya)</Label>
              <select className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                value={form.ville}
                onChange={(e) => { set("ville", e.target.value); set("code_postal", postalCodesFor(e.target.value)[0] ?? ""); }}>
                <option value="">—</option>
                {WILAYAS.map((w) => <option key={w.nom} value={w.nom}>{w.nom}</option>)}
              </select>
            </div>
            <div>
              <Label>Code postal</Label>
              {/* Suggestions from the selected wilaya, but free to type manually */}
              <Input
                inputMode="numeric"
                list="postal-codes"
                placeholder={codes[0] ?? "Code postal"}
                value={form.code_postal}
                onChange={(e) => set("code_postal", onlyDigits(e.target.value, 5))}
              />
              <datalist id="postal-codes">
                {codes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <h3 className="font-semibold text-brand">Informations bancaires</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const formKey = `new-bank-${nextBankKey.current++}`;
            
                setBankAccounts((rows) => [
                 ...rows,
               {
                  bank_name: "",
                  account_number: "",
                  rib: "",
                  formKey,
                },
              ]);
            }}
            >
              Ajouter une banque
            </Button>
          </div>
          {bankAccounts.map((bank, index) => (
            <div key={bank.formKey} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <div>
                <Label>Banque {index + 1}</Label>
                <Input
                  value={bank.bank_name}
                  onChange={(e) => setBankAccounts((rows) => rows.map((row) =>
                    row.formKey === bank.formKey ? { ...row, bank_name: e.target.value } : row
                  ))}
                />
              </div>
              <div>
                <Label>N° compte</Label>
                <Input
                  inputMode="numeric"
                  value={bank.account_number}
                  onChange={(e) => setBankAccounts((rows) => rows.map((row) =>
                    row.formKey === bank.formKey
                      ? { ...row, account_number: onlyDigits(e.target.value, 60) }
                      : row
                  ))}
                />
              </div>
              <div>
                <Label>RIB (22 chiffres)</Label>
                <Input
                  inputMode="numeric"
                  value={bank.rib}
                  onChange={(e) => setBankAccounts((rows) => rows.map((row) =>
                    row.formKey === bank.formKey
                      ? { ...row, rib: onlyDigits(e.target.value, 22) }
                      : row
                  ))}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-brand">Activité de l'entreprise (max 2)</h3>
          <div className="flex flex-wrap gap-2">
            {ACTIVITES.map((a) => {
              const on = activites.includes(a);
              const disabled = !on && activites.length >= 2;
              return (
                <button key={a} type="button" disabled={disabled} onClick={() => toggleActivite(a)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm",
                    on ? "border-success bg-success text-white" : "border-gray-300 text-gray-600",
                    disabled && "opacity-40"
                  )}>
                  {a}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={isCommerciale ? "text-danger" : ""}>
                Marchandises {isCommerciale && "*"}
              </Label>
              <Input value={form.marchandise} onChange={(e) => setLongText("marchandise", e.target.value)} />
              {textLimitErrors.marchandise && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  Maximum 10 000 caractères : le texte a été tronqué.
                </p>
              )}
            </div>
            <div>
              <Label className={isIndustrielle ? "text-danger" : ""}>
                Matières premières {isIndustrielle && "*"}
              </Label>
              <Input value={form.matiere_premiere} onChange={(e) => setLongText("matiere_premiere", e.target.value)} />
              {textLimitErrors.matiere_premiere && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  Maximum 10 000 caractères : le texte a été tronqué.
                </p>
              )}
            </div>
            <div>
              <Label className={isIndustrielle ? "text-danger" : ""}>
                Matières consommables {isIndustrielle && "*"}
              </Label>
              <Input value={form.matieres_consommables} onChange={(e) => setLongText("matieres_consommables", e.target.value)} />
              {textLimitErrors.matieres_consommables && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  Maximum 10 000 caractères : le texte a été tronqué.
                </p>
              )}
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 3 && mode === "create" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-brand">Compte client</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nom du client</Label>
              <Input value={client.nom_client} onChange={(e) => setClient({ ...client, nom_client: e.target.value })} />
            </div>
            <div>
              <Label>Identifiant</Label>
              <Input value={client.username} onChange={(e) => setClient({ ...client, username: e.target.value })} />
            </div>
            <div>
              <Label>Mot de passe</Label>
              <Input type="password" value={client.password} onChange={(e) => setClient({ ...client, password: e.target.value })} />
              <PasswordHints password={client.password} />
            </div>
            <div>
              <Label>Email (optionnel)</Label>
              <Input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={step === 1 ? onCancel : () => { setError(""); setStep(step - 1); }}>
          {step === 1 ? t("annuler") : t("precedent")}
        </Button>

        {step < lastStep ? (
          <Button onClick={next}>{t("suivant")}</Button>
        ) : mode === "edit" ? (
          <Button variant="success" onClick={handleEditSave} disabled={saving}>
            {t("enregistrer")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="success" onClick={() => handleCreate(false)} disabled={saving || !portalPasswordOk}>
              {t("creer")}
            </Button>
            {client.email && (
              <Button onClick={() => handleCreate(true)} disabled={saving || !portalPasswordOk}>
                {t("creerEtEnvoyer")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
