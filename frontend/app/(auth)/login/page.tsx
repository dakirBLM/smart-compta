"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Bot, Lock, Sparkles, User, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button, Input, Label, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

const schema = z.object({
  username: z.string().min(1, "Veuillez saisir votre nom"),
  password: z.string().min(1, "Veuillez saisir votre mot de passe"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError("");
    try {
      const user = await login(values.username, values.password);
      router.replace(
        user.role === "accountant" ? "/accountant/dashboard" : "/client/dashboard"
      );
    } catch {
      setError(t("loginError"));
    }
  }

  function fillDemo(user: string, pass: string) {
    setValue("username", user);
    setValue("password", pass);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 shadow-2xl relative z-10 border border-gray-100">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-baseline gap-1.5 mb-2">
            <span className="text-3xl font-black tracking-tight text-brand">
              Comptia
            </span>
            <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-black text-brand">
              DZ
            </span>
          </Link>
          <p className="text-xs text-gray-500 font-medium">
            Votre comptabilité devient intelligente
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>{t("nom")}</Label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                {...register("username")}
                autoComplete="username"
                placeholder="Ex: comptable ou client"
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label>{t("password")}</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="password"
                {...register("password")}
                autoComplete="current-password"
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full font-bold py-3 text-base rounded-xl" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="h-5 w-5 text-brand" /> : t("signIn")}
          </Button>
        </form>

        {/* Quick Demo Fillers */}
        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
            Comptes de Démo (1-Clic)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo("comptable", "comptable")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 py-2 text-xs font-semibold text-brand hover:border-lime hover:bg-lime-light/40 transition-all"
            >
              <UserCheck size={14} className="text-brand" />
              Comptable
            </button>
            <button
              type="button"
              onClick={() => fillDemo("client", "client")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 py-2 text-xs font-semibold text-brand hover:border-lime hover:bg-lime-light/40 transition-all"
            >
              <Bot size={14} className="text-brand" />
              Client
            </button>
          </div>
        </div>

        {/* Register link */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Nouveau cabinet comptable ?{" "}
          <Link href="/register" className="font-bold text-brand hover:text-emerald-700 underline">
            Créer un compte
          </Link>
        </p>
      </div>

      <LanguageToggle className="fixed bottom-4 right-4 bg-white/90 text-brand shadow-lg backdrop-blur-sm rounded-full px-3 py-1.5" />
    </div>
  );
}

