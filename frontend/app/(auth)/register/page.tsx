"use client";

import { Camera } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button, Input, Label, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

export default function RegisterPage() {
  const { t } = useI18n();
  const { register } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Nom et mot de passe requis.");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("password", password);
      form.append("email", email);
      form.append("phone", phone);
      if (photo) form.append("photo", photo);
      await register(form);
      router.replace("/accountant/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand">
          {t("appName")}
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Créer un compte comptable
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
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
            <span className="mt-2 text-xs text-gray-400">Photo (optionnel)</span>
          </div>

          <div>
            <Label>{t("nom")}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Spinner /> : t("creer")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-semibold text-brand underline">
            {t("signIn")}
          </Link>
        </p>
      </div>

      <LanguageToggle className="fixed bottom-4 right-4 bg-white text-brand" />
    </div>
  );
}
