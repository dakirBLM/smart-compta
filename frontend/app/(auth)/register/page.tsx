"use client";

import { Camera, Lock, Mail, Phone, Sparkles, User } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-brand p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="w-full max-w-lg rounded-3xl bg-white p-8 sm:p-10 shadow-2xl relative z-10 border border-gray-100 my-8">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-baseline gap-1.5 mb-2">
            <span className="text-3xl font-black tracking-tight text-brand">
              Comptia
            </span>
            <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-black text-brand">
              DZ
            </span>
          </Link>
          <p className="text-xs text-gray-500 font-medium">
            Création d&apos;espace Expert-Comptable
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Photo */}
          <div className="flex flex-col items-center mb-2">
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
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand hover:bg-lime-light/30 transition-all ring-2 ring-lime/20"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="photo" className="h-full w-full object-cover" />
              ) : (
                <Camera size={24} className="text-gray-400" />
              )}
            </button>
            <span className="mt-1.5 text-xs text-gray-400">Photo de profil (optionnel)</span>
          </div>

          <div>
            <Label>{t("nom")} d&apos;utilisateur *</Label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Ex: cabinet_alger"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div>
            <Label>{t("password")} *</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@cabinet.dz"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label>Téléphone</Label>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0550 00 00 00"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full font-bold py-3 text-base rounded-xl mt-2" disabled={submitting}>
            {submitting ? <Spinner className="h-5 w-5 text-brand" /> : "Créer mon compte expert-comptable"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-bold text-brand hover:text-emerald-700 underline">
            {t("signIn")}
          </Link>
        </p>
      </div>

      <LanguageToggle className="fixed bottom-4 right-4 bg-white/90 text-brand shadow-lg backdrop-blur-sm rounded-full px-3 py-1.5" />
    </div>
  );
}

