export type MarkdownImport = {
  title: string;
  category: string | null;
  content: string;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseMarkdownImport(fileName: string, source: string): MarkdownImport {
  let content = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let frontmatterTitle = "";
  let category: string | null = null;
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (frontmatter) {
    for (const line of frontmatter[1].split("\n")) {
      const entry = line.match(/^([a-zA-Z][\w-]*):\s*(.+)$/);
      if (!entry) continue;
      const key = entry[1].toLowerCase();
      if (key === "title") frontmatterTitle = unquote(entry[2]);
      if (key === "category") category = unquote(entry[2]) || null;
    }
    content = content.slice(frontmatter[0].length);
  }

  const heading = content.match(/^#\s+(.+?)\s*#*\s*$/m);
  const headingTitle = heading?.[1].trim() ?? "";
  const fallbackTitle =
    fileName.replace(/\.(?:md|markdown)$/i, "").replace(/[-_]+/g, " ").trim() || "未命名文章";
  const title = frontmatterTitle || headingTitle || fallbackTitle;

  if (heading?.index !== undefined && headingTitle === title) {
    content = `${content.slice(0, heading.index)}${content.slice(heading.index + heading[0].length)}`
      .replace(/^\n+/, "");
  }

  return {
    title,
    category,
    content: content.trim(),
  };
}
