"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

type FormValues = { username: string; password: string };

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t("loginNameRequired")),
        password: z.string().min(1, t("loginPasswordRequired")),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function go(role: "accountant" | "client") {
    router.replace(role === "accountant" ? "/accountant/entreprises" : "/client/dashboard");
  }

  async function onSubmit(values: FormValues) {
    setError("");
    try {
      const user = await login(values.username, values.password);
      go(user.role === "accountant" ? "accountant" : "client");
    } catch {
      setError(t("loginError"));
    }
  }

  const busy = isSubmitting;

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
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">{t("login")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5e6a65]">{t("heroTitle")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("nom")}</span>
            <input
              {...register("username")}
              autoComplete="username"
              className="h-12 w-full rounded-2xl border border-[#e4dfd4] bg-white px-4 text-sm outline-none focus:border-[#1f3d35]"
            />
            {errors.username && <span className="mt-1 block text-xs text-rose-700">{errors.username.message}</span>}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("password")}</span>
            <input
              type="password"
              {...register("password")}
              autoComplete="current-password"
              className="h-12 w-full rounded-2xl border border-[#e4dfd4] bg-white px-4 text-sm outline-none focus:border-[#1f3d35]"
            />
            {errors.password && <span className="mt-1 block text-xs text-rose-700">{errors.password.message}</span>}
          </label>

          {error && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-[#1f3d35] text-sm font-semibold text-white hover:bg-[#173c32] disabled:opacity-60"
          >
            {isSubmitting ? "…" : t("signIn")}
          </button>
        </form>

        <p className="mt-8 text-sm text-[#5e6a65]">
          {t("loginNewCabinet")}{" "}
          <Link href="/register" className="font-semibold text-[#214f40] hover:text-[#173c32]">
            {t("footerSignup")}
          </Link>
        </p>
      </main>
    </div>
  );
}
