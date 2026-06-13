"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { User } from "@/lib/types";

export default function ProfilePage() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username);
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setPreview(user.photo || null);
  }, [user]);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("email", email);
      form.append("phone", phone);
      if (password) form.append("password", password);
      if (photo) form.append("photo", photo);
      await api.patch<User>("/api/auth/me/", form);
      await refreshUser();
      setPassword("");
      setPhoto(null);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title={t("settings")}>
      <Card className="mx-auto max-w-lg">
        <h2 className="mb-4 text-lg font-bold text-brand">Mon profil</h2>
        <form onSubmit={save} className="space-y-4">
          {/* Photo */}
          <div className="flex flex-col items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPhoto}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="photo" className="h-full w-full object-cover" />
              ) : (
                <Camera size={28} />
              )}
            </button>
            <span className="mt-2 text-xs text-gray-400">
              Cliquez pour changer la photo
            </span>
          </div>

          <div>
            <Label>{t("nom")}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={password}
              placeholder="Laisser vide pour ne pas changer"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {ok && <p className="text-sm text-success">✓ Profil mis à jour.</p>}

          <Button type="submit" variant="success" className="w-full" disabled={saving}>
            {saving ? <Spinner /> : t("enregistrer")}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
