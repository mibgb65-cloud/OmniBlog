import { ArrowLeft, ArrowRight, ArrowUpRight, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams } from "react-router-dom";
import { TransitionLink } from "../components/AppProviders";
import { useLocale } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { copy, formatDate, stories } from "../content";
import { NotFoundPage } from "./NotFoundPage";
import { usePageMeta } from "./usePageMeta";
import { getCategoryName } from "../categories";
import { extractHeadings, slugifyHeading } from "../articles";

function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const article = document.querySelector<HTMLElement>(".article-page");
      if (!article) return;
      const start = article.offsetTop;
      const distance = Math.max(article.offsetHeight - window.innerHeight, 1);
      setProgress(Math.min(1, Math.max(0, (window.scrollY - start) / distance)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <span className="reading-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />;
}

export function ArticlePage() {
  const locale = useLocale();
  const { slug } = useParams();
  const storyIndex = stories.findIndex((item) => item.slug === slug);
  const story = stories[storyIndex];
  const t = copy[locale];
  const [copied, setCopied] = useState(false);
  const contentLocale = story?.availableLocales.includes(locale) ? locale : story?.availableLocales[0] ?? locale;
  const isFallbackTranslation = contentLocale !== locale;
  usePageMeta(
    story ? `${story.title[contentLocale]} — Omni Journal` : `404 — Omni Journal`,
    story ? story.summary[contentLocale] : t.notFound.text,
    story
      ? {
          path: `/${locale}/stories/${story.slug}`,
          locale,
          image: story.cover.src,
          type: "article",
          publishedAt: story.date,
          noIndex: isFallbackTranslation,
          hasAlternate: !isFallbackTranslation,
        }
      : { locale, noIndex: true },
  );

  if (!story) return <NotFoundPage />;
  const nextStory = stories[(storyIndex + 1) % stories.length];
  const headings = extractHeadings(story.body[contentLocale]);
  const relatedStories = stories
    .filter((candidate) => candidate.slug !== story.slug)
    .map((candidate) => {
      const sharedTags = candidate.tags[contentLocale].filter((tag) => story.tags[contentLocale].includes(tag)).length;
      const score = sharedTags * 3
        + (candidate.series[contentLocale] && candidate.series[contentLocale] === story.series[contentLocale] ? 5 : 0)
        + (candidate.categoryId === story.categoryId ? 2 : 0);
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.date.localeCompare(a.candidate.date))
    .slice(0, 3)
    .map(({ candidate }) => candidate);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="article-page" lang={contentLocale === "zh" ? "zh-CN" : "en"}>
      <ReadingProgress />
      <header className="article-header container">
        <TransitionLink className="article-back text-link" to={`/${locale}/stories`}>
          <ArrowLeft aria-hidden="true" />
          {t.actions.back}
        </TransitionLink>
        {isFallbackTranslation ? (
          <p className="translation-notice">
            {locale === "zh" ? "这篇文章目前仅提供英文版本。" : "This story is currently available in Chinese only."}
            <TransitionLink to={`/${contentLocale}/stories/${story.slug}`}>
              {locale === "zh" ? "阅读原文" : "Read the original"}
            </TransitionLink>
          </p>
        ) : null}
        <p className="story-meta article-meta">
          <TransitionLink to={`/${locale}/stories/category/${story.categoryId}`}>
            {getCategoryName(story.categoryId, locale)}
          </TransitionLink>
          <span aria-hidden="true">/</span>
          <span>{story.readTime[contentLocale]}</span>
        </p>
        <h1>{story.title[contentLocale]}</h1>
        <p className="article-deck">{story.summary[contentLocale]}</p>
        <div className="article-byline">
          <span>Omni Editorial</span>
          <span>{t.article.published} {formatDate(story.date, locale)}</span>
        </div>
        {story.series[contentLocale] || story.tags[contentLocale].length ? (
          <div className="article-taxonomy">
            {story.series[contentLocale] ? (
              <TransitionLink to={`/${locale}/stories?series=${encodeURIComponent(story.series[contentLocale]!)}`}>
                {locale === "zh" ? "系列" : "Series"} · {story.series[contentLocale]}
              </TransitionLink>
            ) : null}
            {story.tags[contentLocale].map((tag) => (
              <TransitionLink key={tag} to={`/${locale}/stories?tag=${encodeURIComponent(tag)}`}>#{tag}</TransitionLink>
            ))}
          </div>
        ) : null}
      </header>

      <Reveal className="article-cover container">
        <img src={story.cover.src} alt={story.cover.alt[contentLocale]} fetchPriority="high" />
      </Reveal>

      <div className="article-layout container">
        <aside className="article-aside">
          <div className="article-aside-sticky">
            <button type="button" onClick={share} aria-label={t.article.share}>
              <Link2 aria-hidden="true" />
              <span>{copied ? (locale === "zh" ? "已复制" : "Copied") : t.article.share}</span>
            </button>
            {headings.length > 1 ? (
              <nav className="article-toc" aria-label={t.article.contents}>
                <p>{t.article.contents}</p>
                {headings.map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.title}</a>)}
              </nav>
            ) : null}
          </div>
        </aside>
        <Reveal className="article-body">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children, ...props }) => <h2 id={slugifyHeading(String(children))} {...props}>{children}</h2>,
              img: ({ alt = "", ...props }) => <img {...props} alt={alt} loading="lazy" />,
              a: ({ href, ...props }) => (
                <a {...props} href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined} />
              ),
            }}
          >
            {story.body[contentLocale]}
          </Markdown>
        </Reveal>
      </div>

      {relatedStories.length ? (
        <Reveal as="section" className="related-stories container">
          <div className="related-stories-head">
            <span>RELATED / 03</span>
            <h2>{locale === "zh" ? "相关文章" : "Related stories"}</h2>
          </div>
          <div className="related-stories-grid">
            {relatedStories.map((related) => (
              <TransitionLink key={related.slug} to={`/${locale}/stories/${related.slug}`}>
                <img src={related.cover.src} alt={related.cover.alt[locale]} loading="lazy" />
                <p>{getCategoryName(related.categoryId, locale)}</p>
                <h3>{related.title[locale]}</h3>
                <ArrowUpRight aria-hidden="true" />
              </TransitionLink>
            ))}
          </div>
        </Reveal>
      ) : null}

      <Reveal as="section" className="next-story">
        <TransitionLink className="container next-story-link" to={`/${locale}/stories/${nextStory.slug}`}>
          <div>
            <span className="eyebrow">{t.article.next}</span>
            <h2>{nextStory.title[locale]}</h2>
          </div>
          <ArrowRight aria-hidden="true" />
        </TransitionLink>
      </Reveal>
    </article>
  );
}
