import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { copy, formatDate, stories, type Locale, type Story } from "../content";
import { TransitionLink } from "../components/AppProviders";
import { Reveal } from "../components/Reveal";
import { useLocale } from "../components/Layout";
import { usePageMeta } from "./usePageMeta";
import { getCategoryName } from "../categories";

function SectionHeading({ index, title, action, to }: { index: string; title: string; action?: string; to?: string }) {
  return (
    <div className="section-heading">
      <div>
        <span>{index}</span>
        <h2>{title}</h2>
      </div>
      {action && to ? (
        <TransitionLink to={to} className="text-link">
          {action}
          <ArrowRight aria-hidden="true" />
        </TransitionLink>
      ) : null}
    </div>
  );
}

function StoryMeta({ story, locale }: { story: Story; locale: Locale }) {
  return (
    <p className="story-meta">
      <span>{getCategoryName(story.categoryId, locale)}</span>
      <span aria-hidden="true">/</span>
      <span>{story.readTime[locale]}</span>
    </p>
  );
}

function StoryRow({ story, locale, number }: { story: Story; locale: Locale; number: number }) {
  return (
    <TransitionLink className="story-row" to={`/${locale}/stories/${story.slug}`}>
      <span className="story-number">{String(number).padStart(2, "0")}</span>
      <div className="story-row-copy">
        <h3>{story.title[locale]}</h3>
        <StoryMeta story={story} locale={locale} />
      </div>
      <ArrowUpRight className="story-arrow" aria-hidden="true" />
    </TransitionLink>
  );
}

function Newsletter({ locale }: { locale: Locale }) {
  const t = copy[locale].newsletter;
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("submitting");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), website: data.get("website"), locale }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const result = isJson ? await response.json() as { ok?: boolean } : null;
      if (!response.ok || !result?.ok) throw new Error("Subscription failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  };

  return (
    <Reveal as="section" className="newsletter container" delay={80}>
      <div className="newsletter-copy">
        <span className="eyebrow">{t.eyebrow}</span>
        <h2>{t.title}</h2>
        <p>{t.text}</p>
      </div>
      <form onSubmit={submit} className="newsletter-form" aria-busy={status === "submitting"}>
        <label htmlFor="newsletter-email">{t.label}</label>
        <div className="input-row">
          <input id="newsletter-email" name="email" type="email" placeholder={t.placeholder} required autoComplete="email" />
          <input className="newsletter-honeypot" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? t.submitting : t.button}
            <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
        <p className={`form-message ${status === "error" ? "is-error" : ""}`} aria-live="polite">
          {status === "success" ? t.success : status === "error" ? t.error : ""}
        </p>
      </form>
    </Reveal>
  );
}

export function HomePage() {
  const locale = useLocale();
  const t = copy[locale];
  const heroRef = useRef<HTMLElement>(null);
  usePageMeta(
    locale === "zh" ? "万象志 — Omni Journal" : "Omni Journal",
    t.hero.lead,
    { path: `/${locale}`, locale },
  );

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;
      const introDelay = sessionStorage.getItem("omniblog-intro-seen") === "true" ? 0.06 : 1.72;
      gsap
        .timeline({ defaults: { duration: 0.78, ease: "power3.out" }, delay: introDelay })
        .from(".hero-eyebrow", { autoAlpha: 0, y: 14 })
        .from(".hero-title-line > span", { yPercent: 112, stagger: 0.1 }, "-=0.5")
        .from([".hero-lead", ".hero-issue", ".hero-scroll"], { autoAlpha: 0, y: 18, stagger: 0.08 }, "-=0.46");
    },
    { scope: heroRef },
  );

  return (
    <>
      <section className="hero container" ref={heroRef}>
        <p className="eyebrow hero-eyebrow">{t.hero.eyebrow}</p>
        <div className="hero-grid">
          <div>
            <h1 className="hero-title">
              {t.hero.lines.map((line) => (
                <span className="hero-title-line" key={line}><span>{line}</span></span>
              ))}
            </h1>
            <p className="hero-lead">{t.hero.lead}</p>
          </div>
          <div className="hero-aside">
            <div className="hero-issue">
              <span>{t.hero.issue}</span>
              <span>{t.hero.month}</span>
              <span>{t.hero.place}</span>
            </div>
            <a className="hero-scroll" href="#featured" aria-label={t.sections.featured}>
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <Reveal as="section" className="section container" delay={40}>
        <div id="featured" className="anchor-target" />
        <SectionHeading index="01" title={t.sections.featured} />
        <div className="featured-grid">
          <TransitionLink className="featured-story featured-story-main" to={`/${locale}/stories/${stories[0].slug}`}>
            <div className="featured-visual">
              <img
                className="editorial-art"
                src={stories[0].cover.src}
                alt={stories[0].cover.alt[locale]}
                fetchPriority="high"
              />
            </div>
            <div className="featured-copy">
              <StoryMeta story={stories[0]} locale={locale} />
              <h3>{stories[0].title[locale]}</h3>
              <p>{stories[0].summary[locale]}</p>
              <span className="card-action">{t.actions.read}<ArrowUpRight aria-hidden="true" /></span>
            </div>
          </TransitionLink>
          <TransitionLink className="featured-story featured-story-side" to={`/${locale}/stories/${stories[1].slug}`}>
            <div className="featured-side-art">
              <img
                className="editorial-art"
                src={stories[1].cover.src}
                alt={stories[1].cover.alt[locale]}
                loading="lazy"
              />
            </div>
            <div className="featured-copy">
              <StoryMeta story={stories[1]} locale={locale} />
              <h3>{stories[1].title[locale]}</h3>
              <span className="card-action">{t.actions.read}<ArrowUpRight aria-hidden="true" /></span>
            </div>
          </TransitionLink>
        </div>
      </Reveal>

      <Reveal as="section" className="section container latest-section">
        <SectionHeading index="02" title={t.sections.latest} action={t.actions.viewAll} to={`/${locale}/stories`} />
        <div className="story-list">
          {stories.slice(2).map((story, index) => (
            <StoryRow key={story.slug} story={story} locale={locale} number={index + 1} />
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="editorial-statement">
        <div className="container statement-grid">
          <p className="eyebrow">03 / {t.sections.statement}</p>
          <blockquote>“{t.statement}”</blockquote>
        </div>
      </Reveal>

      <Reveal as="section" className="section container archive-preview">
        <SectionHeading index="04" title={t.sections.archive} action={t.sections.allStories} to={`/${locale}/stories`} />
        <div className="archive-list">
          {stories.slice(0, 4).map((story) => (
            <TransitionLink className="archive-row" key={story.slug} to={`/${locale}/stories/${story.slug}`}>
              <time dateTime={story.date}>{formatDate(story.date, locale)}</time>
              <span>{story.title[locale]}</span>
              <span>{getCategoryName(story.categoryId, locale)}</span>
            </TransitionLink>
          ))}
        </div>
      </Reveal>

      <div id="newsletter" className="anchor-target" />
      <Newsletter locale={locale} />
    </>
  );
}
