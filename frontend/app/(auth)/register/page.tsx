"use client";

import { ArrowLeft, Camera } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
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
      router.replace("/accountant/entreprises");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "h-12 w-full rounded-2xl border border-[#e4dfd4] bg-white px-4 text-sm outline-none focus:border-[#1f3d35]";

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#171c1a]">
      <header className="mx-auto flex h-[72px] max-w-[720px] items-center justify-between px-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#214f40] hover:text-[#173c32]">
          <ArrowLeft size={16} className="rtl:rotate-180" />
          {t("back")}
        </Link>
        <LanguageToggle plain className="text-[#214f40]" />
      </header>

      <main className="mx-auto flex w-full max-w-[420px] flex-col px-5 pb-16">
        <Link href="/" className="mb-8 flex items-baseline gap-1.5">
          <span className="text-[28px] font-semibold tracking-tight">Comptia</span>
          <span className="rounded-md bg-[#d7ef6a] px-1.5 py-0.5 text-[10px] font-bold text-[#173c32]">DZ</span>
        </Link>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">{t("footerSignup")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5e6a65]">{t("heroTitle")}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="flex flex-col items-center">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-dashed border-[#cfc6b6] bg-white text-[#5e6a65] hover:border-[#1f3d35]"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera size={22} />
              )}
            </button>
            <span className="mt-2 text-xs text-[#5e6a65]">Photo de profil</span>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("nom")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Téléphone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className={field}
            />
          </label>

          {error && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-full bg-[#1f3d35] text-sm font-semibold text-white hover:bg-[#173c32] disabled:opacity-60"
          >
            {submitting ? "…" : t("footerSignup")}
          </button>
        </form>

        <p className="mt-8 text-sm text-[#5e6a65]">
          <Link href="/login" className="font-semibold text-[#214f40] hover:text-[#173c32]">
            {t("signIn")}
          </Link>
        </p>
      </main>
    </div>
  );
}
