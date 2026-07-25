import { describe, expect, it } from "vitest";
import { parseMarkdownImport } from "./markdown";

describe("parseMarkdownImport", () => {
  it("reads title and category frontmatter and removes the duplicate heading", () => {
    expect(parseMarkdownImport("ignored.md", [
      "---",
      'title: "导入的文章"',
      "category: 技术",
      "---",
      "# 导入的文章",
      "",
      "正文内容。",
    ].join("\n"))).toEqual({
      title: "导入的文章",
      category: "技术",
      content: "正文内容。",
    });
  });

  it("uses the first heading or file name without discarding other headings", () => {
    expect(parseMarkdownImport("my-notes.markdown", "# 第一篇\n\n## 小节\n\n内容").title)
      .toBe("第一篇");
    expect(parseMarkdownImport("my-notes.markdown", "没有一级标题").title)
      .toBe("my notes");
    expect(parseMarkdownImport("my-notes.md", "---\ntitle: 页面标题\n---\n# 正文章节").content)
      .toBe("# 正文章节");
  });
});
