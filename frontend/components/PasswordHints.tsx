"use client";

import { useI18n } from "@/lib/i18n-context";

export function passwordIsStrong(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function PasswordHints({ password }: { password: string }) {
  const { t } = useI18n();
  const rules = [
    { ok: password.length >= 12, label: t("passwordRuleLength") },
    { ok: /[a-z]/.test(password), label: t("passwordRuleLower") },
    { ok: /[A-Z]/.test(password), label: t("passwordRuleUpper") },
    { ok: /\d/.test(password), label: t("passwordRuleDigit") },
    { ok: /[^A-Za-z0-9]/.test(password), label: t("passwordRuleSymbol") },
  ];

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-[#5e6a65]">{t("passwordRulesTitle")}</p>
      <ul className="mt-1 space-y-0.5">
        {rules.map((rule) => (
          <li key={rule.label} className={`text-xs ${rule.ok ? "text-[#214f40]" : "text-[#8a8478]"}`}>
            {rule.ok ? "✓" : "•"} {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
