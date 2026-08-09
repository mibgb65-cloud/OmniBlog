import { ArrowLeft } from "lucide-react";
import { TransitionLink } from "../components/AppProviders";
import { useLocale } from "../components/Layout";
import { copy } from "../content";
import { usePageMeta } from "./usePageMeta";

export function NotFoundPage() {
  const locale = useLocale();
  const t = copy[locale].notFound;
  usePageMeta(`404 — Omni Journal`, t.text, { locale, noIndex: true });

  return (
    <section className="not-found container">
      <p className="eyebrow">{t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p>{t.text}</p>
      <TransitionLink className="text-link" to={`/${locale}`}>
        <ArrowLeft aria-hidden="true" />
        {copy[locale].actions.goHome}
      </TransitionLink>
    </section>
  );
}
