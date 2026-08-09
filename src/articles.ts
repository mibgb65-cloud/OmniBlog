import { parse } from "yaml";
import { getCategory, type CategoryId } from "./categories";
import type { Locale } from "./content";

type ArticleFrontmatter = {
  slug: string;
  locale: Locale;
  date: string;
  category: string;
  readMinutes: number;
  title: string;
  summary: string;
  cover: string;
  coverAlt: string;
  tags?: string[];
  series?: string;
};

type LocalizedText = Record<Locale, string>;

export type Story = {
  slug: string;
  date: string;
  categoryId: CategoryId;
  readTime: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  body: LocalizedText;
  tags: Record<Locale, string[]>;
  series: Record<Locale, string | null>;
  availableLocales: Locale[];
  cover: {
    src: string;
    alt: LocalizedText;
  };
};

type StoryDraft = {
  slug: string;
  date: string;
  categoryId: CategoryId;
  readMinutes: number;
  title: Partial<LocalizedText>;
  summary: Partial<LocalizedText>;
  body: Partial<LocalizedText>;
  coverSrc: string;
  coverAlt: Partial<LocalizedText>;
  tags: Partial<Record<Locale, string[]>>;
  series: Partial<Record<Locale, string>>;
};

const articleFiles = import.meta.glob("../content/articles/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function parseArticleFile(source: string, filePath: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing YAML front matter in ${filePath}`);

  const frontmatter = parse(match[1]) as Partial<ArticleFrontmatter>;
  const required = ["slug", "locale", "date", "category", "title", "summary", "cover", "coverAlt"] as const;
  for (const field of required) {
    if (!frontmatter[field]) throw new Error(`Missing ${field} in ${filePath}`);
  }
  if (frontmatter.locale !== "zh" && frontmatter.locale !== "en") {
    throw new Error(`Invalid locale in ${filePath}`);
  }
  if (!getCategory(frontmatter.category)) {
    throw new Error(`Unknown category '${frontmatter.category}' in ${filePath}`);
  }
  if (!Number.isFinite(frontmatter.readMinutes)) {
    throw new Error(`Invalid readMinutes in ${filePath}`);
  }
  if (frontmatter.tags && (!Array.isArray(frontmatter.tags) || frontmatter.tags.some((tag) => typeof tag !== "string"))) {
    throw new Error(`Invalid tags in ${filePath}`);
  }
  if (frontmatter.series && typeof frontmatter.series !== "string") {
    throw new Error(`Invalid series in ${filePath}`);
  }

  return {
    meta: frontmatter as ArticleFrontmatter,
    body: match[2].trim(),
  };
}

function buildStories(): Story[] {
  const drafts = new Map<string, StoryDraft>();

  for (const [filePath, source] of Object.entries(articleFiles)) {
    const { meta, body } = parseArticleFile(source, filePath);
    const locale = meta.locale;
    const existing = drafts.get(meta.slug) ?? {
      slug: meta.slug,
      date: meta.date,
      categoryId: meta.category as CategoryId,
      readMinutes: meta.readMinutes,
      title: {},
      summary: {},
      body: {},
      coverSrc: meta.cover,
      coverAlt: {},
      tags: {},
      series: {},
    };

    if (existing.date !== meta.date || existing.categoryId !== meta.category || existing.coverSrc !== meta.cover) {
      throw new Error(`Localized metadata does not match for '${meta.slug}'`);
    }
    existing.title[locale] = meta.title;
    existing.summary[locale] = meta.summary;
    existing.body[locale] = body;
    existing.coverAlt[locale] = meta.coverAlt;
    existing.tags[locale] = meta.tags ?? [];
    if (meta.series) existing.series[locale] = meta.series;
    drafts.set(meta.slug, existing);
  }

  return [...drafts.values()]
    .map((draft) => {
      const availableLocales = (["zh", "en"] as const).filter((locale) =>
        Boolean(draft.title[locale] && draft.summary[locale] && draft.body[locale] && draft.coverAlt[locale]),
      );
      if (availableLocales.length === 0) throw new Error(`Article '${draft.slug}' has no complete locale`);
      const fallbackLocale = availableLocales.includes("zh") ? "zh" : availableLocales[0];
      const localizedText = (value: Partial<LocalizedText>): LocalizedText => ({
        zh: value.zh ?? value[fallbackLocale]!,
        en: value.en ?? value[fallbackLocale]!,
      });
      const localizedTags: Record<Locale, string[]> = {
        zh: draft.tags.zh ?? draft.tags[fallbackLocale] ?? [],
        en: draft.tags.en ?? draft.tags[fallbackLocale] ?? [],
      };
      return {
        slug: draft.slug,
        date: draft.date,
        categoryId: draft.categoryId,
        readTime: {
          zh: `${draft.readMinutes} 分钟阅读`,
          en: `${draft.readMinutes} min read`,
        },
        title: localizedText(draft.title),
        summary: localizedText(draft.summary),
        body: localizedText(draft.body),
        tags: localizedTags,
        series: {
          zh: draft.series.zh ?? draft.series[fallbackLocale] ?? null,
          en: draft.series.en ?? draft.series[fallbackLocale] ?? null,
        },
        availableLocales,
        cover: {
          src: draft.coverSrc,
          alt: localizedText(draft.coverAlt),
        },
      } satisfies Story;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const stories = buildStories();

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHeadings(markdown: string) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    title: match[1].trim(),
    id: slugifyHeading(match[1]),
  }));
}

export function slugifyHeading(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-");
}
