import { useEffect } from "react";
import site from "../../content/site.json";
import type { Locale } from "../content";

type PageMetaOptions = {
  path?: string;
  locale?: Locale;
  image?: string;
  type?: "website" | "article";
  publishedAt?: string;
  noIndex?: boolean;
  hasAlternate?: boolean;
};

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function removeMeta(attribute: "name" | "property", key: string) {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

function setLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.append(element);
  }
  element.href = href;
}

export function usePageMeta(title: string, description?: string, options: PageMetaOptions = {}) {
  const { hasAlternate = true, image, locale, noIndex = false, path, publishedAt, type = "website" } = options;

  useEffect(() => {
    const currentPath = path ?? `${window.location.pathname}`;
    const canonical = new URL(currentPath, site.siteUrl).toString();
    const pageDescription = description ?? site.description[locale ?? "zh"];
    const imageUrl = image ? new URL(image, site.siteUrl).toString() : undefined;

    document.title = title;
    setMeta("name", "description", pageDescription);
    setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", pageDescription);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:site_name", site.title);
    setMeta("property", "og:locale", locale === "en" ? "en_US" : "zh_CN");
    setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", pageDescription);
    if (imageUrl) {
      setMeta("property", "og:image", imageUrl);
      setMeta("name", "twitter:image", imageUrl);
    } else {
      removeMeta("property", "og:image");
      removeMeta("name", "twitter:image");
    }
    if (publishedAt) setMeta("property", "article:published_time", publishedAt);
    else removeMeta("property", "article:published_time");
    setLink("canonical", canonical);

    if (locale) {
      const otherLocale = locale === "zh" ? "en" : "zh";
      const alternatePath = currentPath.replace(/^\/(zh|en)(?=\/|$)/, `/${otherLocale}`);
      setLink("alternate", new URL(currentPath, site.siteUrl).toString(), locale);
      if (hasAlternate) setLink("alternate", new URL(alternatePath, site.siteUrl).toString(), otherLocale);
      else document.head.querySelector(`link[rel="alternate"][hreflang="${otherLocale}"]`)?.remove();
    }

    const schema = {
      "@context": "https://schema.org",
      "@type": type === "article" ? "BlogPosting" : "WebPage",
      headline: title,
      description: pageDescription,
      url: canonical,
      inLanguage: locale === "en" ? "en" : "zh-CN",
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(publishedAt ? { datePublished: publishedAt, author: { "@type": "Person", name: site.author } } : {}),
    };
    let script = document.head.querySelector<HTMLScriptElement>("#page-structured-data");
    if (!script) {
      script = document.createElement("script");
      script.id = "page-structured-data";
      script.type = "application/ld+json";
      document.head.append(script);
    }
    script.textContent = JSON.stringify(schema);
  }, [description, hasAlternate, image, locale, noIndex, path, publishedAt, title, type]);
}
