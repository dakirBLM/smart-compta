"use client";

import { ArrowLeft, Camera, LogOut } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PasswordHints, passwordIsStrong } from "@/components/PasswordHints";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { User } from "@/lib/types";

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="studio-ui min-h-screen bg-[#f5f7f5]" />}>
      <ProfileScreen />
    </Suspense>
  );
}

function ProfileScreen() {
  const { t } = useI18n();
  const params = useSearchParams();
  const entrepriseId = Number(params.get("entreprise"));
  const year = Number(params.get("annee"));
  const fromCompany = Number.isInteger(entrepriseId) && entrepriseId > 0;
  const backHref = fromCompany
    ? `/accountant/entreprises/${entrepriseId}/dashboard${
        Number.isInteger(year) && year > 0 ? `?annee=${year}` : ""
      }`
    : "/accountant/entreprises";
  const backLabel = fromCompany ? t("dashboard") : t("entreprises");
  const { user, refreshUser, logout } = useAuth();
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
    if (password && !passwordIsStrong(password)) {
      setError("Le mot de passe doit être solide.");
      return;
    }
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

  const form = (
      <Card className="mx-auto max-w-lg border-[#e5e9e6] shadow-[0_4px_18px_rgba(27,55,46,0.04)]">
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
            {password ? <PasswordHints password={password} /> : null}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {ok && <p className="text-sm text-success">✓ Profil mis à jour.</p>}

          <Button type="submit" variant="success" className="w-full" disabled={saving}>
            {saving ? <Spinner /> : t("enregistrer")}
          </Button>
        </form>
      </Card>
  );

  return (
    <div className="studio-ui min-h-screen bg-[radial-gradient(circle_at_85%_12%,rgba(104,151,136,0.08),transparent_27%),#f8faf8] px-5 py-8 sm:px-[5vw]">
      <div className="mx-auto max-w-lg">
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#214f40]"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#285d4d]">
          {t("settings")}
        </p>
        {form}
        <button
          type="button"
          onClick={logout}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e9e6] bg-white text-sm font-semibold text-[#214f40] hover:border-[#c9d5d0]"
        >
          <LogOut size={16} />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
