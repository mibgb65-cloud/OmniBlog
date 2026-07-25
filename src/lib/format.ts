export function formatDate(value: string | null): string {
  if (!value) return "未发布";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function readingTime(content: string): string {
  const count = content.replace(/\s/g, "").length;
  return `${Math.max(1, Math.ceil(count / 400))} 分钟阅读`;
}

