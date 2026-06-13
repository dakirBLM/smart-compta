"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Lang, TranslationKey, translations } from "./i18n";

interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey) => string;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem("lang")) as Lang | null;
    if (saved === "fr" || saved === "ar") setLangState(saved);
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    window.localStorage.setItem("lang", lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle = useCallback(
    () => setLangState((l) => (l === "fr" ? "ar" : "fr")),
    []
  );
  const t = useCallback(
    (key: TranslationKey) => translations[lang][key] ?? key,
    [lang]
  );

  return (
    <I18nContext.Provider
      value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", t, setLang, toggle }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
