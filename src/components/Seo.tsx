import { useEffect } from "react";

type SeoProps = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
  publishedAt?: string | null;
  modifiedAt?: string | null;
  authorName?: string;
  noIndex?: boolean;
};

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function removeMeta(attribute: "name" | "property", key: string) {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

export function Seo({
  title,
  description,
  path,
  type = "website",
  image,
  publishedAt,
  modifiedAt,
  authorName,
  noIndex = false,
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = new URL(path, window.location.origin).toString();
    const imageUrl = image ? new URL(image, window.location.origin).toString() : "";
    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:site_name", "OmniBlog");
    setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    if (imageUrl) {
      setMeta("property", "og:image", imageUrl);
      setMeta("name", "twitter:image", imageUrl);
    } else {
      removeMeta("property", "og:image");
      removeMeta("name", "twitter:image");
    }
    if (publishedAt) setMeta("property", "article:published_time", publishedAt);
    else removeMeta("property", "article:published_time");
    if (modifiedAt) setMeta("property", "article:modified_time", modifiedAt);
    else removeMeta("property", "article:modified_time");
    if (authorName) setMeta("property", "article:author", authorName);
    else removeMeta("property", "article:author");

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const structuredData = document.createElement("script");
    structuredData.id = "page-structured-data";
    structuredData.type = "application/ld+json";
    structuredData.text = JSON.stringify(type === "article" ? {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description,
      url: canonicalUrl,
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(publishedAt ? { datePublished: publishedAt } : {}),
      ...(modifiedAt ? { dateModified: modifiedAt } : {}),
      ...(authorName ? { author: { "@type": "Person", name: authorName } } : {}),
    } : {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "OmniBlog",
      url: window.location.origin,
      description,
    });
    document.getElementById(structuredData.id)?.remove();
    document.head.appendChild(structuredData);

    return () => {
      structuredData.remove();
    };
  }, [authorName, description, image, modifiedAt, noIndex, path, publishedAt, title, type]);

  return null;
}
