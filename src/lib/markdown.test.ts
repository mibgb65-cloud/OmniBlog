import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings, parseMarkdownImport } from "./markdown";

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

describe("extractMarkdownHeadings", () => {
  it("builds stable H2 and H3 anchors for Chinese and duplicate headings", () => {
    expect(extractMarkdownHeadings([
      "## 为什么开始",
      "### **第一个**答案",
      "## 为什么开始",
      "章节链接",
      "---",
    ].join("\n"))).toEqual([
      { id: "为什么开始", level: 2, text: "为什么开始" },
      { id: "第一个答案", level: 3, text: "第一个答案" },
      { id: "为什么开始-2", level: 2, text: "为什么开始" },
      { id: "章节链接", level: 2, text: "章节链接" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    expect(extractMarkdownHeadings([
      "```md",
      "## 代码里的标题",
      "```",
      "## 正文标题",
    ].join("\n"))).toEqual([
      { id: "正文标题", level: 2, text: "正文标题" },
    ]);
  });
});
