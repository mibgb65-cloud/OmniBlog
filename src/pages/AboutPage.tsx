import { ArrowDown } from "lucide-react";
import { useLocale } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { copy } from "../content";
import { usePageMeta } from "./usePageMeta";

export function AboutPage() {
  const locale = useLocale();
  const t = copy[locale];
  usePageMeta(locale === "zh" ? "关于 — Omni Journal" : "About — Omni Journal", t.about.lead, { locale });

  return (
    <div className="about-page">
      <header className="about-hero container">
        <p className="eyebrow">{t.about.eyebrow}</p>
        <h1>{t.about.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <div className="about-lead-row">
          <p>{t.about.lead}</p>
          <a href="#principles" aria-label={t.about.principlesTitle}><ArrowDown aria-hidden="true" /></a>
        </div>
      </header>

      <Reveal as="section" className="about-image container">
        <svg viewBox="0 0 1240 620" role="img" aria-labelledby="about-art-title about-art-desc">
          <title id="about-art-title">A study of light and shadow</title>
          <desc id="about-art-desc">An abstract landscape of paper-colored forms and a long black shadow.</desc>
          <defs>
            <linearGradient id="about-sky" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#dedbd4" />
              <stop offset="1" stopColor="#a69f95" />
            </linearGradient>
          </defs>
          <rect width="1240" height="620" fill="url(#about-sky)" />
          <circle cx="935" cy="178" r="74" fill="#f4f1ec" />
          <path d="M0 470 429 225l364 245 191-103 256 103v150H0Z" fill="#706a63" />
          <path d="m429 225 364 245-282-123Z" fill="#171717" opacity=".82" />
          <path d="M0 470h1240" fill="none" stroke="#171717" strokeWidth="2" />
        </svg>
      </Reveal>

      <section id="principles" className="principles container anchor-target">
        <Reveal className="principles-title">
          <p className="eyebrow">01 / PRINCIPLES</p>
          <h2>{t.about.principlesTitle}</h2>
        </Reveal>
        <div className="principles-list">
          {t.about.principles.map(([number, title, text], index) => (
            <Reveal className="principle-row" key={number} delay={index * 70}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
