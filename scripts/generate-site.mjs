import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articleDir = path.join(projectRoot, "content", "articles");
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");
const site = JSON.parse(await readFile(path.join(projectRoot, "content", "site.json"), "utf8"));
const categories = JSON.parse(await readFile(path.join(projectRoot, "content", "categories.json"), "utf8"));
const buildStaticPages = process.argv.includes("--static");

function parseArticle(source, filename) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing YAML front matter in ${filename}`);
  return { ...parse(match[1]), body: match[2].trim() };
}

const filenames = (await readdir(articleDir)).filter((filename) => filename.endsWith(".md"));
const articles = await Promise.all(
  filenames.map(async (filename) => parseArticle(await readFile(path.join(articleDir, filename), "utf8"), filename)),
);
articles.sort((a, b) => b.date.localeCompare(a.date));

const localized = new Map();
for (const article of articles) {
  const entry = localized.get(article.slug) ?? {};
  entry[article.locale] = article;
  localized.set(article.slug, entry);
}
const absoluteUrl = (route) => new URL(route, `${site.siteUrl.replace(/\/$/, "")}/`).toString();
const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");
const escapeHtml = escapeXml;

const routePairs = [
  { zh: "/zh", en: "/en" },
  { zh: "/zh/stories", en: "/en/stories" },
  { zh: "/zh/about", en: "/en/about" },
  ...categories.map((category) => ({
    zh: `/zh/stories/category/${category.id}`,
    en: `/en/stories/category/${category.id}`,
  })),
];

const sitemapEntries = [
  ...routePairs.flatMap((pair) => [
  { loc: pair.zh, alternate: pair.en, lang: "zh", alternateLang: "en", lastmod: pair.lastmod },
  { loc: pair.en, alternate: pair.zh, lang: "en", alternateLang: "zh", lastmod: pair.lastmod },
  ]),
  ...[...localized.values()].flatMap((article) => {
    const available = [article.zh, article.en].filter(Boolean);
    return available.map((entry) => {
      const alternate = entry.locale === "zh" ? article.en : article.zh;
      return {
        loc: `/${entry.locale}/stories/${entry.slug}`,
        alternate: alternate ? `/${alternate.locale}/stories/${alternate.slug}` : undefined,
        lang: entry.locale,
        alternateLang: alternate?.locale,
        lastmod: entry.date,
      };
    });
  }),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapEntries.map((entry) => `  <url>
    <loc>${escapeXml(absoluteUrl(entry.loc))}</loc>
    <xhtml:link rel="alternate" hreflang="${entry.lang}" href="${escapeXml(absoluteUrl(entry.loc))}" />${entry.alternate ? `
    <xhtml:link rel="alternate" hreflang="${entry.alternateLang}" href="${escapeXml(absoluteUrl(entry.alternate))}" />` : ""}${entry.lastmod ? `
    <lastmod>${entry.lastmod}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>
`;

const chineseArticles = articles.filter((article) => article.locale === "zh");
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(absoluteUrl("/zh"))}</link>
    <description>${escapeXml(site.description.zh)}</description>
    <language>zh-CN</language>
${chineseArticles.map((article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(absoluteUrl(`/zh/stories/${article.slug}`))}</link>
      <guid>${escapeXml(absoluteUrl(`/zh/stories/${article.slug}`))}</guid>
      <pubDate>${new Date(`${article.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(article.summary)}</description>
    </item>`).join("\n")}
  </channel>
</rss>
`;

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, "rss.xml"), rss);
await writeFile(path.join(publicDir, "sitemap.xml"), sitemap);
await writeFile(path.join(publicDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`);

if (buildStaticPages) {
  const originalHtml = await readFile(path.join(distDir, "index.html"), "utf8");
  const analyticsToken = site.analytics?.cloudflareToken?.trim();
  const analyticsScript = analyticsToken
    ? `\n    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: analyticsToken })}'></script>`
    : "";
  const baseHtml = analyticsScript ? originalHtml.replace("</body>", `${analyticsScript}\n  </body>`) : originalHtml;
  if (analyticsScript) await writeFile(path.join(distDir, "index.html"), baseHtml);
  const pages = [];
  const addPage = (route, locale, title, description, options = {}) => {
    const otherLocale = locale === "zh" ? "en" : "zh";
    const alternateRoute = route.replace(/^\/(zh|en)(?=\/|$)/, `/${otherLocale}`);
    pages.push({ route, locale, title, description, alternateRoute, ...options });
  };

  addPage("/zh", "zh", `万象志 — ${site.title}`, site.description.zh);
  addPage("/en", "en", site.title, site.description.en);
  addPage("/zh/stories", "zh", `文章存档 — ${site.title}`, "按时间与分类浏览所有文章。 ");
  addPage("/en/stories", "en", `Archive — ${site.title}`, "Browse every story by time and category.");
  addPage("/zh/about", "zh", `关于 — ${site.title}`, site.description.zh);
  addPage("/en/about", "en", `About — ${site.title}`, site.description.en);

  for (const category of categories) {
    addPage(`/zh/stories/category/${category.id}`, "zh", `${category.name.zh}文章 — ${site.title}`, category.description.zh);
    addPage(`/en/stories/category/${category.id}`, "en", `${category.name.en} Stories — ${site.title}`, category.description.en);
  }
  for (const article of articles) {
    const counterpart = localized.get(article.slug)?.[article.locale === "zh" ? "en" : "zh"];
    addPage(
      `/${article.locale}/stories/${article.slug}`,
      article.locale,
      `${article.title} — ${site.title}`,
      article.summary,
      {
        type: "article",
        image: article.cover,
        publishedAt: article.date,
        keywords: article.tags,
        alternateRoute: counterpart ? `/${counterpart.locale}/stories/${counterpart.slug}` : null,
      },
    );
  }

  for (const page of pages) {
    const canonical = absoluteUrl(page.route);
    const image = page.image ? absoluteUrl(page.image) : undefined;
    const schema = {
      "@context": "https://schema.org",
      "@type": page.type === "article" ? "BlogPosting" : "WebPage",
      headline: page.title,
      description: page.description,
      url: canonical,
      inLanguage: page.locale === "zh" ? "zh-CN" : "en",
      ...(image ? { image } : {}),
      ...(page.publishedAt ? { datePublished: page.publishedAt, author: { "@type": "Person", name: site.author } } : {}),
      ...(page.keywords?.length ? { keywords: page.keywords } : {}),
    };
    const meta = `
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" hreflang="${page.locale}" href="${escapeHtml(canonical)}" />${page.alternateRoute ? `
    <link rel="alternate" hreflang="${page.locale === "zh" ? "en" : "zh"}" href="${escapeHtml(absoluteUrl(page.alternateRoute))}" />` : ""}
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:type" content="${page.type === "article" ? "article" : "website"}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:site_name" content="${escapeHtml(site.title)}" />
    <meta property="og:locale" content="${page.locale === "zh" ? "zh_CN" : "en_US"}" />${image ? `
    <meta property="og:image" content="${escapeHtml(image)}" />` : ""}${page.publishedAt ? `
    <meta property="article:published_time" content="${page.publishedAt}" />` : ""}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />${image ? `
    <meta name="twitter:image" content="${escapeHtml(image)}" />` : ""}
    <script id="page-structured-data" type="application/ld+json">${JSON.stringify(schema)}</script>`;

    const output = baseHtml
      .replace(/<html lang="[^"]+">/, `<html lang="${page.locale === "zh" ? "zh-CN" : "en"}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
      .replace("</head>", `${meta}\n  </head>`);
    const segments = page.route.slice(1).split("/");
    const filename = `${segments.pop()}.html`;
    const directory = path.join(distDir, ...segments);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), output);
  }
}

console.log(`Generated ${localized.size} articles${buildStaticPages ? " and static SEO pages" : ""}.`);
