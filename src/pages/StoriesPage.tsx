import { ArrowUpRight } from "lucide-react";
import { useDeferredValue } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { TransitionLink } from "../components/AppProviders";
import { useLocale } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { categories, getCategory, getCategoryName } from "../categories";
import { copy, formatDate, stories } from "../content";
import { NotFoundPage } from "./NotFoundPage";
import { usePageMeta } from "./usePageMeta";
import { stripMarkdown } from "../articles";

export function StoriesPage() {
  const locale = useLocale();
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const series = searchParams.get("series") ?? "";
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const t = copy[locale];
  const selectedCategory = getCategory(categoryId);
  const categoryStories = selectedCategory
    ? stories.filter((story) => story.categoryId === selectedCategory.id)
    : stories;
  const filteredStories = categoryStories.filter((story) => {
    if (tag && !story.tags[locale].includes(tag)) return false;
    if (series && story.series[locale] !== series) return false;
    return deferredQuery
      ? [
        story.title[locale],
        story.summary[locale],
        stripMarkdown(story.body[locale]),
        getCategoryName(story.categoryId, locale),
        story.tags[locale].join(" "),
        story.series[locale] ?? "",
      ].join(" ").toLocaleLowerCase().includes(deferredQuery)
      : true;
  });
  const pageTitle = selectedCategory
    ? `${selectedCategory.name[locale]}${locale === "zh" ? "文章" : " Stories"}`
    : t.storiesPage.title;
  const pageIntro = selectedCategory?.description[locale] ?? t.storiesPage.intro;
  const filterSuffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const activeFilterTitle = query
    ? `${t.search.results} “${query}”`
    : tag
      ? `#${tag}`
      : series
        ? `${locale === "zh" ? "系列" : "Series"} · ${series}`
        : selectedCategory?.name[locale] ?? t.sections.allStories;
  usePageMeta(`${pageTitle} — Omni Journal`, pageIntro, { locale });

  if (categoryId && !selectedCategory) return <NotFoundPage />;

  return (
    <div className="inner-page container">
      <header className="page-hero">
        <p className="eyebrow">
          {selectedCategory ? `CATEGORY / ${selectedCategory.name.en.toUpperCase()}` : t.storiesPage.eyebrow}
        </p>
        <h1><span>{pageTitle}</span></h1>
        <p className="page-intro">{pageIntro}</p>
      </header>

      <section className="stories-index" aria-labelledby="stories-index-title">
        <nav className="category-nav" aria-label={locale === "zh" ? "文章分类" : "Story categories"}>
          <TransitionLink
            to={`/${locale}/stories${filterSuffix}`}
            className={!selectedCategory ? "category-link is-active" : "category-link"}
            aria-current={!selectedCategory ? "page" : undefined}
          >
            {t.storiesPage.allCategories}
          </TransitionLink>
          {categories.map((category) => {
            const active = selectedCategory?.id === category.id;
            return (
              <TransitionLink
                key={category.id}
                to={`/${locale}/stories/category/${category.id}${filterSuffix}`}
                className={active ? "category-link is-active" : "category-link"}
                aria-current={active ? "page" : undefined}
              >
                {category.name[locale]}
              </TransitionLink>
            );
          })}
        </nav>
        <div className="stories-index-head">
          <div>
            <h2 id="stories-index-title">
              {activeFilterTitle}
            </h2>
            {query || tag || series ? (
              <TransitionLink
                className="search-filter-clear"
                to={selectedCategory
                  ? `/${locale}/stories/category/${selectedCategory.id}`
                  : `/${locale}/stories`}
              >
                {locale === "zh" ? "清除筛选" : "Clear filters"}
              </TransitionLink>
            ) : null}
          </div>
          <span>
            {query || tag || series
              ? `${String(filteredStories.length).padStart(2, "0")} ${t.storiesPage.resultCount}`
              : `${String(filteredStories.length).padStart(2, "0")} / 2026`}
          </span>
        </div>
        {filteredStories.map((story, index) => (
          <Reveal as="article" key={story.slug} delay={Math.min(index * 45, 180)}>
            <TransitionLink className="index-story" to={`/${locale}/stories/${story.slug}`}>
              <div className="index-story-date">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <time dateTime={story.date}>{formatDate(story.date, locale)}</time>
              </div>
              <div className="index-story-copy">
                <p>{getCategoryName(story.categoryId, locale)} / {story.readTime[locale]}</p>
                <h3>{story.title[locale]}</h3>
                <span>{story.summary[locale]}</span>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </TransitionLink>
          </Reveal>
        ))}
        {filteredStories.length === 0 ? (
          <p className="empty-category">{query || tag || series ? t.storiesPage.noResults : t.storiesPage.empty}</p>
        ) : null}
      </section>
    </div>
  );
}
