export type MarkdownImport = {
  title: string;
  category: string | null;
  content: string;
};

export type MarkdownHeading = {
  id: string;
  level: 2 | 3;
  text: string;
};

function plainHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/\\([\\`*_[\]{}()#+.!-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function headingId(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-") || "section";
}

export function extractMarkdownHeadings(source: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const duplicateCounts = new Map<string, number>();
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let fence: { marker: string; length: number } | null = null;

  const addHeading = (level: 2 | 3, rawText: string) => {
    const text = plainHeadingText(rawText.replace(/\s+#+\s*$/, ""));
    if (!text) return;
    const baseId = headingId(text);
    const count = (duplicateCounts.get(baseId) ?? 0) + 1;
    duplicateCounts.set(baseId, count);
    headings.push({ id: count === 1 ? baseId : `${baseId}-${count}`, level, text });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length };
      } else if (fence.marker === marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const atxHeading = line.match(/^ {0,3}(#{2,3})(?:[ \t]+|$)(.*)$/);
    if (atxHeading) {
      addHeading(atxHeading[1].length as 2 | 3, atxHeading[2]);
      continue;
    }

    if (
      line.trim()
      && index + 1 < lines.length
      && /^ {0,3}-{2,}\s*$/.test(lines[index + 1])
    ) {
      addHeading(2, line);
      index += 1;
    }
  }

  return headings;
}

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
