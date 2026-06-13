"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button, Input, Label, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand">
          {t("appName")}
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">{t("login")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>{t("nom")}</Label>
            <Input {...register("username")} autoComplete="username" />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input
              type="password"
              {...register("password")}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : t("signIn")}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Démo : comptable / comptable · client / client
        </p>
      </div>

      <LanguageToggle className="fixed bottom-4 right-4 bg-white text-brand" />
    </div>
  );
}
