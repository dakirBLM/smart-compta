"use client";

import { useI18n } from "@/lib/i18n-context";
import { TranslationKey } from "@/lib/i18n";

const PASSWORD_RULES: { test: (password: string) => boolean; key: TranslationKey }[] = [
  { test: (password) => password.length >= 12, key: "passwordRuleLength" },
  { test: (password) => /[a-z]/.test(password), key: "passwordRuleLower" },
  { test: (password) => /[A-Z]/.test(password), key: "passwordRuleUpper" },
  { test: (password) => /\d/.test(password), key: "passwordRuleDigit" },
  { test: (password) => /[^A-Za-z0-9]/.test(password), key: "passwordRuleSymbol" },
];

export function passwordMissingRules(password: string) {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.key);
}

export function passwordIsStrong(password: string) {
  return passwordMissingRules(password).length === 0;
}

export function PasswordHints({ password }: { password: string }) {
  const { t } = useI18n();
  const rules = PASSWORD_RULES.map((rule) => ({
    ok: rule.test(password),
    label: t(rule.key),
  }));

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
